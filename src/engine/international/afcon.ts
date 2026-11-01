import hostOptionsRaw from "../data/tournament_hosts.json";
import { getCountriesByRegion } from "../nations";
import { createTwentyFourTeamRoundOf16, pairKnockoutWinners } from "../knockout24";
import {
  drawInternationalCupGroups, createInternationalCupGroupMatches, getInternationalCupStandings,
  getInternationalWindowType, getNextCompetitionWindow
} from "./internationalCompetitionsUtils";
import type {
  InternationalCompetitionEdition, InternationalCompetitionGroup,
  InternationalCompetitionKnockoutMatch, InternationalCompetitionKnockoutRound
} from "./internationalCompetitionsUtils";
import type { GoldCupPlayoffTie } from "./goldCup";
import type { InternationalMatch, InternationalRound } from "./international";
import { shuffledCopy } from "../utils";

const hostOptions = (hostOptionsRaw as Record<string, string[]>).AFCON ?? [];
const groupNames = [..."ABCDEFGHIJKL"];
const tournamentGroupNames = [..."ABCDEF"];

export function getAfconWindowType(
  year: number,
  windowId: string
): "CAFQP1" | "CAFQP2" | "CAFQM1" | "CAFQM2" | "AFCON1" | "AFCON2" | null {
  const type = getInternationalWindowType("CAF", year, windowId);
  return /^(CAFQP|CAFQM|AFCON)[12]$/.test(type)
    ? type as "CAFQP1" | "CAFQP2" | "CAFQM1" | "CAFQM2" | "AFCON1" | "AFCON2"
    : null;
}

function getNextAfconTournamentWindow(year: number, windowId: string, suffix: "1" | "2") {
  return getNextCompetitionWindow(year, windowId, (candidateYear, candidateWindow) =>
    getAfconWindowType(candidateYear, candidateWindow) === `AFCON${suffix}`
  );
}

export interface AfconQualifyingEdition {
  id: string;
  year: number;
  suffix: "1" | "2";
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

export interface AfconState {
  qualifyingEditions: AfconQualifyingEdition[];
  editions: InternationalCompetitionEdition[];
}

export function createAfconState(): AfconState {
  return { qualifyingEditions: [], editions: [] };
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

function createAfconGroupMatches(
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
    createMatch(home, away, "afconQualifier", year, windowId, windowMatchday, {
      afconEditionId: editionId,
      afconQualifierId: editionId,
      afconStage: "main",
      afconGroup: group,
      afconRound: roundIndex + 1
    })
  ));
}

function standings(group: InternationalCompetitionGroup, seedRanks: Record<string, number>) {
  return getInternationalCupStandings({ seedRanks }, group);
}

export function getAfconQualifierStandings(edition: AfconQualifyingEdition, group: InternationalCompetitionGroup) {
  if (!edition.mainGroups?.some(item => item.name === group.name)) {
    throw new Error(`Unknown AFCON qualifying group "${group.name}" in "${edition.id}".`);
  }
  return standings(group, edition.seedRanks).map((row, index) => ({ ...row, position: index + 1 }));
}

function drawMainQualifiers(
  edition: AfconQualifyingEdition,
  qualifiedTeams: string[],
  year: number,
  windowId: string,
  windowMatchday: number,
  worldRanks: Record<string, number>
): void {
  if (qualifiedTeams.length !== 48 || new Set(qualifiedTeams).size !== 48) {
    throw new Error(`AFCON ${edition.suffix} main qualifying requires 48 unique teams; received ${qualifiedTeams.length}.`);
  }
  edition.seedRanks = Object.fromEntries(qualifiedTeams.map(code => [code, worldRanks[code] ?? Number.MAX_SAFE_INTEGER]));
  const ranked = [...qualifiedTeams].sort((a, b) =>
    (worldRanks[a] ?? Number.MAX_SAFE_INTEGER) - (worldRanks[b] ?? Number.MAX_SAFE_INTEGER) || a.localeCompare(b)
  );
  const pots = Array.from({ length: 4 }, (_, index) => ranked.slice(index * 12, (index + 1) * 12));
  const groups = groupNames.map(() => [] as string[]);
  for (const pot of pots) shuffledCopy(pot).forEach((team, index) => groups[index].push(team));
  edition.mainGroups = groups.map((teams, index) => ({
    name: groupNames[index],
    teams,
    matches: createAfconGroupMatches(teams, groupNames[index], edition.id, year, windowId, windowMatchday)
  }));
  edition.mainRoundsPlayed = 0;
  edition.preliminaryComplete = true;
}

