import hostOptionsRaw from "../data/tournament_hosts.json";
import { getCountriesByRegion } from "../nations";
import type { Bracket } from "../types";
import { shuffledCopy } from "../utils";
import {
  createInternationalPlayoffPaths,
  getInternationalCupStandings,
  getInternationalWindowType,
  getNextCompetitionWindow
} from "./internationalCompetitionsUtils";
import type {
  InternationalCompetitionGroup,
  InternationalPlayoffPath
} from "./internationalCompetitionsUtils";
import { getNationsLeagueDivisionHistory } from "./nationsLeague";
import type { NationsLeagueEdition } from "./nationsLeague";
import type { InternationalMatch, InternationalRound } from "./international";

const hostOptions = (hostOptionsRaw as Record<string, string[]>).EURO ?? [];
const QUALIFYING_MATCHDAYS_PER_WINDOW = 2;

export interface EuroQualifyingEdition {
  id: string;
  tournamentYear: number;
  hosts: string[];
  groups: InternationalCompetitionGroup[];
  seedRanks: Record<string, number>;
  groupCount: number;
  roundsPlayed: number;
  directQualifiers: string[];
  playoffTeams: string[];
  playoffBottomSeeds: string[];
  playoffPots: string[][];
  playoffPaths: (InternationalPlayoffPath & { name: string })[];
  playoffRoundsPlayed: number;
  playoffComplete: boolean;
  completed: boolean;
}

export interface EuroQualifiersState {
  editions: EuroQualifyingEdition[];
}

export function createEuroQualifiersState(): EuroQualifiersState {
  return { editions: [] };
}

export function getEuroWindowType(year: number, windowId: string): "EUROQ" | "EUROQP" | "EURO" | null {
  const type = getInternationalWindowType("UEFA", year, windowId);
  return type === "EUROQ" || type === "EUROQP" || type === "EURO" ? type : null;
}

function createMatch(
  home: string,
  away: string,
  kind: InternationalMatch["kind"],
  year: number,
  windowId: string,
  windowMatchday: number,
  extra: Partial<InternationalMatch> = {}
): InternationalMatch {
  return {
    home,
    away,
    kind: kind ?? "euroQualifier",
    homeGoals: null,
    awayGoals: null,
    homeChange: null,
    awayChange: null,
    windowYear: year,
    windowId,
    windowMatchday,
    ...extra
  };
}

function createQualifyingFixtures(
  teams: string[],
  group: string,
  editionId: string,
  tournamentYear: number,
  initialWindow: { year: number; windowId: string; afterMatchday: number }
): InternationalMatch[][] {
  const rotating: (string | null)[] = teams.length % 2 === 0 ? [...teams] : [...teams, null];
  const firstLegs: [string, string][][] = [];
  for (let roundIndex = 0; roundIndex < rotating.length - 1; roundIndex++) {
    const fixtures: [string, string][] = [];
    for (let index = 0; index < rotating.length / 2; index++) {
      const home = rotating[index];
      const away = rotating[rotating.length - 1 - index];
      if (home && away) fixtures.push(roundIndex % 2 === 0 ? [home, away] : [away, home]);
    }
    firstLegs.push(fixtures);
    rotating.splice(1, 0, rotating.pop()!);
  }
  const fullFixtures = [...firstLegs, ...firstLegs.map(round => round.map(([home, away]) => [away, home] as [string, string]))];
  const qualifyingWindow = getNextCompetitionWindow(initialWindow.year, initialWindow.windowId, (year, id) =>
    getEuroWindowType(year, id) === "EUROQ"
  );
  return fullFixtures.map((fixtures, roundIndex) => fixtures.map(([home, away]) =>
    createMatch(home, away, "euroQualifier", qualifyingWindow.year, qualifyingWindow.windowId, qualifyingWindow.afterMatchday, {
      euroQualifierId: editionId,
      euroStage: "qualifying",
      euroGroup: group,
      euroRound: roundIndex + 1,
      euroTournamentYear: tournamentYear
    })
  ));
}

