import type { Position } from "./types";

export const FORMATIONS: Record<string, Partial<Record<Position, number>>> = {
  "4-4-2": { GK: 1, RB: 1, CB: 2, LB: 1, CM: 2, RM: 1, LM: 1, ST: 2 },
  "4-3-3": { GK: 1, RB: 1, CB: 2, LB: 1, CM: 1, CDM: 1, CAM: 1, RW: 1, LW: 1, ST: 1 },
  "4-2-3-1": { GK: 1, RB: 1, CB: 2, LB: 1, CDM: 2, CAM: 1, RW: 1, LW: 1, ST: 1 },
  "5-3-2": { GK: 1, RB: 1, CB: 3, LB: 1, CM: 2, CAM: 1, ST: 2 },
  "4-2-2-2": { GK: 1, RB: 1, CB: 2, LB: 1, CDM: 2, CAM: 2, ST: 2 },
  "5-4-1": { GK: 1, RB: 1, CB: 3, LB: 1, CM: 2, RM: 1, LM: 1, ST: 1 }
};

export const POSITION_ORDER: Position[] = ["GK", "RB", "CB", "LB", "CDM", "CM", "CAM", "RM", "LM", "RW", "LW", "ST"];

export const POSITION_GROUP: Record<Position, "GK" | "DEF" | "MID" | "FWD"> = {
  GK: "GK", RB: "DEF", CB: "DEF", LB: "DEF",
  CDM: "MID", CM: "MID", CAM: "MID", RM: "MID", LM: "MID",
  RW: "FWD", LW: "FWD", ST: "FWD"
};

const POSITION_ALIASES: Record<Position, Position[]> = {
  GK: ["GK"],
  RB: ["RB"],
  CB: ["CB"],
  LB: ["LB"],
  CDM: ["CDM", "CM"],
  CM: ["CM", "CDM", "CAM"],
  CAM: ["CAM", "CM", "CDM"],
  RM: ["RM", "RW"],
  LM: ["LM", "LW"],
  RW: ["RW"],
  LW: ["LW"],
  ST: ["ST"]
};

export function canPlayPosition(playerPosition: Position, requiredPosition: Position): boolean {
  return (POSITION_ALIASES[requiredPosition] ?? [requiredPosition]).includes(playerPosition);
}

export function getFormation(form: string): Partial<Record<Position, number>> | null {
  return FORMATIONS[form] ?? null;
}

export function getFormationRequirements(form: string): Position[] {
  const formation = getFormation(form);
  if (!formation) return [];
  return Object.entries(formation).flatMap(([position, count]) =>
    Array<Position>(count as number).fill(position as Position)
  );
}

/**
 * Pitch layout used by the web UI only. Rows run from attack (top) to goalkeeper (bottom);
 * each entry is a required position, listed left to right.
 */
export const FORMATION_LAYOUTS: Record<string, Position[][]> = {
  "4-4-2": [["ST", "ST"], ["LM", "CM", "CM", "RM"], ["LB", "CB", "CB", "RB"], ["GK"]],
  "4-3-3": [["LW", "ST", "RW"], ["CM", "CAM", "CDM"], ["LB", "CB", "CB", "RB"], ["GK"]],
  "4-2-3-1": [["ST"], ["LW", "CAM", "RW"], ["CDM", "CDM"], ["LB", "CB", "CB", "RB"], ["GK"]],
  "5-3-2": [["ST", "ST"], ["CM", "CAM", "CM"], ["LB", "CB", "CB", "CB", "RB"], ["GK"]],
  "4-2-2-2": [["ST", "ST"], ["CAM", "CAM"], ["CDM", "CDM"], ["LB", "CB", "CB", "RB"], ["GK"]],
  "5-4-1": [["ST"], ["LM", "CM", "CM", "RM"], ["LB", "CB", "CB", "CB", "RB"], ["GK"]]
};

/** Maps each pitch-layout row entry to its slot index in getFormationRequirements(form). */
export function getFormationLayoutSlots(form: string): number[][] {
  const requirements = getFormationRequirements(form);
  const used = new Set<number>();
  return (FORMATION_LAYOUTS[form] ?? []).map(row =>
    row.map(position => {
      const index = requirements.findIndex((req, i) => req === position && !used.has(i));
      used.add(index);
      return index;
    })
  );
}
