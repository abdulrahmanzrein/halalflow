import { describe, expect, it, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const from = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, from }),
}));

import { GET, POST } from "../route";
import { DELETE } from "../[id]/route";

/**
 * Supabase query builders are chainable and awaitable. A `then` on the chain
 * makes `await supabase.from(...).select(...).eq(...)` resolve to `result`.
 */
function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "insert", "delete"]) {
    c[m] = vi.fn(() => c);
  }
  c.single = vi.fn(async () => result);
  c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return c;
}

const signedIn = { data: { user: { id: "user-1" } } };
const signedOut = { data: { user: null } };

const validBody = {
  direction: "outgoing",
  label: "Turkish supplier",
  amount: 12000,
  currency: "EUR",
  home_currency: "CAD",
  invoiced_on: "2026-09-01",
  due_on: "2026-09-22",
};

function post(body: unknown) {
  return new Request("http://localhost/api/flows", {
    method: "POST",
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  getUser.mockReset();
  from.mockReset();
});

describe("GET /api/flows", () => {
  it("401s when signed out", async () => {
    getUser.mockResolvedValue(signedOut);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the user's flows", async () => {
    getUser.mockResolvedValue(signedIn);
    const rows = [{ id: "f1", direction: "outgoing" }];
    from.mockReturnValue(chain({ data: rows, error: null }));

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(rows);
    expect(from).toHaveBeenCalledWith("flows");
  });

  it("500s when the query fails", async () => {
    getUser.mockResolvedValue(signedIn);
    from.mockReturnValue(chain({ data: null, error: { message: "boom" } }));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/flows", () => {
  it("400s on invalid input before touching the database", async () => {
    const res = await POST(post({ ...validBody, amount: -1 }));
    expect(res.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("400s on a malformed body", async () => {
    const bad = new Request("http://localhost/api/flows", {
      method: "POST",
      body: "{not json",
    }) as unknown as Parameters<typeof POST>[0];
    expect((await POST(bad)).status).toBe(400);
  });

  it("401s when signed out", async () => {
    getUser.mockResolvedValue(signedOut);
    expect((await POST(post(validBody))).status).toBe(401);
  });

  it("creates the flow scoped to the user", async () => {
    getUser.mockResolvedValue(signedIn);
    const created = { id: "f9", ...validBody };
    const c = chain({ data: created, error: null });
    from.mockReturnValue(c);

    const res = await POST(post(validBody));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
    expect(c.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", direction: "outgoing" }),
    );
  });
});

describe("DELETE /api/flows/[id]", () => {
  const ctx = { params: Promise.resolve({ id: "f1" }) };

  it("401s when signed out", async () => {
    getUser.mockResolvedValue(signedOut);
    const res = await DELETE(new Request("http://localhost") as never, ctx);
    expect(res.status).toBe(401);
  });

  it("deletes only the caller's row", async () => {
    getUser.mockResolvedValue(signedIn);
    const c = chain({ data: null, error: null });
    from.mockReturnValue(c);

    const res = await DELETE(new Request("http://localhost") as never, ctx);
    expect(res.status).toBe(200);
    expect(c.eq).toHaveBeenCalledWith("id", "f1");
    expect(c.eq).toHaveBeenCalledWith("user_id", "user-1");
  });
});
