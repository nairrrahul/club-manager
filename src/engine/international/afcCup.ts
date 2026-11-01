import hostOptionsRaw from "../data/intl/tournament_hosts.json";
import { getCountriesByRegion } from "../nations";
import { createTwentyFourTeamRoundOf16, pairKnockoutWinners } from "../knockout24";
import { shuffledCopy } from "../utils";
import {
  createInternationalCupGroupMatches, drawInternationalCupGroups, getInternationalCupStandings,
  getCompetitivelyEligibleTeams, getDistributedInternationalRoundSchedule, getFixedInternationalCompetitionHosts,
  getInternationalWindowType, getNextCompetitionWindow
} from "./internationalCompetitionsUtils";
import type {
  InternationalCompetitionEdition, InternationalCompetitionGroup,
  InternationalCompetitionKnockoutMatch, InternationalCompetitionKnockoutRound
} from "./internationalCompetitionsUtils";
import type { GoldCupPlayoffTie } from "./goldCup";
import type { InternationalMatch, InternationalRound } from "./international";

const hostOptions = (hostOptionsRaw as Record<string, string[]>).AFCCUP ?? [];
const qualifyingGroupNames = [..."ABCDEFGHIJ"];
const tournamentGroupNames = [..."ABCDEF"];

export interface AfcCupQualifyingEdition {
  id: string;
  year: number;
  hosts: string[];
  preliminaryTeams: string[];
  mainByes: string[];
  preliminaryTies: GoldCupPlayoffTie[];
  preliminaryComplete: boolean;
  mainGroups: InternationalCompetitionGroup[] | null;
  mainRoundsPlayed: number;
  mainQualifiers: string[];
  completed: boolean;
  seedRanks: Record<string, number>;
}

export interface AfcCupState {
  qualifyingEditions: AfcCupQualifyingEdition[];
  editions: InternationalCompetitionEdition[];
}

export function createAfcCupState(): AfcCupState {
  return { qualifyingEditions: [], editions: [] };
}

