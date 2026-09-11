import { describe, expect, it, beforeEach } from "vitest";
import {
  createLocalStore,
  readLegacyInvoices,
  clearLegacyInvoices,
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

  it("drops malformed entries instead of crashing on them", async () => {
    // A parseable array whose entries are junk is the path that actually
    // throws — sorting calls created_at on every element.
    storage.setItem(
      KEY_FLOWS,
      JSON.stringify([
        null,
        { id: "no-dates" },
        {
          id: "good",
          direction: "outgoing",
          label: "Real",
          amount: 100,
          currency: "EUR",
          home_currency: "CAD",
          invoiced_on: "2026-09-01",
          due_on: "2026-09-22",
          created_at: "2026-09-01T00:00:00.000Z",
        },
      ]),
    );
    const flows = await createLocalStore(storage).list();
    expect(flows).toHaveLength(1);
    expect(flows[0].id).toBe("good");
  });
});

describe("legacy invoices", () => {
  const oldInvoice = {
    id: "old1",
    amount: 9000,
    from: "USD",
    to: "CAD",
    days: 30,
    invoicedOn: "2026-08-01",
    label: "Old invoice",
    savedAt: "2026-08-01T00:00:00.000Z",
  };

  it("converts old hedged: invoices into outgoing flows", () => {
    const storage = fakeStorage({
      "hedged:current-invoice": JSON.stringify(oldInvoice),
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

    const flows = readLegacyInvoices(storage);
    expect(flows).toHaveLength(2);
    expect(flows.every((f) => f.direction === "outgoing")).toBe(true);
    expect(flows[0].currency).toBe("USD");
    expect(flows[0].home_currency).toBe("CAD");
    expect(flows[0].invoiced_on).toBe("2026-08-01");
    // 30 days counted from the day the old record was last saved.
    expect(flows[0].due_on).toBe("2026-08-31");
  });

  it("anchors both dates on savedAt when the old record has no invoice date", () => {
    // JSON.stringify drops undefined keys, so this is a record without the field.
    const noDate = { ...oldInvoice, invoicedOn: undefined };
    const storage = fakeStorage({ "hedged:current-invoice": JSON.stringify(noDate) });
    const [flow] = readLegacyInvoices(storage);
    // Anchoring one end on today would let invoiced_on drift past due_on,
    // which parseFlowInput rejects as impossible.
    expect(flow.invoiced_on).toBe("2026-07-02"); // savedAt - 30 days
    expect(flow.due_on).toBe("2026-08-31");      // savedAt + 30 days
  });

  it("de-duplicates an invoice present in both legacy keys", () => {
    const storage = fakeStorage({
      "hedged:current-invoice": JSON.stringify(oldInvoice),
      "hedged:recent-invoices": JSON.stringify([oldInvoice]),
    });
    expect(readLegacyInvoices(storage)).toHaveLength(1);
  });

  it("reads without destroying, and clears only when asked", () => {
    const storage = fakeStorage({ "hedged:current-invoice": JSON.stringify(oldInvoice) });
    expect(readLegacyInvoices(storage)).toHaveLength(1);
    expect(readLegacyInvoices(storage)).toHaveLength(1); // reading is not destructive
    clearLegacyInvoices(storage);
    expect(readLegacyInvoices(storage)).toHaveLength(0);
  });

  it("migrates through the store and actually persists the result", async () => {
    const storage = fakeStorage({ "hedged:current-invoice": JSON.stringify(oldInvoice) });
    const flows = await createLocalStore(storage).list();
    expect(flows).toHaveLength(1);
    expect(flows[0].label).toBe("Old invoice");
    // Assert identity, not count: sampleFlow() is also one element, so a
    // write that silently persisted nothing would pass a length check.
    const again = await createLocalStore(storage).list();
    expect(again[0].label).toBe("Old invoice");
    expect(storage.getItem("hedged:current-invoice")).toBeNull();
  });

  it("keeps the legacy data when the write fails, rather than losing it", async () => {
    const storage = fakeStorage({ "hedged:current-invoice": JSON.stringify(oldInvoice) });
    storage.setItem = () => {
      throw new Error("quota exceeded");
    };

    const flows = await createLocalStore(storage).list();
    expect(flows[0].label).toBe("Old invoice"); // still usable for this session
    // The only copy survives, so the next load can retry the migration.
    expect(storage.getItem("hedged:current-invoice")).not.toBeNull();
  });

  it("does not clear the legacy keys when a converted record is unusable", async () => {
    // A legacy amount stored as a formatted string becomes NaN, which
    // JSON round-trips to null and fails isUsableFlow on the next read.
    const storage = fakeStorage({
      "hedged:current-invoice": JSON.stringify({ ...oldInvoice, amount: "9,000" }),
    });
    await createLocalStore(storage).list();
    expect(storage.getItem("hedged:current-invoice")).not.toBeNull();
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
