import thirdPlaceAssignmentsRaw from "../../data/intl/p3_48.json";
import { getConfederation } from "../../nations";
import { pairKnockoutWinners } from "../../knockout24";
import { shuffledCopy } from "../../utils";
import { assignHostsToGroups } from "../internationalCompetitionsUtils";
import { createGroupFixtures, getStandings } from "./utils";
import type { WorldCupTournament } from "./types";
import type { InternationalMatch, InternationalRound } from "../international";

const groupNames = [..."ABCDEFGHIJKL"];
const thirdPlaceAssignments = thirdPlaceAssignmentsRaw as Record<string, string>;

function confederation(code: string): string {
  const value = getConfederation(code);
  if (!value) throw new Error(`Unknown confederation for World Cup draw team "${code}".`);
  return value;
}

function isValidDraw(groups: string[][], team: string, groupIndex: number): boolean {
  const teamConfed = confederation(team);
  const count = groups[groupIndex].filter(code => confederation(code) === teamConfed).length;
  return teamConfed === "UEFA" ? count < 2 : count === 0;
}

function assignPot(groups: string[][], pot: string[], potIndex: number, teamIndex = 0): boolean {
  if (teamIndex === pot.length) return true;
  const team = pot[teamIndex];
  for (const groupIndex of shuffledCopy(groups.map((_, index) => index))) {
    if (groups[groupIndex].length !== potIndex || !isValidDraw(groups, team, groupIndex)) continue;
    groups[groupIndex].push(team);
    if (assignPot(groups, pot, potIndex, teamIndex + 1)) return true;
    groups[groupIndex].pop();
  }
  return false;
}

export function drawWorldCupGroups(
  teams: string[],
  hosts: string[],
  playoffTeams: string[],
  worldRanks: Record<string, number>
): { pots: string[][]; groups: string[][] } {
  if (teams.length !== 48 || new Set(teams).size !== 48) {
    throw new Error(`World Cup draw requires 48 unique teams; received ${teams.length}.`);
  }
  if (hosts.some(team => !teams.includes(team)) || playoffTeams.some(team => !teams.includes(team))) {
    throw new Error("World Cup hosts and playoff qualifiers must be in the tournament field.");
  }
  const rank = (a: string, b: string) =>
    (worldRanks[a] ?? Number.MAX_SAFE_INTEGER) - (worldRanks[b] ?? Number.MAX_SAFE_INTEGER) || a.localeCompare(b);
  const forcedPotFour = new Set(playoffTeams);
  if (playoffTeams.length > 12) throw new Error("World Cup playoff qualifiers exceed Pot 4 capacity.");
  const otherTeams = teams.filter(team => !forcedPotFour.has(team) && !hosts.includes(team)).sort(rank);
  const potOne = [...hosts, ...otherTeams.slice(0, 12 - hosts.length)];
  const rest = teams.filter(team => !potOne.includes(team) && !forcedPotFour.has(team)).sort(rank);
  const pots = [
    potOne,
    rest.slice(0, 12),
    rest.slice(12, 24),
    [...rest.slice(24), ...playoffTeams]
  ];
  if (pots.some(pot => pot.length !== 12)) throw new Error("World Cup draw must create four pots of twelve teams.");
  const groups = groupNames.map(() => [] as string[]);
  assignHostsToGroups(groups, groupNames, hosts);
  for (const [potIndex, pot] of pots.entries()) {
    const drawnPot = shuffledCopy(pot.filter(team => potIndex !== 0 || !hosts.includes(team)));
    if (!assignPot(groups, drawnPot, potIndex)) {
      throw new Error(`Could not complete a valid World Cup group draw for Pot ${potIndex + 1}.`);
    }
  }
  return { pots, groups };
}

