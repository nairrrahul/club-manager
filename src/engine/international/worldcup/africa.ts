import { getCountriesByRegion } from "../../nations";
import { getCompetitivelyEligibleTeams } from "../internationalCompetitionsUtils";
import { getWorldCupAllocation } from "./allocations";
import { emptyWorldCupPhase, createBalancedGroups, drawPaths, getStandings, makeTies, rankGroupPlaces } from "./utils";
import type { WorldCupEdition, WorldCupRegionalQualifying } from "./types";

export function createAfricaQualifying(edition: WorldCupEdition): void {
  const teams = getCompetitivelyEligibleTeams(
    getCountriesByRegion("CAF").map(nation => nation.code),
    edition.year
  )
    .filter(code => !edition.hosts.includes(code));
  const groupCount = getWorldCupAllocation("CAF") - edition.hosts.filter(code =>
    getCountriesByRegion("CAF").some(nation => nation.code === code)
  ).length;
  const groups = createBalancedGroups(teams, groupCount, edition.seedRanks);
  edition.regions.CAF = {
    confederation: "CAF", teams, phases: { CAFWCQ: emptyWorldCupPhase(groups) },
    qualified: [], intercontinental: [], playoffQualifiers: [], playoffBottomSeeds: []
  };
}

export function completeAfricaQualifying(edition: WorldCupEdition, year: number, windowId: string, matchday: number): void {
  const region = edition.regions.CAF;
  const phase = region.phases.CAFWCQ;
  if (!phase) throw new Error("CAF World Cup qualifying was not initialized.");
  region.qualified = phase.groups.map(group => getStandings(group, edition.seedRanks)[0].code);
  const runners = rankGroupPlaces(phase.groups, 2, edition.seedRanks, true)
    .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      (edition.seedRanks[a.code] ?? Number.MAX_SAFE_INTEGER) - (edition.seedRanks[b.code] ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 4);
  phase.qualifiers = [...region.qualified];
  phase.playoffTeams = runners.map(row => row.code);
  phase.completed = true;
  if (edition.hosts.some(code => getCountriesByRegion("CAF").some(nation => nation.code === code))) {
    region.phases.CAFWCQP = emptyWorldCupPhase();
    region.phases.CAFWCQP.ties = makeTies(
      runners.map(row => row.code).sort((a, b) =>
        (edition.seedRanks[a] ?? Number.MAX_SAFE_INTEGER) - (edition.seedRanks[b] ?? Number.MAX_SAFE_INTEGER)),
      `CAFWCQP-${edition.year}`, year, windowId, matchday
    );
  } else {
    region.phases.CAFWCQP = emptyWorldCupPhase();
    region.phases.CAFWCQP.paths = drawPaths(runners.map(row => row.code), 1, edition.seedRanks);
  }
}

export function completeAfricaPlayoff(edition: WorldCupEdition): void {
  const region = edition.regions.CAF;
  const phase = region.phases.CAFWCQP;
  if (!phase) throw new Error("CAF World Cup playoff was not initialized.");
  if (edition.hosts.some(code => getCountriesByRegion("CAF").some(nation => nation.code === code))) {
    region.intercontinental = phase.ties.map(tie => tie.winner).filter((team): team is string => team !== null);
  } else {
    region.intercontinental = phase.paths.map(path => path.bracket.rounds.at(-1)?.[0]?.winner)
      .filter((team): team is string => team !== undefined && team !== null);
  }
  phase.playoffComplete = true;
  phase.completed = true;
}

export function createAfricaRegion(): WorldCupRegionalQualifying {
  return { confederation: "CAF", teams: [], phases: {}, qualified: [], intercontinental: [], playoffQualifiers: [], playoffBottomSeeds: [] };
}
