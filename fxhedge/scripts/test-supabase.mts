/**
 * Live connection test against the Supabase project.
 * Run: cd fxhedge && npx tsx scripts/test-supabase.ts
 * Verifies: credentials -> schema exists -> signup -> trigger -> RLS isolation.
 * All output redacts tokens/keys. Test user is deleted at the end (service role).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// Minimal .env.local parser (avoids needing dotenv)
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon || !service || anon.startsWith("PASTE") || service.startsWith("PASTE")) {
  console.error("FAIL: missing or placeholder values in .env.local");
  process.exit(1);
}

const stamp = Date.now();
const emailA = `test-a-${stamp}@example.com`;
const emailB = `test-b-${stamp}@example.com`;
const password = "test-password-123";

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail == null ? "" : `  -> ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

const anonClient = createClient(url, anon);
const admin = createClient(url, service);

// 1. Schema exists (service role bypasses RLS)
const schema = await admin.from("profiles").select("user_id").limit(1);
check("schema: profiles table reachable", !schema.error, schema.error?.message);
const flows = await admin.from("flows").select("id").limit(1);
check("schema: flows table reachable", !flows.error, flows.error?.message);

// 2. Create confirmed user A via admin API (independent of the project's
//    email-confirmation setting; the on_auth_user_created trigger still fires)
const a = await admin.auth.admin.createUser({
  email: emailA,
  password,
  email_confirm: true,
});
check("auth: create user A", !a.error && !!a.data?.user, a.error?.message);
const uidA = a.data?.user?.id;
if (!uidA) process.exit(1);

// 3. Trigger auto-created the profile row
await new Promise((r) => setTimeout(r, 1500)); // trigger is async-ish
const profA = await admin.from("profiles").select("*").eq("user_id", uidA).maybeSingle();
check("trigger: profile row auto-created", !!profA.data, profA.error?.message);

// 4. RLS: user A session can upsert their own profile
const signInA = await anonClient.auth.signInWithPassword({ email: emailA, password });
check("auth: user A sign-in", !signInA.error && !!signInA.data.session, signInA.error?.message);
const aSession = createClient(url, anon, {
  global: { headers: { Authorization: `Bearer ${signInA.data.session!.access_token}` } },
});
const up = await aSession
  .from("profiles")
  .update({ business_name: "Aisha's Halal Imports", invoice_amount: 12000, target_margin: 10, days_until_due: 21 })
  .eq("user_id", uidA);
check("RLS: owner can update own profile", !up.error, up.error?.message);

// 5. User B cannot read or write A's profile
await anonClient.auth.signOut();
const b = await admin.auth.admin.createUser({
  email: emailB,
  password,
  email_confirm: true,
});
check("auth: create user B", !b.error && !!b.data?.user, b.error?.message);
const signInB = await anonClient.auth.signInWithPassword({ email: emailB, password });
const bSession = createClient(url, anon, {
  global: { headers: { Authorization: `Bearer ${signInB.data.session!.access_token}` } },
});
const crossRead = await bSession.from("profiles").select("*").eq("user_id", uidA);
check(
  "RLS: user B cannot read user A's profile",
  !crossRead.error && (crossRead.data?.length ?? 0) === 0,
  crossRead.error ?? crossRead.data,
);
const crossWrite = await bSession
  .from("profiles")
  .update({ business_name: "hacked" })
  .eq("user_id", uidA);
check("RLS: user B's write to user A's row is a no-op", !crossWrite.error, crossWrite.error?.message);

// Prove isolation: A's business_name must still be the value A wrote
const afterAttack = await admin.from("profiles").select("business_name").eq("user_id", uidA).maybeSingle();
check(
  "RLS: user A's data unchanged after user B's write attempt",
  afterAttack.data?.business_name === "Aisha's Halal Imports",
  afterAttack.data,
);

// 6. Cleanup (service role, bypasses RLS)
await admin.auth.admin.deleteUser(uidA);
if (b.data?.user?.id) await admin.auth.admin.deleteUser(b.data.user.id);
console.log("cleanup: test users deleted");

console.log(failures === 0 ? "\nALL CHECKS PASSED ✅" : `\n${failures} CHECK(S) FAILED ❌`);
process.exit(failures === 0 ? 0 : 1);