export function getAfcCupWindowType(year: number, windowId: string): "AFCQP" | "AFCQM" | "AFCCUP" | null {
  const type = getInternationalWindowType("AFC", year, windowId);
  return type === "AFCQP" || type === "AFCQM" || type === "AFCCUP" ? type : null;
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

function createMainGroupMatches(
  teams: string[],
  group: string,
  editionId: string,
  year: number,
  windowId: string,
  windowMatchday: number
): InternationalMatch[][] {
  const [a, b, c, d] = teams;
  const firstLegs: [string, string][][] = [
    [[a, d], [b, c]],
    [[a, c], [d, b]],
    [[a, b], [c, d]]
  ];
  const fixtures = [...firstLegs, ...firstLegs.map(round => round.map(([home, away]) => [away, home] as [string, string]))];
  return fixtures.map((matches, roundIndex) => matches.map(([home, away]) =>
    createMatch(home, away, "afcCupQualifier", year, windowId, windowMatchday, {
      afcCupEditionId: editionId,
      afcCupQualifierId: editionId,
      afcCupStage: "main",
      afcCupGroup: group,
      afcCupRound: roundIndex + 1
    })
  ));
}

function standings(group: InternationalCompetitionGroup, seedRanks: Record<string, number>) {
  return getInternationalCupStandings({ seedRanks }, group);
}

export function getAfcCupQualifierStandings(
  edition: AfcCupQualifyingEdition,
  group: InternationalCompetitionGroup
) {
  if (!edition.mainGroups?.some(item => item.name === group.name)) {
    throw new Error(`Unknown AFC Cup qualifying group "${group.name}" in "${edition.id}".`);
  }
  return standings(group, edition.seedRanks).map((row, index) => ({ ...row, position: index + 1 }));
}

function drawMainQualifiers(
  edition: AfcCupQualifyingEdition,
  qualifiedTeams: string[],
  year: number,
  windowId: string,
  windowMatchday: number,
  worldRanks: Record<string, number>
): void {
  if (qualifiedTeams.length !== 40 || new Set(qualifiedTeams).size !== 40) {
    throw new Error(`AFC Cup main qualifying requires 40 unique teams; received ${qualifiedTeams.length}.`);
  }
  edition.seedRanks = Object.fromEntries(qualifiedTeams.map(code => [code, worldRanks[code] ?? Number.MAX_SAFE_INTEGER]));
  const ranked = [...qualifiedTeams].sort((a, b) =>
    (worldRanks[a] ?? Number.MAX_SAFE_INTEGER) - (worldRanks[b] ?? Number.MAX_SAFE_INTEGER) ||
    a.localeCompare(b)
  );
  const pots = Array.from({ length: 4 }, (_, index) => ranked.slice(index * 10, (index + 1) * 10));
  const groups = qualifyingGroupNames.map(() => [] as string[]);
  for (const pot of pots) shuffledCopy(pot).forEach((team, index) => groups[index].push(team));
  edition.mainGroups = groups.map((teams, index) => ({
    name: qualifyingGroupNames[index],
    teams,
    matches: createMainGroupMatches(teams, qualifyingGroupNames[index], edition.id, year, windowId, windowMatchday)
  }));
  edition.mainRoundsPlayed = 0;
  edition.preliminaryComplete = true;
}

export function createAfcCupQualifierEdition(
  state: AfcCupState,
  year: number,
  windowId: string,
  windowMatchday: number,
  worldRanks: Record<string, number>
): AfcCupQualifyingEdition {
  const tournamentWindow = getNextCompetitionWindow(year, windowId, (candidateYear, candidateWindow) =>
    getAfcCupWindowType(candidateYear, candidateWindow) === "AFCCUP"
  );
  const fixedHosts = getFixedInternationalCompetitionHosts("AFCCUP", tournamentWindow.year + 1);
  const hostsOption = fixedHosts ? null : hostOptions[Math.floor(Math.random() * hostOptions.length)];
  if (!fixedHosts && !hostsOption) throw new Error("No AFC Cup host configuration is available.");
  const hosts = fixedHosts ?? hostsOption!.split("|");
  const hostSet = new Set(hosts);
  const allTeams = getCountriesByRegion("AFC").map(nation => nation.code);
  if (allTeams.length !== 46) throw new Error(`AFC Cup qualifying expects 46 AFC nations; found ${allTeams.length}.`);
  const ranked = getCompetitivelyEligibleTeams(allTeams, tournamentWindow.year);
  ranked.sort((a, b) =>
    (worldRanks[a] ?? Number.MAX_SAFE_INTEGER) - (worldRanks[b] ?? Number.MAX_SAFE_INTEGER) || a.localeCompare(b)
  );
  const nonHosts = ranked.filter(code => !hostSet.has(code));
  const preliminaryCount = Math.max(0, (nonHosts.length - 40) * 2);
  const preliminaryTeams = preliminaryCount > 0 ? nonHosts.slice(-preliminaryCount) : [];
  const preliminarySet = new Set(preliminaryTeams);
  const id = `AFCQ-${year}`;
  const ties: GoldCupPlayoffTie[] = Array.from({ length: preliminaryTeams.length / 2 }, (_, index) => {
    const team1 = preliminaryTeams[index];
    const team2 = preliminaryTeams[preliminaryTeams.length - 1 - index];
    const tieId = `${id}-T${index + 1}`;
    return {
      id: tieId,
      team1,
      team2,
      firstLeg: createMatch(team1, team2, "afcCupQualifier", year, windowId, windowMatchday, {
        afcCupQualifierId: id,
        afcCupTieId: tieId,
        afcCupStage: "preliminary",
        afcCupLeg: 1
      }),
      secondLeg: createMatch(team2, team1, "afcCupQualifier", year, windowId, windowMatchday, {
        afcCupQualifierId: id,
        afcCupTieId: tieId,
        afcCupStage: "preliminary",
        afcCupLeg: 2
      }),
      winner: null,
      penalties: null
    };
  });
  const edition: AfcCupQualifyingEdition = {
    id,
    year,
    hosts,
    preliminaryTeams,
    mainByes: nonHosts.filter(code => !preliminarySet.has(code)),
    preliminaryTies: ties,
    preliminaryComplete: ties.length === 0,
    mainGroups: null,
    mainRoundsPlayed: 0,
    mainQualifiers: [],
    completed: false,
    seedRanks: {}
  };
  state.qualifyingEditions.push(edition);
  if (ties.length === 0) drawMainQualifiers(edition, nonHosts, year, windowId, windowMatchday, worldRanks);
  return edition;
}

export function findAfcCupQualifier(state: AfcCupState, year: number): AfcCupQualifyingEdition | null {
  return state.qualifyingEditions.find(item => item.year === year) ?? null;
}

export function getAfcCupQualifier(state: AfcCupState, id: string): AfcCupQualifyingEdition {
  const edition = state.qualifyingEditions.find(item => item.id === id);
  if (!edition) throw new Error(`Unknown AFC Cup qualifying edition "${id}".`);
  return edition;
}

export function getAfcCupPreliminaryRounds(edition: AfcCupQualifyingEdition): InternationalRound[] {
  if (edition.preliminaryTies.length === 0) return [];
  return [
    {
      kind: "afcCupQualifier",
      label: "AFC Cup Qualifying · Preliminary · First legs",
      leftOut: null,
      afcCupQualifierId: edition.id,
      afcCupStage: "preliminary",
      matches: edition.preliminaryTies.map(tie => tie.firstLeg)
    },
    {
      kind: "afcCupQualifier",
      label: "AFC Cup Qualifying · Preliminary · Second legs",
      leftOut: null,
      afcCupQualifierId: edition.id,
      afcCupStage: "preliminary",
      matches: edition.preliminaryTies.map(tie => tie.secondLeg)
    }
  ];
}

export function resolveAfcCupPreliminaryTie(
  state: AfcCupState,
  qualifierId: string,
  tieId: string,
  winner: string,
  penalties: { home: string[]; away: string[] } | null
): void {
  const tie = getAfcCupQualifier(state, qualifierId).preliminaryTies.find(item => item.id === tieId);
  if (!tie) throw new Error(`Unknown AFC Cup preliminary tie "${tieId}".`);
  tie.winner = winner;
  tie.penalties = penalties;
}

export function completeAfcCupPreliminary(
  state: AfcCupState,
  qualifierId: string,
  year: number,
  windowId: string,
  windowMatchday: number,
  worldRanks: Record<string, number>
): void {
  const edition = getAfcCupQualifier(state, qualifierId);
  if (edition.preliminaryTies.some(tie => !tie.winner)) {
    throw new Error(`AFC Cup preliminary round "${qualifierId}" cannot complete before every tie is decided.`);
  }
  drawMainQualifiers(
    edition,
    [...edition.mainByes, ...edition.preliminaryTies.map(tie => tie.winner as string)],
    year,
    windowId,
    windowMatchday,
    worldRanks
  );
}

export function getAfcCupMainRounds(
  edition: AfcCupQualifyingEdition,
  year: number,
  windowId: string,
  windowMatchday: number
): InternationalRound[] {
  if (!edition.mainGroups) throw new Error(`AFC Cup main qualifying groups are not drawn for "${edition.id}".`);
  const competitionType = getInternationalWindowType("AFC", year, windowId);
  const schedule = getDistributedInternationalRoundSchedule("AFC", competitionType, year, windowId, 6);
  if (edition.mainRoundsPlayed !== schedule.start) {
    throw new Error(`AFC Cup qualifying expected matchday ${schedule.start + 1}, but ${edition.mainRoundsPlayed} matchdays have been played.`);
  }
  return Array.from({ length: schedule.count }, (_, offset) => {
    const roundIndex = schedule.start + offset;
    const matches = edition.mainGroups!.flatMap(group => group.matches[roundIndex]);
    matches.forEach(match => {
      match.windowYear = year;
      match.windowId = windowId;
      match.windowMatchday = windowMatchday;
    });
    return {
      kind: "afcCupQualifier" as const,
      label: `AFC Cup Qualifying · Main round · Matchday ${roundIndex + 1}`,
      leftOut: null,
      afcCupQualifierId: edition.id,
      afcCupStage: "main" as const,
      afcCupRound: roundIndex + 1,
      matches
    };
  });
}

function createAfcCupEdition(
  qualifier: AfcCupQualifyingEdition,
  tournamentWindow: { year: number; windowId: string; afterMatchday: number },
  worldRanks: Record<string, number>
): InternationalCompetitionEdition {
  const teams = [...qualifier.hosts, ...qualifier.mainQualifiers];
  if (teams.length !== 24 || new Set(teams).size !== 24) {
    throw new Error(`AFC Cup requires 24 unique teams; received ${teams.length}.`);
  }
  const { pots, groups } = drawInternationalCupGroups(teams, qualifier.hosts, worldRanks, tournamentGroupNames);
  const id = `AFC-${tournamentWindow.year}`;
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
        groupTeams, tournamentGroupNames[index], tournamentWindow.year, tournamentWindow.windowId,
        tournamentWindow.afterMatchday, "afcCup", id
      )
    })),
    knockout: null,
    completed: false,
    winner: null,
    runnerUp: null,
    semifinalists: []
  };
}

