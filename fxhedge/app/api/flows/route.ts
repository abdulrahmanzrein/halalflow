import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseFlowInput } from "@/lib/flows/flow";
import type { Flow } from "@/types/flow";

/**
 * GET  /api/flows — list the signed-in user's flows, newest first.
 * POST /api/flows — create one. RLS (auth.uid()) enforces ownership;
 * the service-role key is never used here.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("flows")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json(data as Flow[]);
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseFlowInput(body);
  if (!parsed) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Invalid flow: need direction 'outgoing' or 'incoming', amount>0, distinct 3-letter currency and home_currency, invoiced_on and due_on as real YYYY-MM-DD dates, and due_on within a year of invoiced_on",
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("flows")
    .insert({ ...parsed, user_id: user.id })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json(data as Flow, { status: 201 });
}
