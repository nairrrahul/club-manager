import teamWindowsRaw from "../data/team_windows.csv?raw";
import windowsRaw from "../data/international_windows.json";
import { SEASON_START_YEAR } from "../constants";
import { createKnockoutBracket } from "../scheduler";
import type { Bracket } from "../types";
import { shuffledCopy } from "../utils";
import type { InternationalMatch, InternationalRound } from "./international";

export type InternationalCup = "goldCup" | "copaAmerica" | "afcon" | "afcCup" | "ofcCup";
export type InternationalWindowType =
  | "FR" | "NL1" | "NL2" | "GCPO" | "GC" | "COPA"
  | "CAFQP1" | "CAFQP2" | "CAFQM1" | "CAFQM2" | "AFCON1" | "AFCON2"
  | "AFCQP" | "AFCQM" | "AFCCUP" | "OFCCUPQ" | "OFCCUP";
export const INTERNATIONAL_CYCLE_WINDOW_COUNT = 24;

export interface InternationalPlayoffPath {
  teams: string[];
  bracket: Bracket<string>;
}

export interface InternationalPlayoffPathDraw {
  pots: string[][];
  paths: InternationalPlayoffPath[];
}

/**
 * Ranks teams into pots, then distributes one team from each pot into each knockout path.
 * Bottom seeds are always ranked below regular seeds, while retaining their world-rank order.
 */
export function createInternationalPlayoffPaths(
  teams: string[],
  pathCount: number,
  worldRanks: Record<string, number>,
  bottomSeeds: string[] = []
): InternationalPlayoffPathDraw {
  if (!Number.isInteger(pathCount) || pathCount < 1) {
    throw new Error("International playoff path count must be a positive integer.");
  }
  if (teams.length < pathCount * 2) {
    throw new Error(`International playoff paths require at least two teams per path; received ${teams.length} teams for ${pathCount} paths.`);
  }
  if (new Set(teams).size !== teams.length) {
    throw new Error("International playoff teams must be unique.");
  }
  const teamSet = new Set(teams);
  if (new Set(bottomSeeds).size !== bottomSeeds.length || bottomSeeds.some(team => !teamSet.has(team))) {
    throw new Error("Bottom seeds must be unique teams included in the playoff draw.");
  }

  const bottomSeedSet = new Set(bottomSeeds);
  const byWorldRank = (a: string, b: string) =>
    (worldRanks[a] ?? Number.MAX_SAFE_INTEGER) - (worldRanks[b] ?? Number.MAX_SAFE_INTEGER) ||
    a.localeCompare(b);
  const rankedTeams = [
    ...teams.filter(team => !bottomSeedSet.has(team)).sort(byWorldRank),
    ...[...bottomSeeds].sort(byWorldRank)
  ];
  const pots = Array.from({ length: Math.ceil(teams.length / pathCount) }, (_, index) =>
    rankedTeams.slice(index * pathCount, (index + 1) * pathCount)
  );
  const targetSizes = Array.from({ length: pathCount }, (_, index) =>
    Math.floor(teams.length / pathCount) + (index < teams.length % pathCount ? 1 : 0)
  );
  const paths = Array.from({ length: pathCount }, () => [] as string[]);

  for (const pot of pots) {
    const availablePaths = paths
      .map((path, index) => ({ path, index }))
      .filter(({ path, index }) => path.length < targetSizes[index])
      .sort((a, b) => a.path.length - b.path.length || a.index - b.index);
    if (pot.length > availablePaths.length) {
      throw new Error("International playoff draw could not distribute a pot across available paths.");
    }
    pot.forEach((team, index) => availablePaths[index].path.push(team));
  }

  return {
    pots,
    paths: paths.map(pathTeams => ({
      teams: pathTeams,
      bracket: createKnockoutBracket(pathTeams)
    }))
  };
}

export interface InternationalCompetitionGroup {
  name: string;
  teams: string[];
  matches: InternationalMatch[][];
}

export interface InternationalCompetitionKnockoutMatch {
  id: string;
  home: string;
  away: string;
  fixture: InternationalMatch;
  winner: string | null;
}

export interface InternationalCompetitionKnockoutRound {
  label: "Round of 16" | "Quarter-finals" | "Semi-finals" | "Final";
  matches: InternationalCompetitionKnockoutMatch[];
}

export interface InternationalCompetitionEdition {
  id: string;
  year: number;
  suffix?: "1" | "2";
  windowId: string;
  windowMatchday: number;
  hosts: string[];
  teams: string[];
  pots: string[][];
  seedRanks: Record<string, number>;
  groups: InternationalCompetitionGroup[];
  knockout: InternationalCompetitionKnockoutRound[] | null;
  completed: boolean;
  winner: string | null;
  runnerUp: string | null;
  semifinalists: string[];
}

