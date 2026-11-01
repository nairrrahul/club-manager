import { getCountriesByRegion } from "../../nations";
import { getCompetitivelyEligibleTeams } from "../internationalCompetitionsUtils";
import { getWorldCupAllocation } from "./allocations";
import { emptyWorldCupPhase, createBalancedGroups, drawPaths, getStandings, makeTies, rankGroupPlaces } from "./utils";
import type { WorldCupEdition, WorldCupRegionalQualifying } from "./types";

const rankedTeams = (teams: string[], ranks: Record<string, number>) =>
  [...teams].sort((a, b) => (ranks[a] ?? Number.MAX_SAFE_INTEGER) - (ranks[b] ?? Number.MAX_SAFE_INTEGER));

export function createOceaniaQualifying(edition: WorldCupEdition): void {
  const teams = rankedTeams(
    getCompetitivelyEligibleTeams(
      getCountriesByRegion("OFC").map(nation => nation.code),
      edition.year
    ).filter(code => !edition.hosts.includes(code)),
    edition.seedRanks
  );
  const hostCount = edition.hosts.filter(code => getCountriesByRegion("OFC").some(nation => nation.code === code)).length;
  const preliminaryTeams = teams.slice(-Math.max(0, 4 - hostCount));
  const phase = emptyWorldCupPhase();
  phase.paths = drawPaths(preliminaryTeams, 1, edition.seedRanks);
  phase.playoffTeams = preliminaryTeams;
  edition.regions.OFC = {
    confederation: "OFC", teams, phases: { OFCWCQ1: phase },
    qualified: [], intercontinental: [], playoffQualifiers: [], playoffBottomSeeds: []
  };
}

export function completeOceaniaPreliminary(edition: WorldCupEdition): void {
  const region = edition.regions.OFC;
  const phase = region.phases.OFCWCQ1;
  const winner = phase?.paths[0]?.bracket.rounds.at(-1)?.[0]?.winner;
  if (!phase || !winner) throw new Error("OFC preliminary round has no completed winner.");
  const autoQualifiers = rankedTeams(
    region.teams.filter(team => !phase.playoffTeams.includes(team)),
    edition.seedRanks
  ).slice(0, 7);
  const groups = createBalancedGroups([...autoQualifiers, winner], 2, edition.seedRanks);
  region.phases.OFCWCQ2 = emptyWorldCupPhase(groups);
  phase.completed = true;
  phase.qualifiers = [winner];
}

export function completeOceaniaSecondRound(edition: WorldCupEdition, year: number, windowId: string, matchday: number): void {
  const region = edition.regions.OFC;
  const phase = region.phases.OFCWCQ2;
  if (!phase) throw new Error("OFC second qualifying round was not initialized.");
  const teams = phase.groups.flatMap(group => getStandings(group, edition.seedRanks).slice(0, 2).map(row => row.code));
  if (teams.length !== 4) throw new Error(`OFC second round produced ${teams.length} third-round qualifiers.`);
  const third = emptyWorldCupPhase();
  const hasHost = edition.hosts.some(code => getCountriesByRegion("OFC").some(nation => nation.code === code));
  if (hasHost) {
    third.ties = makeTies(rankedTeams(teams, edition.seedRanks), `OFCWCQ3-${edition.year}`, year, windowId, matchday);
  } else {
    third.paths = drawPaths(rankedTeams(teams, edition.seedRanks), 1, edition.seedRanks);
  }
  region.phases.OFCWCQ3 = third;
  phase.qualifiers = teams;
  phase.completed = true;
}

export function completeOceaniaThirdRound(edition: WorldCupEdition): void {
  const region = edition.regions.OFC;
  const phase = region.phases.OFCWCQ3;
  if (!phase) throw new Error("OFC third qualifying round was not initialized.");
  const hasHost = edition.hosts.some(code => getCountriesByRegion("OFC").some(nation => nation.code === code));
  if (hasHost) {
    region.intercontinental = phase.ties.map(tie => tie.winner).filter((team): team is string => team !== null);
  } else {
    const final = phase.paths[0]?.bracket.rounds.at(-1)?.[0];
    if (!final?.winner || !final.player1?.team || !final.player2?.team) {
      throw new Error("OFC World Cup qualifying final is incomplete.");
    }
    region.qualified = [final.winner];
    if (region.qualified.length !== getWorldCupAllocation("OFC")) {
      throw new Error(`OFC qualifying produced ${region.qualified.length} direct World Cup qualifiers.`);
    }
    region.intercontinental = [final.winner === final.player1.team ? final.player2.team : final.player1.team];
  }
  phase.completed = true;
  phase.playoffComplete = true;
}

export function createOceaniaRegion(): WorldCupRegionalQualifying {
  return { confederation: "OFC", teams: [], phases: {}, qualified: [], intercontinental: [], playoffQualifiers: [], playoffBottomSeeds: [] };
}
