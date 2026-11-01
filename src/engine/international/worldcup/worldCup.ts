import { getInternationalWindowIndex, getInternationalWindowLocation, getInternationalWindowType } from "../internationalCompetitionsUtils";
import { chooseWorldCupHosts } from "./hosts";
import { assertWorldCupAllocations } from "./allocations";
import {
  createAfricaRegion, createSouthAmericaRegion, createConcacafRegion,
  createAsiaRegion, createOceaniaRegion, createEuropeRegion
} from "./regions";
import { createIntercontinentalRegion } from "./intercontinental";
import type { WorldCupConfederation, WorldCupEdition, WorldCupState } from "./types";

const CONFEDERATIONS: WorldCupConfederation[] = ["UEFA", "CONCACAF", "CONMEBOL", "OFC", "AFC", "CAF"];

export function createWorldCupState(): WorldCupState {
  assertWorldCupAllocations();
  return { editions: [] };
}

export function getWorldCupWindowType(confederation: string, year: number, windowId: string): string | null {
  const type = getInternationalWindowType(confederation, year, windowId);
  return type === "FR" || type.startsWith("NL") || type.startsWith("GC") ||
    type === "COPA" || type.startsWith("CAFQP") || type.startsWith("CAFQM") ||
    type.startsWith("AFCON") || type === "AFCQP" || type === "AFCQM" ||
    type === "AFCCUP" || type.startsWith("OFCCUP") || type.startsWith("EURO")
    ? null
    : type;
}

export function getWorldCupSeasonForWindow(year: number, windowId: string): number {
  const currentType = CONFEDERATIONS.map(confed => getWorldCupWindowType(confed, year, windowId))
    .find(type => type === "WC");
  if (currentType) return year;
  const currentIndex = getInternationalWindowIndex(year, windowId);
  for (let offset = 1; offset <= 24; offset++) {
    const location = getInternationalWindowLocation(currentIndex + offset);
    if (getWorldCupWindowType("UEFA", location.year, location.windowId) === "WC") return location.year;
  }
  throw new Error(`Could not find the next World Cup window after ${year} ${windowId}.`);
}

export function ensureWorldCupEdition(
  state: WorldCupState,
  year: number,
  worldRanks: Record<string, number>
): WorldCupEdition {
  const existing = state.editions.find(edition => edition.year === year);
  if (existing) {
    existing.seedRanks = { ...worldRanks };
    return existing;
  }
  const previous = [...state.editions].sort((a, b) => a.year - b.year);
  const hostSelection = chooseWorldCupHosts(year, previous);
  const regions = {
    UEFA: createEuropeRegion(),
    CONCACAF: createConcacafRegion(),
    CONMEBOL: createSouthAmericaRegion(),
    OFC: createOceaniaRegion(),
    AFC: createAsiaRegion(),
    CAF: createAfricaRegion()
  };
  const edition: WorldCupEdition = {
    id: `WCQ-${year}`,
    year,
    hosts: hostSelection.hosts,
    blockedConfederations: hostSelection.blockedConfederations,
    seedRanks: { ...worldRanks },
    regions,
    intercontinental: createIntercontinentalRegion(),
    tournament: null
  };
  state.editions.push(edition);
  return edition;
}

export function findWorldCupEdition(state: WorldCupState, year: number): WorldCupEdition | null {
  return state.editions.find(edition => edition.year === year) ?? null;
}

export function getWorldCupEdition(state: WorldCupState, id: string): WorldCupEdition {
  const edition = state.editions.find(item => item.id === id || item.tournament?.id === id);
  if (!edition) throw new Error(`Unknown World Cup edition "${id}".`);
  return edition;
}
