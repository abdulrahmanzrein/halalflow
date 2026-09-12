import { describe, expect, it } from "vitest";
import { migrateGuestFlows } from "../flows/migrate";
import { SAMPLE_FLOW_ID } from "../flows/flow";
import type { Flow, FlowInput } from "@/types/flow";
import type { FlowStore } from "../flows/store";

function flow(over: Partial<Flow> = {}): Flow {
  return {
    id: "local-1",
    direction: "outgoing",
    label: "Guest payable",
    amount: 9000,
    currency: "USD",
    home_currency: "CAD",
    invoiced_on: "2026-09-01",
    due_on: "2026-09-22",
    created_at: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

function memoryStore(seed: Flow[] = []): FlowStore & { rows: Flow[] } {
  const rows = [...seed];
  return {
    get rows() {
      return rows;
    },
    async list() {
      return [...rows];
    },
    async create(input: FlowInput) {
      const created: Flow = {
        ...input,
        id: `remote-${rows.length + 1}`,
        created_at: "2026-09-11T00:00:00.000Z",
      };
      rows.unshift(created);
      return created;
    },
    async remove(id: string) {
      const i = rows.findIndex((f) => f.id === id);
      if (i >= 0) rows.splice(i, 1);
    },
  };
}

describe("migrateGuestFlows", () => {
  it("uploads real guest flows onto an empty account and skips the sample", async () => {
    const local = memoryStore([
      flow({ id: SAMPLE_FLOW_ID, label: "Aisha sample" }),
      flow({ id: "typed", label: "Turkish supplier", amount: 5000, currency: "EUR" }),
    ]);
    const remote = memoryStore();

    const result = await migrateGuestFlows(local, remote);

    expect(result.uploaded).toBe(1);
    expect(remote.rows).toHaveLength(1);
    expect(remote.rows[0].label).toBe("Turkish supplier");
    expect(remote.rows[0].id).toBe("remote-1");
    expect(local.rows).toHaveLength(2);
  });

  it("does not upload onto an account that already has flows", async () => {
    const local = memoryStore([flow()]);
    const remote = memoryStore([flow({ id: "existing", label: "Already there" })]);

    const result = await migrateGuestFlows(local, remote);

    expect(result.uploaded).toBe(0);
    expect(remote.rows).toHaveLength(1);
    expect(remote.rows[0].id).toBe("existing");
  });

  it("uploads nothing when the guest only has the sample", async () => {
    const local = memoryStore([flow({ id: SAMPLE_FLOW_ID })]);
    const remote = memoryStore();
    expect(await migrateGuestFlows(local, remote)).toEqual({ uploaded: 0 });
    expect(remote.rows).toHaveLength(0);
  });

  it("stops on the first failed create so the next load can retry", async () => {
    const local = memoryStore([
      flow({ id: "a", label: "First" }),
      flow({ id: "b", label: "Second" }),
    ]);
    const remote: FlowStore = {
      list: async () => [],
      create: async () => {
        throw new Error("network");
      },
      remove: async () => {},
    };

    await expect(migrateGuestFlows(local, remote)).rejects.toThrow("network");
  });
});
