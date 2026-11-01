import allocationsRaw from "../../data/intl/world_cup_alloc.json";
import type { WorldCupConfederation } from "./types";

const allocations = allocationsRaw as Record<string, number>;

export function getWorldCupAllocation(confederation: WorldCupConfederation | "PO"): number {
  const allocation = allocations[confederation];
  if (!Number.isInteger(allocation) || allocation < 0) {
    throw new Error(`Missing or invalid World Cup allocation for ${confederation}.`);
  }
  return allocation;
}

export function assertWorldCupAllocations(): void {
  const total = ["UEFA", "CONCACAF", "CONMEBOL", "OFC", "AFC", "CAF", "PO"]
    .reduce((sum, confederation) => sum + getWorldCupAllocation(confederation as WorldCupConfederation | "PO"), 0);
  if (total !== 48) throw new Error(`World Cup allocations must total 48 places; found ${total}.`);
}