function groupPots(teams: string[], groupCount: number, worldRanks: Record<string, number>): string[][] {
  const sorted = [...teams].sort((a, b) =>
    (worldRanks[a] ?? Number.MAX_SAFE_INTEGER) - (worldRanks[b] ?? Number.MAX_SAFE_INTEGER) ||
    a.localeCompare(b)
  );
  const pots = Array.from({ length: Math.ceil(teams.length / groupCount) }, (_, index) =>
    sorted.slice(index * groupCount, (index + 1) * groupCount)
  );
  const groups = Array.from({ length: groupCount }, () => [] as string[]);
  for (const pot of pots.map(shuffledCopy)) {
    const eligible = groups
      .map((group, index) => ({ group, index }))
      .filter(({ group }) => group.length === Math.min(...groups.map(item => item.length)))
      .slice(0, pot.length);
    pot.forEach((team, index) => eligible[index].group.push(team));
  }
  return groups;
}

export function createEuroQualifyingEdition(
  state: EuroQualifiersState,
  tournamentYear: number,
  rankings: Record<string, number>,
  initialWindow: { year: number; windowId: string; afterMatchday: number },
  previousEditionHosts: string[] = []
): EuroQualifyingEdition {
  const priorHosts = new Set(previousEditionHosts);
  const eligibleHostOptions = hostOptions.filter(option =>
    option.split("|").every(code => !priorHosts.has(code))
  );
  const hostOption = eligibleHostOptions[Math.floor(Math.random() * eligibleHostOptions.length)];
  if (!hostOption) throw new Error("No eligible EURO host configuration avoids consecutive hosts.");
  const hosts = hostOption.split("|");
  if (hosts.length < 1 || hosts.length > 3) {
    throw new Error(`EURO host configuration must have one to three hosts; found ${hosts.length}.`);
  }
  const allTeams = getCountriesByRegion("UEFA").map(nation => nation.code);
  if (allTeams.length !== 55) throw new Error(`EURO qualifying expects 55 UEFA nations; found ${allTeams.length}.`);
  const hostSet = new Set(hosts);
  const qualifyingTeams = allTeams.filter(code => !hostSet.has(code));
  const groupCount = hosts.length === 3 ? 9 : 10;
  const groups = groupPots(qualifyingTeams, groupCount, rankings);
  const id = `EUROQ-${tournamentYear}`;
  const groupRecords = groups.map((groupTeams, index) => ({
    name: String.fromCharCode("A".charCodeAt(0) + index),
    teams: groupTeams,
    matches: createQualifyingFixtures(
      groupTeams,
      String.fromCharCode("A".charCodeAt(0) + index),
      id,
      tournamentYear,
      initialWindow
    )
  }));
  const edition: EuroQualifyingEdition = {
    id,
    tournamentYear,
    hosts,
    groups: groupRecords,
    seedRanks: Object.fromEntries(qualifyingTeams.map(code => [code, rankings[code] ?? Number.MAX_SAFE_INTEGER])),
    groupCount,
    roundsPlayed: 0,
    directQualifiers: [],
    playoffTeams: [],
    playoffBottomSeeds: [],
    playoffPots: [],
    playoffPaths: [],
    playoffRoundsPlayed: 0,
    playoffComplete: false,
    completed: false
  };
  state.editions.push(edition);
  return edition;
}

export function findEuroQualifyingEdition(
  state: EuroQualifiersState,
  tournamentYear: number
): EuroQualifyingEdition | null {
  return state.editions.find(edition => edition.tournamentYear === tournamentYear) ?? null;
}

export function getEuroQualifyingEdition(state: EuroQualifiersState, id: string): EuroQualifyingEdition {
  const edition = state.editions.find(item => item.id === id);
  if (!edition) throw new Error(`Unknown EURO qualifying edition "${id}".`);
  return edition;
}

export function getEuroQualifierStandings(
  edition: EuroQualifyingEdition,
  group: InternationalCompetitionGroup
) {
  if (!edition.groups.some(item => item.name === group.name)) {
    throw new Error(`Unknown EURO qualifying group "${group.name}" in "${edition.id}".`);
  }
  return getInternationalCupStandings({ seedRanks: edition.seedRanks }, group)
    .map((row, index) => ({ ...row, position: index + 1 }));
}

