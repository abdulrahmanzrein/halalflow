import { describe, expect, it, beforeEach } from "vitest";
import {
  createLocalStore,
  migrateLegacy,
  readCurrentId,
  writeCurrentId,
  KEY_FLOWS,
} from "../flows/local-store";

/** In-memory Storage so these tests need no DOM environment. */
function fakeStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

describe("createLocalStore", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = fakeStorage();
  });

  it("seeds the sample flow on a fresh device", async () => {
    const store = createLocalStore(storage);
    const flows = await store.list();
    expect(flows).toHaveLength(1);
    expect(flows[0].direction).toBe("outgoing");
    expect(flows[0].currency).toBe("EUR");
  });

  it("creates a flow and returns it newest-first", async () => {
    const store = createLocalStore(storage);
    const created = await store.create({
      direction: "incoming",
      label: "German customer",
      amount: 5000,
      currency: "EUR",
      home_currency: "CAD",
      invoiced_on: "2026-09-01",
      due_on: "2026-10-01",
    });
    expect(created.id).toBeTruthy();
    expect(created.created_at).toBeTruthy();

    const flows = await store.list();
    expect(flows).toHaveLength(2);
    expect(flows[0].id).toBe(created.id);
  });

  it("removes a flow", async () => {
    const store = createLocalStore(storage);
    const created = await store.create({
      direction: "incoming",
      label: "German customer",
      amount: 5000,
      currency: "EUR",
      home_currency: "CAD",
      invoiced_on: "2026-09-01",
      due_on: "2026-10-01",
    });
    await store.remove(created.id);
    const flows = await store.list();
    expect(flows.find((f) => f.id === created.id)).toBeUndefined();
  });

  it("respects an explicitly emptied list instead of re-seeding", async () => {
    storage.setItem(KEY_FLOWS, JSON.stringify([]));
    const store = createLocalStore(storage);
    expect(await store.list()).toHaveLength(0);
  });

  it("survives corrupt JSON", async () => {
    storage.setItem(KEY_FLOWS, "{not json");
    const store = createLocalStore(storage);
    expect(await store.list()).toHaveLength(1); // falls back to the sample
  });
});

describe("migrateLegacy", () => {
  it("converts old hedged: invoices into outgoing flows", () => {
    const storage = fakeStorage({
      "hedged:current-invoice": JSON.stringify({
        id: "old1",
        amount: 9000,
        from: "USD",
        to: "CAD",
        days: 30,
        invoicedOn: "2026-08-01",
        label: "Old invoice",
        savedAt: "2026-08-01T00:00:00.000Z",
      }),
      "hedged:recent-invoices": JSON.stringify([
        {
          id: "old2",
          amount: 4000,
          from: "GBP",
          to: "CAD",
          days: 14,
          invoicedOn: "2026-07-01",
          label: "Older invoice",
          savedAt: "2026-07-01T00:00:00.000Z",
        },
      ]),
    });

    const flows = migrateLegacy(storage);
    expect(flows).toHaveLength(2);
    expect(flows.every((f) => f.direction === "outgoing")).toBe(true);
    expect(flows[0].currency).toBe("USD");
    expect(flows[0].home_currency).toBe("CAD");
    expect(flows[0].invoiced_on).toBe("2026-08-01");
    // 30 days counted from the day the old record was last saved.
    expect(flows[0].due_on).toBe("2026-08-31");
  });

  it("de-duplicates an invoice present in both legacy keys", () => {
    const inv = {
      id: "dup",
      amount: 1000,
      from: "EUR",
      to: "CAD",
      days: 21,
      invoicedOn: "2026-08-01",
      label: "Dup",
      savedAt: "2026-08-01T00:00:00.000Z",
    };
    const storage = fakeStorage({
      "hedged:current-invoice": JSON.stringify(inv),
      "hedged:recent-invoices": JSON.stringify([inv]),
    });
    expect(migrateLegacy(storage)).toHaveLength(1);
  });

  it("is idempotent — a second run finds nothing", () => {
    const storage = fakeStorage({
      "hedged:current-invoice": JSON.stringify({
        id: "old1",
        amount: 9000,
        from: "USD",
        to: "CAD",
        days: 30,
        invoicedOn: "2026-08-01",
        label: "Old invoice",
        savedAt: "2026-08-01T00:00:00.000Z",
      }),
    });
    expect(migrateLegacy(storage)).toHaveLength(1);
    expect(migrateLegacy(storage)).toHaveLength(0);
  });

  it("is used by the store so a returning user keeps their invoices", async () => {
    const storage = fakeStorage({
      "hedged:current-invoice": JSON.stringify({
        id: "old1",
        amount: 9000,
        from: "USD",
        to: "CAD",
        days: 30,
        invoicedOn: "2026-08-01",
        label: "Old invoice",
        savedAt: "2026-08-01T00:00:00.000Z",
      }),
    });
    const flows = await createLocalStore(storage).list();
    expect(flows).toHaveLength(1);
    expect(flows[0].label).toBe("Old invoice");
  });
});

describe("current id", () => {
  it("round-trips the selected flow id", () => {
    const storage = fakeStorage();
    expect(readCurrentId(storage)).toBeNull();
    writeCurrentId(storage, "abc");
    expect(readCurrentId(storage)).toBe("abc");
  });
});
