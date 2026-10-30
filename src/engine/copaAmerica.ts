import hostOptionsRaw from "./data/tournament_hosts.json";
import { getCountriesByRegion, getNationName } from "./nations";
import type { InternationalRound } from "./international";
import {
  drawInternationalCupGroups,
  createInternationalCupGroupMatches,
  type GoldCupEdition
} from "./goldCup";
import type { GoldCupState } from "./goldCup";

const hostOptions = hostOptionsRaw as Record<string, string[]>;
const GROUP_NAMES = ["A", "B", "C", "D"] as const;

export type CopaAmericaEdition = GoldCupEdition;

export interface CopaAmericaState {
  editions: CopaAmericaEdition[];
}

export function createCopaAmericaState(): CopaAmericaState {
  return { editions: [] };
}

export function createCopaAmericaEdition(
  state: CopaAmericaState,
  goldCupState: GoldCupState,
  year: number,
  windowId: string,
  windowMatchday: number,
  worldRanks: Record<string, number>
): { edition: CopaAmericaEdition; rounds: InternationalRound[] } {
  const previousGoldCup = [...goldCupState.editions]
    .filter(edition => edition.completed)
    .sort((a, b) => b.year - a.year)[0];
  if (!previousGoldCup) {
    throw new Error("A completed Gold Cup edition is required for Copa América qualification.");
  }
  const semiFinals = previousGoldCup.knockout?.find(round => round.label === "Semi-finals");
  const goldCupSemiFinalists = [...new Set(semiFinals?.matches.flatMap(match => [match.home, match.away]) ?? [])];
  if (goldCupSemiFinalists.length !== 4) {
    throw new Error(`Gold Cup edition "${previousGoldCup.id}" does not have four semi-finalists.`);
  }

  const conmebolTeams = getCountriesByRegion("CONMEBOL").map(nation => nation.code);
  if (conmebolTeams.length !== 10) {
    throw new Error(`Copa América requires 10 CONMEBOL teams, but found ${conmebolTeams.length}.`);
  }
  const qualified = new Set([...conmebolTeams, ...goldCupSemiFinalists]);
  const additionalConcacafTeams = getCountriesByRegion("CONCACAF")
    .map(nation => nation.code)
    .filter(code => !qualified.has(code))
    .sort((a, b) =>
      (worldRanks[a] ?? Number.MAX_SAFE_INTEGER) - (worldRanks[b] ?? Number.MAX_SAFE_INTEGER) ||
      a.localeCompare(b)
    )
    .slice(0, 2);
  const teams = [...qualified, ...additionalConcacafTeams];
  if (teams.length !== 16 || new Set(teams).size !== 16) {
    throw new Error(`Copa América requires 16 unique qualified teams, but received ${teams.length}.`);
  }

  const eligibleHosts = (hostOptions.COPA ?? []).filter(option =>
    option.split("|").every(code => teams.includes(code))
  );
  if (eligibleHosts.length === 0) {
    throw new Error("No Copa América host configuration is eligible among the qualified teams.");
  }
  const hosts = eligibleHosts[Math.floor(Math.random() * eligibleHosts.length)].split("|");
  const { pots, groups } = drawInternationalCupGroups(teams, hosts, worldRanks);
  const id = `COPA-${year}-${windowId}`;
  const edition: CopaAmericaEdition = {
    id,
    year,
    windowId,
    windowMatchday,
    hosts,
    teams,
    pots,
    seedRanks: Object.fromEntries(teams.map(code => [code, worldRanks[code] ?? Number.MAX_SAFE_INTEGER])),
    groups: groups.map((groupTeams, index) => ({
      name: GROUP_NAMES[index],
      teams: groupTeams,
      matches: createInternationalCupGroupMatches(
        groupTeams,
        GROUP_NAMES[index],
        year,
        windowId,
        windowMatchday,
        "copaAmerica"
      )
    })),
    knockout: null,
    completed: false,
    winner: null,
    runnerUp: null,
    semifinalists: []
  };
  state.editions.push(edition);
  const rounds = [0, 1, 2].map(roundIndex => ({
    kind: "copaAmerica" as const,
    label: `Copa América · Group stage · Matchday ${roundIndex + 1}`,
    leftOut: null,
    matches: edition.groups.flatMap(group => group.matches[roundIndex])
  }));
  return { edition, rounds };
}

export function findLatestCopaAmericaEdition(state: CopaAmericaState): CopaAmericaEdition | null {
  return state.editions.at(-1) ?? null;
}

export function getCopaAmericaHostNames(hosts: string[]): string {
  return hosts.map(getNationName).join(" / ");
}