export function createAfconQualifierEdition(
  state: AfconState,
  year: number,
  suffix: "1" | "2",
  windowId: string,
  windowMatchday: number,
  worldRanks: Record<string, number>
): AfconQualifyingEdition {
  const previous = [...state.qualifyingEditions].sort((a, b) => b.year - a.year)[0];
  const previousHosts = new Set(previous?.hosts ?? []);
  const eligible = hostOptions
    .map(option => option.split("|"))
    .filter(option => option.every(code => !previousHosts.has(code)));
  if (eligible.length === 0) {
    throw new Error(`No AFCON ${suffix} host configuration avoids hosting the previous edition.`);
  }
  const hosts = [...eligible[Math.floor(Math.random() * eligible.length)]];
  const hostSet = new Set(hosts);
  const ranked = getCountriesByRegion("CAF").map(nation => nation.code);
  if (ranked.length !== 54) throw new Error(`AFCON qualifying expects 54 CAF nations, but found ${ranked.length}.`);
  ranked.sort((a, b) =>
    (worldRanks[a] ?? Number.MAX_SAFE_INTEGER) - (worldRanks[b] ?? Number.MAX_SAFE_INTEGER) || a.localeCompare(b)
  );
  const nonHosts = ranked.filter(code => !hostSet.has(code));
  const preliminaryCount = Math.max(0, (nonHosts.length - 48) * 2);
  const preliminaryTeams = preliminaryCount > 0 ? nonHosts.slice(-preliminaryCount) : [];
  const preliminarySet = new Set(preliminaryTeams);
  const id = `CAFQ-${year}-${suffix}`;
  const ties: GoldCupPlayoffTie[] = Array.from({ length: preliminaryTeams.length / 2 }, (_, index) => {
    const team1 = preliminaryTeams[index];
    const team2 = preliminaryTeams[preliminaryTeams.length - 1 - index];
    const tieId = `${id}-T${index + 1}`;
    return {
      id: tieId,
      team1,
      team2,
      firstLeg: createMatch(team1, team2, "afconQualifier", year, windowId, windowMatchday, {
        afconQualifierId: id,
        afconTieId: tieId,
        afconStage: "preliminary",
        afconLeg: 1
      }),
      secondLeg: createMatch(team2, team1, "afconQualifier", year, windowId, windowMatchday, {
        afconQualifierId: id,
        afconTieId: tieId,
        afconStage: "preliminary",
        afconLeg: 2
      }),
      winner: null,
      penalties: null
    };
  });
  const edition: AfconQualifyingEdition = {
    id,
    year,
    suffix,
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
  if (ties.length === 0) {
    drawMainQualifiers(edition, nonHosts, year, windowId, windowMatchday, worldRanks);
  }
  return edition;
}

export function getAfconQualifier(
  state: AfconState,
  id: string
): AfconQualifyingEdition {
  const edition = state.qualifyingEditions.find(item => item.id === id);
  if (!edition) throw new Error(`Unknown AFCON qualifying edition "${id}".`);
  return edition;
}

export function getAfconPreliminaryRounds(edition: AfconQualifyingEdition): InternationalRound[] {
  if (edition.preliminaryTies.length === 0) return [];
  return [
    {
      kind: "afconQualifier",
      label: "AFCON Qualifying · Preliminary · First legs",
      leftOut: null,
      afconQualifierId: edition.id,
      afconStage: "preliminary",
      matches: edition.preliminaryTies.map(tie => tie.firstLeg)
    },
    {
      kind: "afconQualifier",
      label: "AFCON Qualifying · Preliminary · Second legs",
      leftOut: null,
      afconQualifierId: edition.id,
      afconStage: "preliminary",
      matches: edition.preliminaryTies.map(tie => tie.secondLeg)
    }
  ];
}

export function resolveAfconPreliminaryTie(
  state: AfconState,
  qualifierId: string,
  tieId: string,
  winner: string,
  penalties: { home: string[]; away: string[] } | null
): void {
  const edition = getAfconQualifier(state, qualifierId);
  const tie = edition.preliminaryTies.find(item => item.id === tieId);
  if (!tie) throw new Error(`Unknown AFCON preliminary tie "${tieId}".`);
  tie.winner = winner;
  tie.penalties = penalties;
}

export function completeAfconPreliminary(
  state: AfconState,
  qualifierId: string,
  year: number,
  windowId: string,
  windowMatchday: number,
  worldRanks: Record<string, number>
): void {
  const edition = getAfconQualifier(state, qualifierId);
  if (edition.preliminaryTies.some(tie => !tie.winner)) {
    throw new Error(`AFCON preliminary round "${qualifierId}" cannot complete before every tie is decided.`);
  }
  const winners = edition.preliminaryTies.map(tie => tie.winner as string);
  const qualifyingTeams = [...edition.mainByes, ...winners];
  drawMainQualifiers(edition, qualifyingTeams, year, windowId, windowMatchday, worldRanks);
}

export function getAfconMainRounds(
  edition: AfconQualifyingEdition,
  year: number,
  windowId: string,
  windowMatchday: number
): InternationalRound[] {
  if (!edition.mainGroups) throw new Error(`AFCON main qualifying groups are not drawn for "${edition.id}".`);
  const mainGroups = edition.mainGroups;
  return [0, 1].flatMap(offset => {
    const roundIndex = edition.mainRoundsPlayed + offset;
    if (roundIndex >= 6) return [];
    const matches = mainGroups.flatMap(group => group.matches[roundIndex]);
    matches.forEach(match => {
      match.windowYear = year;
      match.windowId = windowId;
      match.windowMatchday = windowMatchday;
    });
    return [{
      kind: "afconQualifier" as const,
      label: `AFCON Qualifying · Main round · Matchday ${roundIndex + 1}`,
      leftOut: null,
      afconQualifierId: edition.id,
      afconStage: "main" as const,
      afconRound: roundIndex + 1,
      matches
    }];
  });
}

function createAfconGroupEdition(
  qualifier: AfconQualifyingEdition,
  tournamentYear: number,
  tournamentWindowId: string,
  tournamentMatchday: number,
  worldRanks: Record<string, number>
): InternationalCompetitionEdition {
  const teams = [...qualifier.hosts, ...qualifier.mainQualifiers];
  if (teams.length !== 24 || new Set(teams).size !== 24) {
    throw new Error(`AFCON ${qualifier.suffix} requires 24 unique teams; received ${teams.length}.`);
  }
  const { pots, groups } = drawInternationalCupGroups(
    teams,
    qualifier.hosts,
    worldRanks,
    tournamentGroupNames
  );
  const id = `AFCON-${tournamentYear}-${qualifier.suffix}`;
  return {
    id,
    year: tournamentYear,
    suffix: qualifier.suffix,
    windowId: tournamentWindowId,
    windowMatchday: tournamentMatchday,
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
        tournamentYear,
        tournamentWindowId,
        tournamentMatchday,
        "afcon",
        `AFCON-${tournamentYear}-${qualifier.suffix}`
      )
    })),
    knockout: null,
    completed: false,
    winner: null,
    runnerUp: null,
    semifinalists: []
  };
}

