"use client";
/**
 * hooks/use-flows.ts — the ONLY place that decides which FlowStore is in play.
 * Signed in: Supabase over /api/flows. Signed out: localStorage.
 * Pages call this hook and never learn which backend answered.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Flow, FlowInput } from "@/types/flow";
import type { FlowStore } from "@/lib/flows/store";
import { createLocalStore, readCurrentId, writeCurrentId } from "@/lib/flows/local-store";
import { createApiStore } from "@/lib/flows/api-store";
import { pickCurrentFlow, sampleFlow } from "@/lib/flows/flow";
import { useUser } from "./use-user";

export interface UseFlowsResult {
  flows: Flow[];
  current: Flow;
  ready: boolean;
  mode: "guest" | "account";
  addFlow(input: FlowInput): Promise<Flow>;
  selectFlow(id: string): void;
  removeFlow(id: string): Promise<void>;
}

/** Selection is a UI preference, so it lives on the device in both modes. */
function deviceStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function useFlows(): UseFlowsResult {
  const user = useUser();
  const mode: "guest" | "account" = user.signedIn ? "account" : "guest";

  const [flows, setFlows] = useState<Flow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // Stable across renders so `current` never changes identity for no reason.
  const sampleRef = useRef<Flow>(sampleFlow());

  const store: FlowStore | null = useMemo(() => {
    if (user.loading) return null;
    if (user.signedIn) return createApiStore();
    const storage = deviceStorage();
    return storage ? createLocalStore(storage) : null;
  }, [user.loading, user.signedIn]);

  useEffect(() => {
    if (!store) return;
    let alive = true;

    const storage = deviceStorage();
    if (storage) setSelectedId(readCurrentId(storage));

    store
      .list()
      .then((list) => {
        if (alive) setFlows(list);
      })
      .catch(() => {
        if (alive) setFlows([]);
      })
      .finally(() => {
        if (alive) setReady(true);
      });

    return () => {
      alive = false;
    };
  }, [store]);

  const addFlow = useCallback(
    async (input: FlowInput) => {
      if (!store) throw new Error("Flows are not ready yet");
      const created = await store.create(input);
      setFlows((prev) => [created, ...prev]);
      // Only a payable can be the analyzed flow; a receivable just feeds the hedge detector.
      if (created.direction === "outgoing") {
        setSelectedId(created.id);
        const storage = deviceStorage();
        if (storage) writeCurrentId(storage, created.id);
      }
      return created;
    },
    [store],
  );

  const selectFlow = useCallback(
    (id: string) => {
      const target = flows.find((f) => f.id === id);
      if (!target || target.direction !== "outgoing") return;
      setSelectedId(id);
      const storage = deviceStorage();
      if (storage) writeCurrentId(storage, id);
    },
    [flows],
  );

  const removeFlow = useCallback(
    async (id: string) => {
      if (!store) return;
      await store.remove(id);
      setFlows((prev) => prev.filter((f) => f.id !== id));
      if (selectedId === id) setSelectedId(null);
    },
    [store, selectedId],
  );

  const current = pickCurrentFlow(flows, selectedId) ?? sampleRef.current;

  return { flows, current, ready, mode, addFlow, selectFlow, removeFlow };
}
