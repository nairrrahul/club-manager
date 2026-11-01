import { getCountriesByRegion } from "../../nations";
import { getCompetitivelyEligibleTeams } from "../internationalCompetitionsUtils";
import { getWorldCupAllocation } from "./allocations";
import { emptyWorldCupPhase, createGroupFixtures, getStandings } from "./utils";
import type { WorldCupEdition, WorldCupRegionalQualifying } from "./types";

export function createSouthAmericaQualifying(edition: WorldCupEdition): void {
  const teams = getCompetitivelyEligibleTeams(
    getCountriesByRegion("CONMEBOL").map(nation => nation.code),
    edition.year
  )
    .filter(code => !edition.hosts.includes(code));
  if (teams.length < 2) throw new Error("CONMEBOL World Cup qualifying needs at least two teams.");
  const group = { name: "A", teams, matches: createGroupFixtures(teams, "A") };
  edition.regions.CONMEBOL = {
    confederation: "CONMEBOL",
    teams,
    phases: { SAWCQ: emptyWorldCupPhase([group]) },
    qualified: [],
    intercontinental: [],
    playoffQualifiers: [],
    playoffBottomSeeds: []
  };
}

export function completeSouthAmericaQualifying(edition: WorldCupEdition): void {
  const region = edition.regions.CONMEBOL;
  const phase = region.phases.SAWCQ;
  if (!phase) throw new Error("CONMEBOL World Cup qualifying was not initialized.");
  const rows = getStandings(phase.groups[0], edition.seedRanks);
  const hostCount = edition.hosts.filter(code => region.teams.includes(code) ||
    getCountriesByRegion("CONMEBOL").some(nation => nation.code === code)).length;
  const directCount = Math.max(0, getWorldCupAllocation("CONMEBOL") - hostCount);
  region.qualified = rows.slice(0, directCount).map(row => row.code);
  region.intercontinental = rows.slice(directCount, directCount + (hostCount > 0 ? 2 : 1)).map(row => row.code);
  phase.qualifiers = [...region.qualified];
  phase.playoffTeams = [...region.intercontinental];
  phase.completed = true;
  region.phases.SAWCQ.completed = true;
}

export function createSouthAmericaRegion(): WorldCupRegionalQualifying {
  return { confederation: "CONMEBOL", teams: [], phases: {}, qualified: [], intercontinental: [], playoffQualifiers: [], playoffBottomSeeds: [] };
}