export function getEuroQualifyingRounds(
  edition: EuroQualifyingEdition,
  year: number,
  windowId: string,
  windowMatchday: number
): InternationalRound[] {
  const totalRounds = Math.max(...edition.groups.map(group => group.matches.length));
  const count = Math.min(QUALIFYING_MATCHDAYS_PER_WINDOW, totalRounds - edition.roundsPlayed);
  if (count <= 0) throw new Error(`EURO qualifying "${edition.id}" has no remaining matchdays.`);
  return Array.from({ length: count }, (_, offset) => {
    const roundIndex = edition.roundsPlayed + offset;
    const matches = edition.groups.flatMap(group => group.matches[roundIndex] ?? []);
    matches.forEach(match => {
      match.windowYear = year;
      match.windowId = windowId;
      match.windowMatchday = windowMatchday;
    });
    return {
      kind: "euroQualifier" as const,
      label: `EURO Qualifying · Matchday ${roundIndex + 1}`,
      leftOut: null,
      euroQualifierId: edition.id,
      euroStage: "qualifying" as const,
      euroRound: roundIndex + 1,
      euroTournamentYear: edition.tournamentYear,
      matches
    };
  });
}

function compareRows(
  a: ReturnType<typeof getInternationalCupStandings>[number],
  b: ReturnType<typeof getInternationalCupStandings>[number],
  ranks: Record<string, number>
): number {
  return b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    (ranks[a.code] ?? Number.MAX_SAFE_INTEGER) - (ranks[b.code] ?? Number.MAX_SAFE_INTEGER);
}

export function completeEuroMainQualifying(
  edition: EuroQualifyingEdition,
  nationsLeagueEditions: NationsLeagueEdition[],
  worldRanks: Record<string, number>
): void {
  if (edition.roundsPlayed !== 10) {
    throw new Error(`EURO qualifying "${edition.id}" is incomplete after ${edition.roundsPlayed} matchdays.`);
  }
  const standings = edition.groups.map(group => getEuroQualifierStandings(edition, group));
  const winners = standings.map(rows => rows[0]);
  const runnersUp = standings.map(rows => rows[1]);
  const thirdPlace = standings.map(rows => rows[2]);
  const direct = [...winners.map(row => row.code)];
  const playoff = thirdPlace.map(row => row.code);
  let directRunners: typeof runnersUp = [];
  if (edition.hosts.length === 1) {
    directRunners = runnersUp;
  } else if (edition.hosts.length === 2) {
    const sortedRunners = [...runnersUp].sort((a, b) => compareRows(a, b, edition.seedRanks));
    directRunners = sortedRunners.slice(0, 9);
    playoff.push(sortedRunners[9].code);
  } else {
    directRunners = runnersUp;
  }
  direct.push(...directRunners.map(row => row.code));

  const playoffSlots = 12 - playoff.length;
  if (playoffSlots < 0 || playoffSlots > 3) {
    throw new Error(`EURO qualifying produced ${playoff.length} play-off teams before Nations League selections.`);
  }
  const aggregate = getNationsLeagueDivisionHistory(
    nationsLeagueEditions.filter(item => item.confederation === "UEFA")
  ).rows;
  const excluded = new Set([...edition.hosts, ...direct, ...playoff]);
  const bottomSeeds = aggregate
    .filter(row => !excluded.has(row.code))
    .slice(0, playoffSlots)
    .map(row => row.code);
  if (bottomSeeds.length !== playoffSlots) {
    throw new Error(`EURO qualifying needs ${playoffSlots} Nations League play-off teams but found ${bottomSeeds.length}.`);
  }
  playoff.push(...bottomSeeds);
  edition.directQualifiers = direct;
  edition.playoffTeams = playoff;
  edition.playoffBottomSeeds = bottomSeeds;
  const playoffDraw = createInternationalPlayoffPaths(playoff, 3, worldRanks, bottomSeeds);
  edition.playoffPots = playoffDraw.pots;
  edition.playoffPaths = playoffDraw.paths
    .map((path, index) => ({ ...path, name: String.fromCharCode("A".charCodeAt(0) + index) }));
  edition.completed = true;
}

function pathMatchFixture(
  edition: EuroQualifyingEdition,
  pathName: string,
  pathRound: number,
  matchIndex: number,
  home: string,
  away: string,
  year: number,
  windowId: string,
  windowMatchday: number
): InternationalMatch {
  return createMatch(home, away, "euroQualifier", year, windowId, windowMatchday, {
    euroQualifierId: edition.id,
    euroStage: "playoff",
    euroPath: pathName,
    euroPathRound: pathRound,
    euroPathMatch: matchIndex,
    euroTournamentYear: edition.tournamentYear
  });
}