export function completeAfconMainQualifiers(
  state: AfconState,
  qualifierId: string,
  year: number,
  windowId: string,
  worldRanks: Record<string, number>
): InternationalCompetitionEdition {
  const qualifier = getAfconQualifier(state, qualifierId);
  if (!qualifier.mainGroups || qualifier.mainRoundsPlayed !== 6) {
    throw new Error(`AFCON main qualifying "${qualifierId}" is not complete.`);
  }
  const groupStandings = qualifier.mainGroups.map(group => standings(group, qualifier.seedRanks));
  const winners = groupStandings.map(rows => rows[0].code);
  const runnersUp = groupStandings.flatMap(rows => [rows[1]]).sort((a, b) =>
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    (qualifier.seedRanks[a.code] ?? Number.MAX_SAFE_INTEGER) -
      (qualifier.seedRanks[b.code] ?? Number.MAX_SAFE_INTEGER)
  );
  qualifier.mainQualifiers = [...winners, ...runnersUp.slice(0, 12 - qualifier.hosts.length).map(row => row.code)];
  qualifier.completed = true;

  const tournamentWindow = getNextAfconTournamentWindow(year, windowId, qualifier.suffix);
  const edition = createAfconGroupEdition(
    qualifier,
    tournamentWindow.year,
    tournamentWindow.windowId,
    tournamentWindow.afterMatchday,
    worldRanks
  );
  if (!state.editions.some(item => item.id === edition.id)) state.editions.push(edition);
  return edition;
}