const WINDOW_COUNT_PER_YEAR = 6;
const CYCLE_WINDOW_COUNT = INTERNATIONAL_CYCLE_WINDOW_COUNT;
const GROUP_PAIRINGS = [
  [[0, 1], [2, 3]],
  [[0, 2], [3, 1]],
  [[0, 3], [1, 2]]
];

function parseTeamWindows(csv: string): Map<string, InternationalWindowType[]> {
  const rows = csv.trim().split(/\r?\n/).map(line => line.split(",").map(cell => cell.trim()));
  const parsed = new Map<string, InternationalWindowType[]>();
  for (const [rowIndex, [confederation, ...values]] of rows.entries()) {
    if (!confederation || values.length !== CYCLE_WINDOW_COUNT) {
      throw new Error(`team_windows.csv row ${rowIndex + 1} must contain a confederation and 24 window types.`);
    }
    const types = values.map(value => {
      if (value !== "FR" && value !== "NL1" && value !== "NL2" &&
        !/^GCPO[12]?$/.test(value) && !/^GC[12]?$/.test(value) && value !== "COPA" &&
        !/^(CAFQP|CAFQM|AFCON)[12]$/.test(value) &&
        value !== "AFCQP" && value !== "AFCQM" && value !== "AFCCUP" &&
        value !== "OFCCUPQ" && value !== "OFCCUP") {
        throw new Error(`Unknown team_windows.csv window type "${value}" for ${confederation}.`);
      }
      if (value.startsWith("GCPO")) return "GCPO";
      if (value.startsWith("GC")) return "GC";
      return value as InternationalWindowType;
    });
    if (parsed.has(confederation)) throw new Error(`team_windows.csv contains duplicate ${confederation} rows.`);
    parsed.set(confederation, types);
  }
  if (parsed.size === 0) throw new Error("team_windows.csv does not define any confederations.");
  return parsed;
}

const teamWindows = parseTeamWindows(teamWindowsRaw);

export function assertInternationalWindowCoverage(confederations: string[]): void {
  for (const confederation of confederations) {
    if (!teamWindows.has(confederation)) throw new Error(`team_windows.csv is missing the ${confederation} row.`);
  }
}

function windowNumber(windowId: string): number {
  const match = /^IW([1-6])$/.exec(windowId);
  if (!match) throw new Error(`Unknown international window ID "${windowId}".`);
  return Number(match[1]) - 1;
}

export function getInternationalWindowIndex(year: number, windowId: string): number {
  return (year - SEASON_START_YEAR) * WINDOW_COUNT_PER_YEAR + windowNumber(windowId);
}

export function getInternationalWindowLocation(index: number): { year: number; windowId: string } {
  const yearOffset = Math.floor(index / WINDOW_COUNT_PER_YEAR);
  const window = ((index % WINDOW_COUNT_PER_YEAR) + WINDOW_COUNT_PER_YEAR) % WINDOW_COUNT_PER_YEAR;
  return { year: SEASON_START_YEAR + yearOffset, windowId: `IW${window + 1}` };
}

export function getInternationalWindowTypeAt(confederation: string, index: number): InternationalWindowType {
  const types = teamWindows.get(confederation);
  if (!types) throw new Error(`No team-window schedule is configured for ${confederation}.`);
  const cycleIndex = ((index % CYCLE_WINDOW_COUNT) + CYCLE_WINDOW_COUNT) % CYCLE_WINDOW_COUNT;
  return types[cycleIndex];
}

export function getInternationalWindowType(
  confederation: string,
  year: number,
  windowId: string
): InternationalWindowType {
  return getInternationalWindowTypeAt(confederation, getInternationalWindowIndex(year, windowId));
}

export function getNextCompetitionWindow(
  year: number,
  windowId: string,
  predicate: (year: number, windowId: string) => boolean
): { year: number; windowId: string; afterMatchday: number } {
  const currentIndex = getInternationalWindowIndex(year, windowId);
  const windows = (windowsRaw as { windows: { id: string; afterMatchday: number }[] }).windows;
  for (let offset = 1; offset <= CYCLE_WINDOW_COUNT; offset++) {
    const index = currentIndex + offset;
    const location = getInternationalWindowLocation(index);
    if (!predicate(location.year, location.windowId)) continue;
    const definition = windows.find(window => window.id === location.windowId);
    if (!definition) throw new Error(`No definition found for international window "${location.windowId}".`);
    return { ...location, afterMatchday: definition.afterMatchday };
  }
  throw new Error(`No matching international competition window follows ${year} ${windowId}.`);
}