export function completeAfcCupMainQualifiers(
  state: AfcCupState,
  qualifierId: string,
  year: number,
  windowId: string,
  worldRanks: Record<string, number>
): InternationalCompetitionEdition {
  const qualifier = getAfcCupQualifier(state, qualifierId);
  if (!qualifier.mainGroups || qualifier.mainRoundsPlayed !== 6) {
    throw new Error(`AFC Cup main qualifying "${qualifierId}" is not complete.`);
  }
  const rows = qualifier.mainGroups.map(group => standings(group, qualifier.seedRanks));
  const topTwo = rows.flatMap(group => group.slice(0, 2).map(row => row.code));
  const thirdPlaceCount = 4 - qualifier.hosts.length;
  const bestThirds = rows.map(group => group[2]).sort((a, b) =>
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    (qualifier.seedRanks[a.code] ?? Number.MAX_SAFE_INTEGER) -
      (qualifier.seedRanks[b.code] ?? Number.MAX_SAFE_INTEGER)
  ).slice(0, thirdPlaceCount).map(row => row.code);
  qualifier.mainQualifiers = [...topTwo, ...bestThirds];
  qualifier.completed = true;

  const tournamentWindow = getNextCompetitionWindow(year, windowId, (candidateYear, candidateWindow) =>
    getAfcCupWindowType(candidateYear, candidateWindow) === "AFCCUP"
  );
  const edition = createAfcCupEdition(qualifier, tournamentWindow, worldRanks);
  if (!state.editions.some(item => item.id === edition.id)) state.editions.push(edition);
  return edition;
}