export function getEuroPlayoffRounds(
  edition: EuroQualifyingEdition,
  year: number,
  windowId: string,
  windowMatchday: number
): InternationalRound[] {
  if (!edition.completed || edition.playoffComplete) return [];
  const matches = edition.playoffPaths.flatMap(path =>
    path.bracket.rounds[edition.playoffRoundsPlayed].map((match, matchIndex) => {
      const home = match.player1?.team;
      const away = match.player2?.team;
      if (!home || !away) {
        throw new Error(`EURO playoff Path ${path.name} match ${match.id} is missing a team.`);
      }
      return pathMatchFixture(
        edition, path.name, edition.playoffRoundsPlayed + 1, matchIndex,
        home, away, year, windowId, windowMatchday
      );
    })
  );
  if (matches.length === 0) throw new Error(`EURO playoff "${edition.id}" has no fixtures for its next round.`);
  return [{
    kind: "euroQualifier",
    label: `EURO Qualifying Play-offs · ${edition.playoffRoundsPlayed === 0 ? "Semi-finals" : "Finals"}`,
    leftOut: null,
    euroQualifierId: edition.id,
    euroStage: "playoff",
    euroRound: edition.playoffRoundsPlayed + 1,
    euroTournamentYear: edition.tournamentYear,
    matches
  }];
}

export function recordEuroPlayoffRound(
  edition: EuroQualifyingEdition,
  matches: InternationalMatch[]
): boolean {
  const roundIndex = edition.playoffRoundsPlayed;
  for (const match of matches) {
    if (!match.euroPath || match.euroPathMatch === undefined) {
      throw new Error(`EURO playoff fixture in "${edition.id}" is missing path identifiers.`);
    }
    const path = edition.playoffPaths.find(item => item.name === match.euroPath);
    const bracketMatch = path?.bracket.rounds[roundIndex]?.[match.euroPathMatch];
    if (!bracketMatch) throw new Error(`Unknown EURO playoff fixture for Path ${match.euroPath}.`);
    const winner = match.euroWinner;
    if (!winner) throw new Error(`EURO playoff fixture in Path ${match.euroPath} has no winner.`);
    bracketMatch.winner = winner;
  }
  const currentRoundComplete = edition.playoffPaths.every(path =>
    path.bracket.rounds[roundIndex].every(match => match.winner !== null)
  );
  if (!currentRoundComplete) return false;
  edition.playoffRoundsPlayed++;
  if (edition.playoffRoundsPlayed === 1) {
    for (const path of edition.playoffPaths) {
      const final = path.bracket.rounds[1]?.[0];
      if (!final) throw new Error(`EURO playoff Path ${path.name} has no final bracket slot.`);
      const sourceOne = path.bracket.rounds[0].find(match => match.id === final.sources[0])?.winner;
      const sourceTwo = path.bracket.rounds[0].find(match => match.id === final.sources[1])?.winner;
      if (!sourceOne || !sourceTwo) throw new Error(`EURO playoff Path ${path.name} semi-final winners are missing.`);
      final.player1 = { team: sourceOne };
      final.player2 = { team: sourceTwo };
    }
    return false;
  }
  edition.playoffComplete = true;
  return true;
}

export function getEuroPlayoffFinalRound(
  edition: EuroQualifyingEdition,
  year: number,
  windowId: string,
  windowMatchday: number
): InternationalRound {
  const matches = edition.playoffPaths.map(path => {
    const final = path.bracket.rounds[1]?.[0];
    const home = final?.player1?.team;
    const away = final?.player2?.team;
    if (!home || !away) throw new Error(`EURO playoff Path ${path.name} final teams are not resolved.`);
    return pathMatchFixture(edition, path.name, 2, 0, home, away, year, windowId, windowMatchday);
  });
  return {
    kind: "euroQualifier",
    label: "EURO Qualifying Play-offs · Finals",
    leftOut: null,
    euroQualifierId: edition.id,
    euroStage: "playoff",
    euroRound: 2,
    euroTournamentYear: edition.tournamentYear,
    matches
  };
}

export function getEuroPathBracket(path: InternationalPlayoffPath & { name: string }): Bracket<string> {
  return path.bracket;
}
