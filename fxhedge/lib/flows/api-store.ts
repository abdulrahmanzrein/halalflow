/** lib/flows/api-store.ts — the Supabase-backed store, reached over /api/flows. */
import type { Flow, FlowInput } from "@/types/flow";
import type { FlowStore } from "./store";

async function failure(res: Response): Promise<never> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  throw new Error(body?.error ?? `Request failed (${res.status})`);
}

export function createApiStore(): FlowStore {
  return {
    async list() {
      const res = await fetch("/api/flows");
      if (!res.ok) return failure(res);
      return (await res.json()) as Flow[];
    },
    async create(input: FlowInput) {
      const res = await fetch("/api/flows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) return failure(res);
      return (await res.json()) as Flow;
    },
    async remove(id: string) {
      const res = await fetch(`/api/flows/${id}`, { method: "DELETE" });
      if (!res.ok) await failure(res);
    },
  };
}
