import hostOptionsRaw from "../data/tournament_hosts.json";
import { getCountriesByRegion } from "../nations";
import { shuffledCopy } from "../utils";
import {
  createInternationalCupGroupMatches,
  drawInternationalCupGroups,
  getInternationalCupStandings,
  getInternationalWindowType,
  getNextCompetitionWindow
} from "./internationalCompetitionsUtils";
import type {
  InternationalCompetitionEdition,
  InternationalCompetitionGroup,
  InternationalCompetitionKnockoutMatch
} from "./internationalCompetitionsUtils";
import type { InternationalMatch, InternationalRound } from "./international";

const hostOptions = (hostOptionsRaw as Record<string, string[]>).OFCCUP ?? [];
const qualifierGroupNames = ["A", "B"];
const tournamentGroupNames = ["A", "B"];
const QUALIFYING_MATCHDAYS_PER_WINDOW = [3, 3, 2, 2];

export interface OfcCupQualifyingEdition {
  id: string;
  year: number;
  hosts: string[];
  teams: string[];
  pots: string[][];
  seedRanks: Record<string, number>;
  groups: InternationalCompetitionGroup[];
  roundsPlayed: number;
  qualifiers: string[];
  completed: boolean;
}

export interface OfcCupState {
  qualifyingEditions: OfcCupQualifyingEdition[];
  editions: InternationalCompetitionEdition[];
}

export function createOfcCupState(): OfcCupState {
  return { qualifyingEditions: [], editions: [] };
}

export function getOfcCupWindowType(year: number, windowId: string): "OFCCUPQ" | "OFCCUP" | null {
  const type = getInternationalWindowType("OFC", year, windowId);
  return type === "OFCCUPQ" || type === "OFCCUP" ? type : null;
}

