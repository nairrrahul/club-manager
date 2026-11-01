import { getCountriesByRegion } from "../../nations";
import {
  getCompetitivelyEligibleTeams,
  isInternationalTeamCompetitivelyEligible
} from "../internationalCompetitionsUtils";
import { getWorldCupAllocation } from "./allocations";
import { getNationsLeagueDivisionHistory } from "../nationsLeague";
import { emptyWorldCupPhase, createBalancedGroups, drawPaths, getStandings } from "./utils";
import type { NationsLeagueEdition } from "../nationsLeague";
import type { WorldCupEdition, WorldCupRegionalQualifying } from "./types";

export function createEuropeQualifying(edition: WorldCupEdition): void {
  const teams = getCompetitivelyEligibleTeams(
    getCountriesByRegion("UEFA").map(nation => nation.code),
    edition.year
  )
    .filter(code => !edition.hosts.includes(code));
  const hostCount = edition.hosts.filter(code => getCountriesByRegion("UEFA").some(nation => nation.code === code)).length;
  const groups = createBalancedGroups(teams, 12 - hostCount, edition.seedRanks);
  edition.regions.UEFA = {
    confederation: "UEFA", teams, phases: { UEFAWCQM: emptyWorldCupPhase(groups) },
    qualified: [], intercontinental: [], playoffQualifiers: [], playoffBottomSeeds: []
  };
}

export function completeEuropeQualifying(edition: WorldCupEdition, nationsLeagueEditions: NationsLeagueEdition[]): void {
  const region = edition.regions.UEFA;
  const phase = region.phases.UEFAWCQM;
  if (!phase) throw new Error("UEFA World Cup qualifying was not initialized.");
  const standings = phase.groups.map(group => getStandings(group, edition.seedRanks));
  const direct = standings.map(rows => rows[0].code);
  const runners = standings.map(rows => rows[1].code);
  const additionalCount = getWorldCupAllocation("UEFA") - runners.length;
  const excluded = new Set([...edition.hosts, ...direct, ...runners]);
  const aggregate = getNationsLeagueDivisionHistory(
    nationsLeagueEditions.filter(item => item.confederation === "UEFA")
  ).rows;
  const bottomSeeds = aggregate.filter(row =>
    !excluded.has(row.code) && isInternationalTeamCompetitivelyEligible(row.code, edition.year)
  ).slice(0, additionalCount)
    .map(row => row.code);
  if (bottomSeeds.length !== additionalCount) {
    throw new Error(`UEFA World Cup playoff needs ${additionalCount} Nations League seeds; found ${bottomSeeds.length}.`);
  }
  const playoffTeams = [...runners, ...bottomSeeds];
  if (playoffTeams.length !== 16) throw new Error(`UEFA World Cup playoff must have 16 teams; found ${playoffTeams.length}.`);
  region.qualified = direct;
  region.playoffQualifiers = playoffTeams;
  region.playoffBottomSeeds = bottomSeeds;
  phase.qualifiers = direct;
  phase.playoffTeams = playoffTeams;
  phase.bottomSeeds = bottomSeeds;
  phase.completed = true;
  const playoff = emptyWorldCupPhase();
  playoff.playoffTeams = playoffTeams;
  playoff.bottomSeeds = bottomSeeds;
  playoff.paths = drawPaths(playoffTeams, 4, edition.seedRanks, bottomSeeds);
  region.phases.UEFAWCQP = playoff;
}

export function completeEuropePlayoff(edition: WorldCupEdition): void {
  const region = edition.regions.UEFA;
  const phase = region.phases.UEFAWCQP;
  if (!phase) throw new Error("UEFA World Cup playoff was not initialized.");
  const winners = phase.paths.map(path => path.bracket.rounds.at(-1)?.[0]?.winner);
  if (winners.some(winner => !winner)) throw new Error("UEFA World Cup playoff paths are incomplete.");
  region.qualified = [...region.qualified, ...winners as string[]];
  phase.playoffComplete = true;
  phase.completed = true;
}

export function createEuropeRegion(): WorldCupRegionalQualifying {
  return { confederation: "UEFA", teams: [], phases: {}, qualified: [], intercontinental: [], playoffQualifiers: [], playoffBottomSeeds: [] };
}