export function getAfconTournamentRounds(edition: InternationalCompetitionEdition): InternationalRound[] {
  return [0, 1, 2].map(roundIndex => ({
    kind: "afcon",
    label: `AFCON ${edition.suffix} · Group stage · Matchday ${roundIndex + 1}`,
    leftOut: null,
    matches: edition.groups.flatMap(group => group.matches[roundIndex])
  }));
}

function makeAfconKnockoutMatch(
  edition: InternationalCompetitionEdition,
  id: string,
  home: string,
  away: string
): InternationalCompetitionKnockoutMatch {
  const fixture = createMatch(home, away, "afconKnockout", edition.year, edition.windowId, edition.windowMatchday, {
    afconEditionId: edition.id,
    afconStage: "knockout",
    afconKnockoutMatchId: id
  });
  return { id, home, away, fixture, winner: null };
}

export function startAfconRoundOf16(edition: InternationalCompetitionEdition): InternationalRound | null {
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
  const pairs = createTwentyFourTeamRoundOf16(groups);
  const matches = pairs.map((pair, index) =>
    makeAfconKnockoutMatch(edition, `R16-${index + 1}`, pair.home, pair.away)
  );
  edition.knockout = [{ label: "Round of 16", matches }];
  return {
    kind: "afcon",
    label: `AFCON ${edition.suffix} · Round of 16`,
    leftOut: null,
    matches: matches.map(match => match.fixture)
  };
}

export function advanceAfconKnockoutRound(
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
    makeAfconKnockoutMatch(edition, `${nextLabel === "Quarter-finals" ? "QF" : nextLabel === "Semi-finals" ? "SF" : "F"}${nextLabel === "Final" ? "" : `-${index + 1}`}`, pair.home, pair.away)
  );
  edition.knockout?.push({ label: nextLabel, matches });
  return {
    kind: "afcon",
    label: `AFCON ${edition.suffix} · ${nextLabel}`,
    leftOut: null,
    matches: matches.map(match => match.fixture)
  };
}

export function setAfconKnockoutWinner(edition: InternationalCompetitionEdition, matchId: string, winner: string): void {
  const match = edition.knockout?.flatMap(round => round.matches).find(item => item.id === matchId);
  if (!match) throw new Error(`Unknown AFCON knockout match "${matchId}".`);
  match.winner = winner;
}

export function findAfconQualifierForWindow(
  state: AfconState,
  year: number,
  suffix: "1" | "2"
): AfconQualifyingEdition | null {
  return state.qualifyingEditions.find(item => item.year === year && item.suffix === suffix) ?? null;
}

export function getAFCONTournament(state: AfconState, year: number, suffix: "1" | "2"): InternationalCompetitionEdition | null {
  return state.editions.find(item => item.year === year && item.suffix === suffix) ?? null;
}

export function beginAfconQualifyingMainRounds(
  edition: AfconQualifyingEdition,
  year: number,
  windowId: string,
  windowMatchday: number
): InternationalRound[] {
  return getAfconMainRounds(edition, year, windowId, windowMatchday);
}