function createMatch(
  home: string,
  away: string,
  kind: InternationalMatch["kind"],
  year: number,
  windowId: string,
  windowMatchday: number,
  extra: Partial<InternationalMatch>
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

export function drawInternationalCupGroups(
  teams: string[],
  hosts: string[],
  worldRanks: Record<string, number>,
  groupNames: string[] = ["A", "B", "C", "D"]
): { pots: string[][]; groups: string[][] } {
  if (groupNames.length === 0 || teams.length % groupNames.length !== 0) {
    throw new Error("International cup teams must divide evenly among the groups.");
  }
  const teamsPerGroup = teams.length / groupNames.length;
  if (hosts.length > groupNames.length) throw new Error("The number of hosts exceeds the pot-one capacity.");
  const hostSet = new Set(hosts);
  const ranked = [...teams].sort((a, b) =>
    (worldRanks[a] ?? Number.MAX_SAFE_INTEGER) - (worldRanks[b] ?? Number.MAX_SAFE_INTEGER) ||
    a.localeCompare(b)
  );
  const potOne = [
    ...ranked.filter(code => hostSet.has(code)),
    ...ranked.filter(code => !hostSet.has(code)).slice(0, groupNames.length - hosts.length)
  ];
  const remaining = ranked.filter(code => !potOne.includes(code));
  const pots = [
    potOne,
    ...Array.from({ length: teamsPerGroup - 1 }, (_, index) =>
      remaining.slice(index * groupNames.length, (index + 1) * groupNames.length))
  ];
  const groups = groupNames.map(() => [] as string[]);
  for (const pot of pots) {
    shuffledCopy(pot).forEach((team, index) => groups[index].push(team));
  }
  return { pots, groups };
}

export function createInternationalCupGroupMatches(
  teams: string[],
  group: string,
  year: number,
  windowId: string,
  windowMatchday: number,
  competition: InternationalCup = "goldCup",
  competitionEditionId?: string
): InternationalMatch[][] {
  const editionId = competitionEditionId ??
    `${competition === "goldCup" ? "GC" : competition === "copaAmerica" ? "COPA" : competition === "afcon" ? "AFCON" : competition === "afcCup" ? "AFC" : "OFC"}-${year}-${windowId}`;
  const matchKinds: Record<InternationalCup, InternationalMatch["kind"]> = {
    goldCup: "goldCupGroup",
    copaAmerica: "copaAmericaGroup",
    afcon: "afconGroup",
    afcCup: "afcCupGroup",
    ofcCup: "ofcCupGroup"
  };
  return GROUP_PAIRINGS.map((pairing, roundIndex) =>
    pairing.map(([homeIndex, awayIndex]) =>
      createMatch(teams[homeIndex], teams[awayIndex], matchKinds[competition], year, windowId, windowMatchday,
        competition === "goldCup"
          ? {
              goldCupEditionId: editionId,
              goldCupStage: "group",
              goldCupGroup: group,
              goldCupRound: roundIndex + 1
            }
          : competition === "copaAmerica"
            ? {
                copaAmericaEditionId: editionId,
                copaAmericaStage: "group",
                copaAmericaGroup: group,
                copaAmericaRound: roundIndex + 1
              }
            : competition === "afcon"
            ? {
                afconEditionId: editionId,
                afconStage: "group",
                afconGroup: group,
                afconRound: roundIndex + 1
              }
            : competition === "afcCup"
            ? {
                afcCupEditionId: editionId,
                afcCupStage: "group",
                afcCupGroup: group,
                afcCupRound: roundIndex + 1
              }
            : {
                ofcCupEditionId: editionId,
                ofcCupStage: "group",
                ofcCupGroup: group,
                ofcCupRound: roundIndex + 1
              })
    )
  );
}

export function getInternationalCupStandings(
  edition: Pick<InternationalCompetitionEdition, "seedRanks">,
  group: InternationalCompetitionGroup
) {
  const rows = new Map(group.teams.map(code => [code, {
    code, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0
  }]));
  for (const match of group.matches.flat()) {
    if (match.homeGoals === null || match.awayGoals === null) continue;
    const home = rows.get(match.home);
    const away = rows.get(match.away);
    if (!home || !away) throw new Error(`Invalid fixture in international Group ${group.name}.`);
    home.played++;
    away.played++;
    home.goalsFor += match.homeGoals;
    home.goalsAgainst += match.awayGoals;
    away.goalsFor += match.awayGoals;
    away.goalsAgainst += match.homeGoals;
    if (match.homeGoals > match.awayGoals) {
      home.won++;
      away.lost++;
      home.points += 3;
    } else if (match.homeGoals < match.awayGoals) {
      away.won++;
      home.lost++;
      away.points += 3;
    } else {
      home.drawn++;
      away.drawn++;
      home.points++;
      away.points++;
    }
  }
  return [...rows.values()].map(row => ({
    ...row,
    goalDifference: row.goalsFor - row.goalsAgainst
  })).sort((a, b) =>
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    (edition.seedRanks[a.code] ?? Number.MAX_SAFE_INTEGER) -
      (edition.seedRanks[b.code] ?? Number.MAX_SAFE_INTEGER)
  );
}

function makeKnockoutMatch(
  edition: InternationalCompetitionEdition,
  id: string,
  home: string,
  away: string,
  competition: Exclude<InternationalCup, "afcon" | "afcCup" | "ofcCup">
): InternationalCompetitionKnockoutMatch {
  const isGoldCup = competition === "goldCup";
  const fixture = createMatch(
    home,
    away,
    isGoldCup ? "goldCupKnockout" : "copaAmericaKnockout",
    edition.year,
    edition.windowId,
    edition.windowMatchday,
    isGoldCup
      ? {
          goldCupEditionId: edition.id,
          goldCupStage: "knockout",
          goldCupKnockoutMatchId: id
        }
      : {
          copaAmericaEditionId: edition.id,
          copaAmericaStage: "knockout",
          copaAmericaKnockoutMatchId: id
        }
  );
  return { id, home, away, fixture, winner: null };
}

export function advanceInternationalCupRound(
  edition: InternationalCompetitionEdition,
  roundIndex: number,
  competition: Exclude<InternationalCup, "afcon" | "afcCup" | "ofcCup"> = "goldCup"
): InternationalRound | null {
  const roundKind = competition;
  const competitionLabel = competition === "goldCup" ? "Gold Cup" : "Copa América";
  if (roundIndex === -1) {
    if (edition.groups.some(group => group.matches.flat().some(match => match.homeGoals === null || match.awayGoals === null))) {
      return null;
    }
    const topTwo = Object.fromEntries(edition.groups.map(group => [
      group.name,
      getInternationalCupStandings(edition, group).slice(0, 2).map(row => row.code)
    ])) as Record<"A" | "B" | "C" | "D", string[]>;
    const quarterFinals = [
      ["A", 0, "B", 1],
      ["C", 0, "D", 1],
      ["B", 0, "A", 1],
      ["D", 0, "C", 1]
    ] as const;
    const matches = quarterFinals.map(([group1, place1, group2, place2], index) =>
      makeKnockoutMatch(edition, `QF${index + 1}`, topTwo[group1][place1], topTwo[group2][place2], competition)
    );
    edition.knockout = [{ label: "Quarter-finals", matches }];
    return { kind: roundKind, label: `${competitionLabel} · Quarter-finals`, leftOut: null, matches: matches.map(match => match.fixture) };
  }

  const knockout = edition.knockout;
  const round = knockout?.[roundIndex];
  if (!round || round.matches.some(match => match.winner === null)) return null;
  if (roundIndex === 0 || roundIndex === 1) {
    const winners = round.matches.map(match => match.winner as string);
    const nextMatches = Array.from({ length: roundIndex === 0 ? 2 : 1 }, (_, index) =>
      makeKnockoutMatch(edition, roundIndex === 0 ? `SF${index + 1}` : "F",
        winners[index * 2], winners[index * 2 + 1], competition)
    );
    const label = roundIndex === 0 ? "Semi-finals" : "Final";
    knockout.push({ label, matches: nextMatches });
    if (roundIndex === 1) {
      edition.semifinalists = round.matches.map(match => {
        if (!match.winner) throw new Error(`${competitionLabel} semi-final "${match.id}" has no winner.`);
        return match.winner === match.home ? match.away : match.home;
      });
    }
    return { kind: roundKind, label: `${competitionLabel} · ${label}`, leftOut: null, matches: nextMatches.map(match => match.fixture) };
  }

  const final = round.matches[0];
  edition.winner = final.winner;
  edition.runnerUp = final.winner === final.home ? final.away : final.home;
  edition.completed = true;
  return null;
}

export function setInternationalCupKnockoutWinner(
  edition: InternationalCompetitionEdition,
  matchId: string,
  winner: string
): void {
  const match = edition.knockout?.flatMap(round => round.matches).find(item => item.id === matchId);
  if (!match) throw new Error(`Unknown international cup knockout match "${matchId}".`);
  match.winner = winner;
}
