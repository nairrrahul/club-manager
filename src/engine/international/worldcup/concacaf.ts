import { getCountriesByRegion } from "../../nations";
import { getCompetitivelyEligibleTeams } from "../internationalCompetitionsUtils";
import { getWorldCupAllocation } from "./allocations";
import { emptyWorldCupPhase, createBalancedGroups, createGroupFixtures, getStandings, makeTies, rankGroupPlaces } from "./utils";
import type { WorldCupEdition, WorldCupRegionalQualifying } from "./types";

const rankedTeams = (teams: string[], ranks: Record<string, number>) =>
  [...teams].sort((a, b) => (ranks[a] ?? Number.MAX_SAFE_INTEGER) - (ranks[b] ?? Number.MAX_SAFE_INTEGER));

export function createConcacafQualifying(edition: WorldCupEdition, year: number, windowId: string, matchday: number): void {
  const teams = getCompetitivelyEligibleTeams(
    getCountriesByRegion("CONCACAF").map(nation => nation.code),
    edition.year
  )
    .filter(code => !edition.hosts.includes(code));
  const preliminaryCount = (teams.length - 30) * 2;
  const ranked = rankedTeams(teams, edition.seedRanks);
  const preliminaryTeams = ranked.slice(-preliminaryCount);
  const ties = makeTies(preliminaryTeams, `CCWCQ1-${edition.year}`, year, windowId, matchday);
  edition.regions.CONCACAF = {
    confederation: "CONCACAF", teams, phases: { CCWCQ1: emptyWorldCupPhase() },
    qualified: [], intercontinental: [], playoffQualifiers: [], playoffBottomSeeds: []
  };
  const phase = edition.regions.CONCACAF.phases.CCWCQ1;
  phase.ties = ties;
  phase.playoffTeams = preliminaryTeams;
}

export function completeConcacafPreliminary(edition: WorldCupEdition): void {
  const region = edition.regions.CONCACAF;
  const preliminary = region.phases.CCWCQ1;
  if (!preliminary) throw new Error("CONCACAF first qualifying round was not initialized.");
  const winners = preliminary.ties.map(tie => tie.winner).filter((team): team is string => team !== null);
  if (winners.length !== preliminary.ties.length) throw new Error("CONCACAF first qualifying round is incomplete.");
  const entrants = rankedTeams(region.teams.filter(team => !preliminary.playoffTeams.includes(team)), edition.seedRanks)
    .slice(0, 30 - winners.length);
  const groups = createBalancedGroups([...entrants, ...winners], 6, edition.seedRanks)
    .map(group => ({ ...group, matches: createGroupFixtures(group.teams, group.name, false) }));
  region.phases.CCWCQ2 = emptyWorldCupPhase(groups);
  preliminary.completed = true;
  preliminary.qualifiers = winners;
}

export function completeConcacafSecondRound(edition: WorldCupEdition): void {
  const region = edition.regions.CONCACAF;
  const phase = region.phases.CCWCQ2;
  if (!phase) throw new Error("CONCACAF second qualifying round was not initialized.");
  const teams = phase.groups.flatMap(group => getStandings(group, edition.seedRanks).slice(0, 2).map(row => row.code));
  if (teams.length !== 12) throw new Error(`CONCACAF second round produced ${teams.length} third-round qualifiers.`);
  region.phases.CCWCQ3 = emptyWorldCupPhase(createBalancedGroups(teams, 3, edition.seedRanks));
  phase.qualifiers = teams;
  phase.completed = true;
}

export function completeConcacafThirdRound(edition: WorldCupEdition): void {
  const region = edition.regions.CONCACAF;
  const phase = region.phases.CCWCQ3;
  if (!phase) throw new Error("CONCACAF third qualifying round was not initialized.");
  const ranked = [1, 2, 3, 4].flatMap(position =>
    rankGroupPlaces(phase.groups, position, edition.seedRanks)
      .sort((a, b) => b.points - a.points ||
        b.goalDifference - a.goalDifference ||
        b.goalsFor - a.goalsFor ||
        (edition.seedRanks[a.code] ?? Number.MAX_SAFE_INTEGER) - (edition.seedRanks[b.code] ?? Number.MAX_SAFE_INTEGER))
  );
  const hostCount = edition.hosts.filter(code => getCountriesByRegion("CONCACAF").some(nation => nation.code === code)).length;
  const directCount = getWorldCupAllocation("CONCACAF") - hostCount;
  region.qualified = ranked.slice(0, directCount).map(row => row.code);
  region.intercontinental = ranked.slice(directCount, directCount + (hostCount > 0 ? 2 : 1)).map(row => row.code);
  phase.qualifiers = [...region.qualified];
  phase.playoffTeams = [...region.intercontinental];
  phase.completed = true;
}

export function createConcacafRegion(): WorldCupRegionalQualifying {
  return { confederation: "CONCACAF", teams: [], phases: {}, qualified: [], intercontinental: [], playoffQualifiers: [], playoffBottomSeeds: [] };
}