export function getAfcCupTournamentRounds(edition: InternationalCompetitionEdition): InternationalRound[] {
  return [0, 1, 2].map(roundIndex => ({
    kind: "afcCup",
    label: `AFC Cup · Group stage · Matchday ${roundIndex + 1}`,
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
  const fixture = createMatch(home, away, "afcCupKnockout", edition.year, edition.windowId, edition.windowMatchday, {
    afcCupEditionId: edition.id,
    afcCupStage: "knockout",
    afcCupKnockoutMatchId: id
  });
  return { id, home, away, fixture, winner: null };
}

export function startAfcCupRoundOf16(edition: InternationalCompetitionEdition): InternationalRound | null {
  if (edition.groups.some(group => group.matches.flat().some(match =>
    match.homeGoals === null || match.awayGoals === null
  ))) return null;
  const groups = edition.groups.map(group => standings(group, edition.seedRanks).map((row, index) => ({
    group: group.name,
    code: row.code,
    position: index + 1,
    points: row.points,
    goalDifference: row.goalDifference,
    goalsFor: row.goalsFor,
    worldRank: edition.seedRanks[row.code] ?? Number.MAX_SAFE_INTEGER
  })));
  const matches = createTwentyFourTeamRoundOf16(groups).map((pair, index) =>
    makeKnockoutMatch(edition, `R16-${index + 1}`, pair.home, pair.away)
  );
  edition.knockout = [{ label: "Round of 16", matches }];
  return { kind: "afcCup", label: "AFC Cup · Round of 16", leftOut: null, matches: matches.map(match => match.fixture) };
}

export function setAfcCupKnockoutWinner(
  edition: InternationalCompetitionEdition,
  matchId: string,
  winner: string
): void {
  const match = edition.knockout?.flatMap(round => round.matches).find(item => item.id === matchId);
  if (!match) throw new Error(`Unknown AFC Cup knockout match "${matchId}".`);
  match.winner = winner;
}

export function advanceAfcCupKnockoutRound(
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
  const pairings = pairKnockoutWinners(round.matches.map(match => match.winner as string));
  const nextLabel: InternationalCompetitionKnockoutRound["label"] = pairings.length === 4
    ? "Quarter-finals"
    : pairings.length === 2 ? "Semi-finals" : "Final";
  const matches = pairings.map((pair, index) =>
    makeKnockoutMatch(edition,
      `${nextLabel === "Quarter-finals" ? "QF" : nextLabel === "Semi-finals" ? "SF" : "F"}${nextLabel === "Final" ? "" : `-${index + 1}`}`,
      pair.home,
      pair.away
    )
  );
  edition.knockout?.push({ label: nextLabel, matches });
  return { kind: "afcCup", label: `AFC Cup · ${nextLabel}`, leftOut: null, matches: matches.map(match => match.fixture) };
}

export function getAfcCupTournament(state: AfcCupState, year: number): InternationalCompetitionEdition | null {
  return state.editions.find(item => item.year === year) ?? null;
}