export function createWorldCupTournament(
  year: number,
  hosts: string[],
  qualifiedTeams: string[],
  intercontinentalWinners: string[],
  uefaPlayoffWinners: string[],
  worldRanks: Record<string, number>
): WorldCupTournament {
  const playoffTeams = [...intercontinentalWinners, ...uefaPlayoffWinners];
  const teams = [...hosts, ...qualifiedTeams, ...playoffTeams];
  if (teams.length !== 48 || new Set(teams).size !== 48) {
    throw new Error(`World Cup needs 48 unique qualifiers including ${hosts.length} hosts; received ${teams.length}.`);
  }
  const { pots, groups } = drawWorldCupGroups(teams, hosts, playoffTeams, worldRanks);
  return {
    id: `WCQ-${year}`,
    year,
    hosts: [...hosts],
    teams,
    pots,
    seedRanks: Object.fromEntries(teams.map(team => [team, worldRanks[team] ?? Number.MAX_SAFE_INTEGER])),
    groups: groups.map((groupTeams, index) => ({
      name: groupNames[index],
      teams: groupTeams,
      matches: createGroupFixtures(groupTeams, groupNames[index], false)
    })),
    knockout: null,
    completed: false,
    winner: null,
    runnerUp: null,
    semifinalists: [],
    playoffTeams
  };
}

function fixture(tournament: WorldCupTournament, id: string, home: string, away: string): InternationalMatch {
  return {
    home, away, kind: "worldCupKnockout",
    homeGoals: null, awayGoals: null, homeChange: null, awayChange: null,
    worldCupEditionId: tournament.id, worldCupStage: "knockout", worldCupKnockoutMatchId: id
  };
}

export function getWorldCupGroupRounds(tournament: WorldCupTournament): InternationalRound[] {
  const expectedMatchdays = tournament.groups[0]?.teams.length - 1;
  if (!expectedMatchdays || tournament.groups.some(group =>
    group.matches.length !== expectedMatchdays ||
    group.matches.some(round => round.length !== group.teams.length / 2)
  )) {
    throw new Error("World Cup groups must use a single round-robin fixture schedule.");
  }
  return Array.from({ length: expectedMatchdays }, (_, roundIndex) => ({
    kind: "worldCup",
    label: `World Cup · Group Stage · Matchday ${roundIndex + 1}`,
    leftOut: null,
    worldCupEditionId: tournament.id,
    worldCupStage: "group",
    worldCupRound: roundIndex + 1,
    matches: tournament.groups.flatMap(group => group.matches[roundIndex])
      .map(match => Object.assign(match, {
        kind: "worldCupGroup",
        worldCupEditionId: tournament.id,
        worldCupStage: "group",
        worldCupRound: roundIndex + 1,
        worldCupGroup: tournament.groups.find(group => group.matches[roundIndex].includes(match))?.name
      }))
  }));
}

