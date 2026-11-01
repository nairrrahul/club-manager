import { getCountriesByRegion } from "../../nations";
import { getCompetitivelyEligibleTeams } from "../internationalCompetitionsUtils";
import { getWorldCupAllocation } from "./allocations";
import { emptyWorldCupPhase, createBalancedGroups, getStandings, makeTies, rankGroupPlaces } from "./utils";
import type { WorldCupEdition, WorldCupRegionalQualifying } from "./types";

const rankedTeams = (teams: string[], ranks: Record<string, number>) =>
  [...teams].sort((a, b) => (ranks[a] ?? Number.MAX_SAFE_INTEGER) - (ranks[b] ?? Number.MAX_SAFE_INTEGER));

export function createAsiaQualifying(edition: WorldCupEdition, year: number, windowId: string, matchday: number): void {
  const teams = getCompetitivelyEligibleTeams(
    getCountriesByRegion("AFC").map(nation => nation.code),
    edition.year
  )
    .filter(code => !edition.hosts.includes(code));
  const preliminaryCount = (teams.length - 40) * 2;
  const preliminaryTeams = rankedTeams(teams, edition.seedRanks).slice(-preliminaryCount);
  const phase = emptyWorldCupPhase();
  phase.ties = makeTies(preliminaryTeams, `AFCWCQ1-${edition.year}`, year, windowId, matchday);
  phase.playoffTeams = preliminaryTeams;
  edition.regions.AFC = {
    confederation: "AFC", teams, phases: { AFCWCQ1: phase },
    qualified: [], intercontinental: [], playoffQualifiers: [], playoffBottomSeeds: []
  };
}

export function completeAsiaPreliminary(edition: WorldCupEdition): void {
  const region = edition.regions.AFC;
  const phase = region.phases.AFCWCQ1;
  if (!phase) throw new Error("AFC first qualifying round was not initialized.");
  const winners = phase.ties.map(tie => tie.winner).filter((team): team is string => team !== null);
  if (winners.length !== phase.ties.length) throw new Error("AFC first qualifying round is incomplete.");
  const remaining = rankedTeams(region.teams.filter(team => !phase.playoffTeams.includes(team)), edition.seedRanks)
    .slice(0, 40 - winners.length);
  region.phases.AFCWCQ2 = emptyWorldCupPhase(createBalancedGroups([...remaining, ...winners], 10, edition.seedRanks));
  phase.completed = true;
  phase.qualifiers = winners;
}

export function completeAsiaSecondRound(edition: WorldCupEdition): void {
  const region = edition.regions.AFC;
  const phase = region.phases.AFCWCQ2;
  if (!phase) throw new Error("AFC second qualifying round was not initialized.");
  const teams = phase.groups.flatMap(group => getStandings(group, edition.seedRanks).slice(0, 2).map(row => row.code));
  if (teams.length !== 20) throw new Error(`AFC second round produced ${teams.length} third-round qualifiers.`);
  region.phases.AFCWCQ3 = emptyWorldCupPhase(createBalancedGroups(teams, 4, edition.seedRanks));
  phase.qualifiers = teams;
  phase.completed = true;
}

export function completeAsiaThirdRound(edition: WorldCupEdition): void {
  const region = edition.regions.AFC;
  const phase = region.phases.AFCWCQ3;
  if (!phase) throw new Error("AFC third qualifying round was not initialized.");
  const ranked = [1, 2, 3, 4, 5].flatMap(position =>
    rankGroupPlaces(phase.groups, position, edition.seedRanks)
      .sort((a, b) => b.points - a.points || b.goalsFor - a.goalsFor ||
        b.goalDifference - a.goalDifference ||
        (edition.seedRanks[a.code] ?? Number.MAX_SAFE_INTEGER) - (edition.seedRanks[b.code] ?? Number.MAX_SAFE_INTEGER))
  );
  const hostCount = edition.hosts.filter(code => getCountriesByRegion("AFC").some(nation => nation.code === code)).length;
  const directCount = getWorldCupAllocation("AFC") - hostCount;
  region.qualified = ranked.slice(0, directCount).map(row => row.code);
  region.intercontinental = ranked.slice(directCount, directCount + (hostCount > 0 ? 2 : 1)).map(row => row.code);
  phase.qualifiers = [...region.qualified];
  phase.playoffTeams = [...region.intercontinental];
  phase.completed = true;
}

export function createAsiaRegion(): WorldCupRegionalQualifying {
  return { confederation: "AFC", teams: [], phases: {}, qualified: [], intercontinental: [], playoffQualifiers: [], playoffBottomSeeds: [] };
}
