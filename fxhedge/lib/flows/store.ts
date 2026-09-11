import type { Flow, FlowInput } from "@/types/flow";

/**
 * The one interface both backends implement. `hooks/use-flows.ts` is the only
 * place that decides which implementation is in play.
 */
export interface FlowStore {
  list(): Promise<Flow[]>;
  create(input: FlowInput): Promise<Flow>;
  remove(id: string): Promise<void>;
}