export function startWorldCupRoundOf32(tournament: WorldCupTournament): InternationalRound | null {
  if (tournament.groups.some(group => group.matches.flat().some(match =>
    match.homeGoals === null || match.awayGoals === null
  ))) return null;
  const rows = tournament.groups.map(group => {
    const ranked = getStandings(group, tournament.seedRanks);
    return ranked.map((row, index) => ({ ...row, group: group.name, position: index + 1 }));
  });
  const bestThirds = rows.flatMap(group => group.filter(row => row.position === 3))
    .sort((a, b) => b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      (tournament.seedRanks[a.code] ?? Number.MAX_SAFE_INTEGER) -
      (tournament.seedRanks[b.code] ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 8);
  const assignmentKey = bestThirds.map(row => row.group).sort().join("");
  const assignment = thirdPlaceAssignments[assignmentKey];
  if (!assignment || assignment.length !== 8) {
    throw new Error(`World Cup third-place assignment is missing for groups "${assignmentKey}".`);
  }
  const thirdByGroup = new Map(bestThirds.map(row => [row.group, row.code]));
  const winnerByGroup = new Map(rows.map(group => [group[0].group, group[0].code]));
  const runnerByGroup = new Map(rows.map(group => [group[1].group, group[1].code]));
  const matchups: [string, string][] = [
    [winnerByGroup.get("E")!, thirdByGroup.get(assignment[0])!],
    [winnerByGroup.get("I")!, thirdByGroup.get(assignment[5])!],
    [runnerByGroup.get("A")!, runnerByGroup.get("B")!],
    [winnerByGroup.get("F")!, runnerByGroup.get("C")!],
    [runnerByGroup.get("K")!, runnerByGroup.get("L")!],
    [winnerByGroup.get("H")!, runnerByGroup.get("J")!],
    [winnerByGroup.get("D")!, thirdByGroup.get(assignment[2])!],
    [winnerByGroup.get("G")!, thirdByGroup.get(assignment[4])!],
    [winnerByGroup.get("C")!, runnerByGroup.get("F")!],
    [runnerByGroup.get("E")!, runnerByGroup.get("I")!],
    [winnerByGroup.get("A")!, thirdByGroup.get(assignment[0])!],
    [winnerByGroup.get("L")!, thirdByGroup.get(assignment[7])!],
    [winnerByGroup.get("J")!, runnerByGroup.get("H")!],
    [runnerByGroup.get("D")!, runnerByGroup.get("G")!],
    [winnerByGroup.get("B")!, thirdByGroup.get(assignment[1])!],
    [winnerByGroup.get("K")!, thirdByGroup.get(assignment[6])!]
  ];
  // The documented assignment is ordered for winners 1A, 1B, 1D, 1E, 1G, 1I, 1K, 1L.
  matchups[0][1] = thirdByGroup.get(assignment[3])!;
  matchups[1][1] = thirdByGroup.get(assignment[5])!;
  matchups[10][1] = thirdByGroup.get(assignment[0])!;
  matchups[11][1] = thirdByGroup.get(assignment[7])!;
  tournament.knockout = [{
    label: "Round of 32",
    matches: matchups.map(([home, away], index) => ({
      id: `R32-${index + 1}`, home, away,
      fixture: fixture(tournament, `R32-${index + 1}`, home, away), winner: null
    }))
  }];
  return {
    kind: "worldCup", label: "World Cup · Round of 32", leftOut: null,
    worldCupEditionId: tournament.id, worldCupStage: "knockout",
    matches: tournament.knockout[0].matches.map(match => match.fixture)
  };
}

export function recordWorldCupKnockoutWinner(tournament: WorldCupTournament, matchId: string, winner: string): void {
  const match = tournament.knockout?.flatMap(round => round.matches).find(item => item.id === matchId);
  if (!match) throw new Error(`Unknown World Cup knockout match "${matchId}".`);
  match.winner = winner;
}

export function advanceWorldCupKnockout(tournament: WorldCupTournament, roundIndex: number): InternationalRound | null {
  const round = tournament.knockout?.[roundIndex];
  if (!round || round.matches.some(match => match.winner === null)) return null;
  if (round.label === "Final") {
    const final = round.matches[0];
    tournament.winner = final.winner;
    tournament.runnerUp = final.winner === final.home ? final.away : final.home;
    tournament.semifinalists = tournament.knockout?.find(item => item.label === "Semi-finals")?.matches
      .flatMap(match => match.winner ? [match.winner === match.home ? match.away : match.home] : []) ?? [];
    tournament.completed = true;
    return null;
  }
  const pairings = pairKnockoutWinners(round.matches.map(match => match.winner!));
  const labels: ("Round of 16" | "Quarter-finals" | "Semi-finals" | "Final")[] = [
    "Round of 16", "Quarter-finals", "Semi-finals", "Final"
  ];
  const label = labels[roundIndex];
  const next = {
    label,
    matches: pairings.map((pair, index) => ({
      id: `${label === "Round of 16" ? "R16" : label === "Quarter-finals" ? "QF" : label === "Semi-finals" ? "SF" : "F"}${label === "Final" ? "" : `-${index + 1}`}`,
      home: pair.home,
      away: pair.away,
      fixture: fixture(
        tournament,
        `${label === "Round of 16" ? "R16" : label === "Quarter-finals" ? "QF" : label === "Semi-finals" ? "SF" : "F"}${label === "Final" ? "" : `-${index + 1}`}`,
        pair.home,
        pair.away
      ),
      winner: null
    }))
  };
  tournament.knockout?.push(next);
  return {
    kind: "worldCup",
    label: `World Cup · ${label}`,
    leftOut: null,
    worldCupEditionId: tournament.id,
    worldCupStage: "knockout",
    matches: next.matches.map(match => match.fixture)
  };
}
