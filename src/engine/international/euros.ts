import { createTwentyFourTeamRoundOf16, pairKnockoutWinners } from "../knockout24";
import { shuffledCopy } from "../utils";
import {
  assignHostsToGroups,
  createInternationalCupGroupMatches,
  getInternationalCupStandings
} from "./internationalCompetitionsUtils";
import type {
  InternationalCompetitionEdition,
  InternationalCompetitionKnockoutMatch,
  InternationalCompetitionKnockoutRound
} from "./internationalCompetitionsUtils";
import type { EuroQualifyingEdition } from "./euroQualifiers";
import type { InternationalMatch, InternationalRound } from "./international";

const groupNames = [..."ABCDEF"];

export interface EuroState {
  editions: InternationalCompetitionEdition[];
}

export function createEuroState(): EuroState {
  return { editions: [] };
}

export function getEuroTournament(state: EuroState, year: number): InternationalCompetitionEdition | null {
  return state.editions.find(edition => edition.year === year) ?? null;
}

function drawEuroGroups(
  teams: string[],
  hosts: string[],
  playoffTeams: string[],
  worldRanks: Record<string, number>
): { pots: string[][]; groups: string[][] } {
  if (teams.length !== 24 || hosts.length > 3 || playoffTeams.length !== 3) {
    throw new Error(`EURO draw needs 24 teams, up to three hosts, and three playoff qualifiers.`);
  }
  const rank = (a: string, b: string) =>
    (worldRanks[a] ?? Number.MAX_SAFE_INTEGER) - (worldRanks[b] ?? Number.MAX_SAFE_INTEGER) ||
    a.localeCompare(b);
  const hostSet = new Set(hosts);
  const playoffSet = new Set(playoffTeams);
  const potOne = [...hosts, ...teams.filter(team => !hostSet.has(team) && !playoffSet.has(team)).sort(rank)
    .slice(0, 6 - hosts.length)];
  const remaining = teams.filter(team => !potOne.includes(team) && !playoffSet.has(team)).sort(rank);
  const pots = [
    potOne,
    remaining.slice(0, 6),
    remaining.slice(6, 12),
    [...remaining.slice(12), ...playoffTeams]
  ];
  if (pots.some(pot => pot.length !== 6) || pots.flat().length !== 24) {
    throw new Error("EURO draw must produce four pots of six teams.");
  }
  const groups = groupNames.map(() => [] as string[]);
  const hostGroupIndexes = assignHostsToGroups(groups, groupNames, hosts);
  const nonHostGroupIndexes = groups.map((_, index) => index).filter(index => !hostGroupIndexes.has(index));
  shuffledCopy(potOne.filter(team => !hostSet.has(team)))
    .forEach((team, index) => groups[nonHostGroupIndexes[index]].push(team));
  for (const pot of pots.slice(1)) {
    shuffledCopy(pot).forEach((team, index) => groups[index].push(team));
  }
  return { pots, groups };
}

export function createEuroEdition(
  state: EuroState,
  qualifier: EuroQualifyingEdition,
  playoffWinners: string[],
  tournamentWindow: { year: number; windowId: string; afterMatchday: number },
  worldRanks: Record<string, number>
): InternationalCompetitionEdition {
  if (!qualifier.playoffComplete || playoffWinners.length !== 3) {
    throw new Error(`EURO "${qualifier.id}" requires three completed qualifying playoff paths.`);
  }
  const teams = [...qualifier.hosts, ...qualifier.directQualifiers, ...playoffWinners];
  if (teams.length !== 24 || new Set(teams).size !== 24) {
    throw new Error(`EURO requires 24 unique teams; received ${teams.length}.`);
  }
  const { pots, groups } = drawEuroGroups(teams, qualifier.hosts, playoffWinners, worldRanks);
  const id = `EURO-${tournamentWindow.year}`;
  const edition: InternationalCompetitionEdition = {
    id,
    year: tournamentWindow.year,
    windowId: tournamentWindow.windowId,
    windowMatchday: tournamentWindow.afterMatchday,
    hosts: [...qualifier.hosts],
    teams,
    pots,
    seedRanks: Object.fromEntries(teams.map(code => [code, worldRanks[code] ?? Number.MAX_SAFE_INTEGER])),
    groups: groups.map((groupTeams, index) => ({
      name: groupNames[index],
      teams: groupTeams,
      matches: createInternationalCupGroupMatches(
        groupTeams,
        groupNames[index],
        tournamentWindow.year,
        tournamentWindow.windowId,
        tournamentWindow.afterMatchday,
        "euro",
        id
      )
    })),
    knockout: null,
    completed: false,
    winner: null,
    runnerUp: null,
    semifinalists: [],
    playoffTeams: [...playoffWinners]
  };
  if (!state.editions.some(item => item.id === id)) state.editions.push(edition);
  return edition;
}

function createKnockoutMatch(
  edition: InternationalCompetitionEdition,
  id: string,
  home: string,
  away: string
): InternationalCompetitionKnockoutMatch {
  const fixture: InternationalMatch = {
    home,
    away,
    kind: "euroKnockout",
    homeGoals: null,
    awayGoals: null,
    homeChange: null,
    awayChange: null,
    windowYear: edition.year,
    windowId: edition.windowId,
    windowMatchday: edition.windowMatchday,
    euroEditionId: edition.id,
    euroStage: "knockout",
    euroKnockoutMatchId: id
  };
  return { id, home, away, fixture, winner: null };
}

export function getEuroTournamentRounds(edition: InternationalCompetitionEdition): InternationalRound[] {
  return [0, 1, 2].map(roundIndex => ({
    kind: "euro",
    label: `EURO · Group stage · Matchday ${roundIndex + 1}`,
    leftOut: null,
    matches: edition.groups.flatMap(group => group.matches[roundIndex])
  }));
}

export function startEuroRoundOf16(edition: InternationalCompetitionEdition): InternationalRound | null {
  if (edition.groups.some(group => group.matches.flat().some(match =>
    match.homeGoals === null || match.awayGoals === null
  ))) return null;
  const groups = edition.groups.map(group => getInternationalCupStandings(edition, group).map((row, index) => ({
    group: group.name,
    code: row.code,
    position: index + 1,
    points: row.points,
    goalDifference: row.goalDifference,
    goalsFor: row.goalsFor,
    worldRank: edition.seedRanks[row.code] ?? Number.MAX_SAFE_INTEGER
  })));
  const matches = createTwentyFourTeamRoundOf16(groups).map((pair, index) =>
    createKnockoutMatch(edition, `R16-${index + 1}`, pair.home, pair.away)
  );
  edition.knockout = [{ label: "Round of 16", matches }];
  return { kind: "euro", label: "EURO · Round of 16", leftOut: null, matches: matches.map(match => match.fixture) };
}

export function setEuroKnockoutWinner(
  edition: InternationalCompetitionEdition,
  matchId: string,
  winner: string
): void {
  const match = edition.knockout?.flatMap(round => round.matches).find(item => item.id === matchId);
  if (!match) throw new Error(`Unknown EURO knockout match "${matchId}".`);
  match.winner = winner;
}

export function advanceEuroKnockoutRound(
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
    createKnockoutMatch(edition,
      `${nextLabel === "Quarter-finals" ? "QF" : nextLabel === "Semi-finals" ? "SF" : "F"}${nextLabel === "Final" ? "" : `-${index + 1}`}`,
      pair.home,
      pair.away
    )
  );
  edition.knockout?.push({ label: nextLabel, matches });
  return { kind: "euro", label: `EURO · ${nextLabel}`, leftOut: null, matches: matches.map(match => match.fixture) };
}