function createMatch(
  home: string,
  away: string,
  kind: string,
  year: number,
  windowId: string,
  windowMatchday: number,
  extra: Partial<InternationalMatch> = {}
): InternationalMatch {
  return {
    home,
    away,
    kind,
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

function createFiveTeamGroupMatches(
  teams: string[],
  group: string,
  editionId: string,
  year: number,
  windowId: string,
  windowMatchday: number
): InternationalMatch[][] {
  if (teams.length !== 5) throw new Error(`OFC qualifying Group ${group} requires five teams.`);
  const rotating: (string | null)[] = [...teams, null];
  const firstLegs: [string, string][][] = [];
  for (let roundIndex = 0; roundIndex < 5; roundIndex++) {
    const fixtures: [string, string][] = [];
    for (let index = 0; index < rotating.length / 2; index++) {
      const home = rotating[index];
      const away = rotating[rotating.length - 1 - index];
      if (home && away) fixtures.push(roundIndex % 2 === 0 ? [home, away] : [away, home]);
    }
    firstLegs.push(fixtures);
    rotating.splice(1, 0, rotating.pop()!);
  }
  const fixtures = [...firstLegs, ...firstLegs.map(round => round.map(([home, away]) => [away, home] as [string, string]))];
  return fixtures.map((round, roundIndex) => round.map(([home, away]) =>
    createMatch(home, away, "ofcCupQualifier", year, windowId, windowMatchday, {
      ofcCupQualifierId: editionId,
      ofcCupStage: "qualifying",
      ofcCupGroup: group,
      ofcCupRound: roundIndex + 1
    })
  ));
}

function getStandings(group: InternationalCompetitionGroup, seedRanks: Record<string, number>) {
  return getInternationalCupStandings({ seedRanks }, group);
}

export function getOfcCupQualifierStandings(
  edition: OfcCupQualifyingEdition,
  group: InternationalCompetitionGroup
) {
  if (!edition.groups.some(item => item.name === group.name)) {
    throw new Error(`Unknown OFC Cup qualifying group "${group.name}" in "${edition.id}".`);
  }
  return getStandings(group, edition.seedRanks).map((row, index) => ({ ...row, position: index + 1 }));
}

export function createOfcCupQualifierEdition(
  state: OfcCupState,
  year: number,
  worldRanks: Record<string, number>
): OfcCupQualifyingEdition {
  const hostOption = hostOptions[Math.floor(Math.random() * hostOptions.length)];
  if (!hostOption) throw new Error("No OFC Cup host configuration is available.");
  const hosts = hostOption.split("|");
  if (hosts.length !== 1) throw new Error(`OFC Cup requires one host; found ${hosts.length}.`);
  const allTeams = getCountriesByRegion("OFC").map(nation => nation.code);
  const teams = allTeams.filter(code => !hosts.includes(code));
  if (teams.length !== 10) {
    throw new Error(`OFC Cup qualifying requires ten teams after hosting selection; found ${teams.length}.`);
  }
  const ranked = [...teams].sort((a, b) =>
    (worldRanks[a] ?? Number.MAX_SAFE_INTEGER) - (worldRanks[b] ?? Number.MAX_SAFE_INTEGER) ||
    a.localeCompare(b)
  );
  const pots = Array.from({ length: 5 }, (_, index) => ranked.slice(index * 2, (index + 1) * 2));
  const groups = qualifierGroupNames.map(() => [] as string[]);
  for (const pot of pots) shuffledCopy(pot).forEach((team, index) => groups[index].push(team));
  const id = `OFCQ-${year}`;
  const edition: OfcCupQualifyingEdition = {
    id,
    year,
    hosts,
    teams,
    pots,
    seedRanks: Object.fromEntries(teams.map(code => [code, worldRanks[code] ?? Number.MAX_SAFE_INTEGER])),
    groups: groups.map((groupTeams, index) => ({
      name: qualifierGroupNames[index],
      teams: groupTeams,
      matches: createFiveTeamGroupMatches(groupTeams, qualifierGroupNames[index], id, year, "IW1", 2)
    })),
    roundsPlayed: 0,
    qualifiers: [],
    completed: false
  };
  state.qualifyingEditions.push(edition);
  return edition;
}

export function findOfcCupQualifier(state: OfcCupState, year: number): OfcCupQualifyingEdition | null {
  return state.qualifyingEditions.find(item => item.year === year) ?? null;
}

export function getOfcCupQualifier(state: OfcCupState, id: string): OfcCupQualifyingEdition {
  const edition = state.qualifyingEditions.find(item => item.id === id);
  if (!edition) throw new Error(`Unknown OFC Cup qualifying edition "${id}".`);
  return edition;
}

export function getOfcCupQualifyingRounds(
  edition: OfcCupQualifyingEdition,
  year: number,
  windowId: string,
  windowMatchday: number
): InternationalRound[] {
  let scheduledStart = 0;
  const matchdayCount = QUALIFYING_MATCHDAYS_PER_WINDOW.find(count => {
    const startsHere = edition.roundsPlayed === scheduledStart;
    scheduledStart += count;
    return startsHere;
  });
  if (matchdayCount === undefined) {
    throw new Error(`OFC Cup qualifying "${edition.id}" has no remaining scheduled matchdays.`);
  }
  return Array.from({ length: matchdayCount }, (_, offset) => {
    const roundIndex = edition.roundsPlayed + offset;
    const matches = edition.groups.flatMap(group => group.matches[roundIndex]);
    matches.forEach(match => {
      match.windowYear = year;
      match.windowId = windowId;
      match.windowMatchday = windowMatchday;
    });
    return {
      kind: "ofcCupQualifier" as const,
      label: `OFC Cup Qualifying · Matchday ${roundIndex + 1}`,
      leftOut: null,
      ofcCupQualifierId: edition.id,
      ofcCupStage: "qualifying" as const,
      ofcCupRound: roundIndex + 1,
      matches
    };
  });
}

function createOfcCupEdition(
  qualifier: OfcCupQualifyingEdition,
  tournamentWindow: { year: number; windowId: string; afterMatchday: number },
  worldRanks: Record<string, number>
): InternationalCompetitionEdition {
  const teams = [...qualifier.hosts, ...qualifier.qualifiers];
  if (teams.length !== 8 || new Set(teams).size !== 8) {
    throw new Error(`OFC Cup requires eight unique teams; received ${teams.length}.`);
  }
  const { pots, groups } = drawInternationalCupGroups(teams, qualifier.hosts, worldRanks, tournamentGroupNames);
  const id = `OFC-${tournamentWindow.year}`;
  return {
    id,
    year: tournamentWindow.year,
    windowId: tournamentWindow.windowId,
    windowMatchday: tournamentWindow.afterMatchday,
    hosts: [...qualifier.hosts],
    teams,
    pots,
    seedRanks: Object.fromEntries(teams.map(code => [code, worldRanks[code] ?? Number.MAX_SAFE_INTEGER])),
    groups: groups.map((groupTeams, index) => ({
      name: tournamentGroupNames[index],
      teams: groupTeams,
      matches: createInternationalCupGroupMatches(
        groupTeams,
        tournamentGroupNames[index],
        tournamentWindow.year,
        tournamentWindow.windowId,
        tournamentWindow.afterMatchday,
        "ofcCup",
        id
      )
    })),
    knockout: null,
    completed: false,
    winner: null,
    runnerUp: null,
    semifinalists: []
  };
}

export function completeOfcCupQualifiers(
  state: OfcCupState,
  qualifierId: string,
  year: number,
  windowId: string,
  worldRanks: Record<string, number>
): InternationalCompetitionEdition {
  const qualifier = getOfcCupQualifier(state, qualifierId);
  if (qualifier.roundsPlayed !== 10) {
    throw new Error(`OFC Cup qualifying "${qualifierId}" is incomplete after ${qualifier.roundsPlayed} matchdays.`);
  }
  const groupRows = qualifier.groups.map(group => getStandings(group, qualifier.seedRanks));
  const topThree = groupRows.flatMap(rows => rows.slice(0, 3).map(row => row.code));
  const bestFourth = groupRows.map(rows => rows[3]).sort((a, b) =>
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    (qualifier.seedRanks[a.code] ?? Number.MAX_SAFE_INTEGER) -
      (qualifier.seedRanks[b.code] ?? Number.MAX_SAFE_INTEGER)
  )[0];
  if (!bestFourth) throw new Error(`OFC Cup qualifying "${qualifierId}" has no fourth-place teams.`);
  qualifier.qualifiers = [...topThree, bestFourth.code];
  qualifier.completed = true;

  const tournamentWindow = getNextCompetitionWindow(year, windowId, (candidateYear, candidateWindow) =>
    getOfcCupWindowType(candidateYear, candidateWindow) === "OFCCUP"
  );
  const edition = createOfcCupEdition(qualifier, tournamentWindow, worldRanks);
  if (!state.editions.some(item => item.id === edition.id)) state.editions.push(edition);
  return edition;
}

export function getOfcCupTournament(state: OfcCupState, year: number): InternationalCompetitionEdition | null {
  return state.editions.find(item => item.year === year) ?? null;
}

export function getOfcCupTournamentRounds(edition: InternationalCompetitionEdition): InternationalRound[] {
  return [0, 1, 2].map(roundIndex => ({
    kind: "ofcCup",
    label: `OFC Cup · Group stage · Matchday ${roundIndex + 1}`,
    leftOut: null,
    matches: edition.groups.flatMap(group => group.matches[roundIndex])
  }));
}

function makeKnockoutMatch(
  edition: InternationalCompetitionEdition,
  id: string,
  home: string,
  away: string
): InternationalCompetitionKnockoutMatch {
  const fixture = createMatch(home, away, "ofcCupKnockout", edition.year, edition.windowId, edition.windowMatchday, {
    ofcCupEditionId: edition.id,
    ofcCupStage: "knockout",
    ofcCupKnockoutMatchId: id
  });
  return { id, home, away, fixture, winner: null };
}

export function startOfcCupSemiFinals(edition: InternationalCompetitionEdition): InternationalRound | null {
  if (edition.groups.some(group => group.matches.flat().some(match =>
    match.homeGoals === null || match.awayGoals === null
  ))) return null;
  const groupA = getInternationalCupStandings(edition, edition.groups.find(group => group.name === "A")!).map(row => row.code);
  const groupB = getInternationalCupStandings(edition, edition.groups.find(group => group.name === "B")!).map(row => row.code);
  const matches = [
    makeKnockoutMatch(edition, "SF-1", groupA[0], groupB[1]),
    makeKnockoutMatch(edition, "SF-2", groupB[0], groupA[1])
  ];
  edition.knockout = [{ label: "Semi-finals", matches }];
  return { kind: "ofcCup", label: "OFC Cup · Semi-finals", leftOut: null, matches: matches.map(match => match.fixture) };
}

export function setOfcCupKnockoutWinner(
  edition: InternationalCompetitionEdition,
  matchId: string,
  winner: string
): void {
  const match = edition.knockout?.flatMap(round => round.matches).find(item => item.id === matchId);
  if (!match) throw new Error(`Unknown OFC Cup knockout match "${matchId}".`);
  match.winner = winner;
}

export function advanceOfcCupKnockoutRound(
  edition: InternationalCompetitionEdition,
  roundIndex: number
): InternationalRound | null {
  const round = edition.knockout?.[roundIndex];
  if (!round || round.matches.some(match => match.winner === null)) return null;
  if (round.label === "Final") {
    const final = round.matches[0];
    edition.winner = final.winner;
    edition.runnerUp = final.winner === final.home ? final.away : final.home;
    edition.completed = true;
    const semifinals = edition.knockout?.find(item => item.label === "Semi-finals");
    edition.semifinalists = semifinals?.matches.flatMap(match =>
      match.winner ? [match.winner === match.home ? match.away : match.home] : []
    ) ?? [];
    return null;
  }
  const [first, second] = round.matches.map(match => match.winner as string);
  const matches = [makeKnockoutMatch(edition, "F", first, second)];
  edition.knockout?.push({ label: "Final", matches });
  return { kind: "ofcCup", label: "OFC Cup · Final", leftOut: null, matches: matches.map(match => match.fixture) };
}
