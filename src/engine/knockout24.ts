import thirdPlaceAssignmentsRaw from "./data/intl/p3_24.json";

interface ThirdPlaceAssignmentMap {
  [qualifiedGroups: string]: string;
}

export interface TwentyFourTeamStanding {
  group: string;
  code: string;
  position: number;
  points: number;
  goalDifference: number;
  goalsFor: number;
  worldRank: number;
}

export interface KnockoutPair {
  home: string;
  away: string;
}

const thirdPlaceAssignments = thirdPlaceAssignmentsRaw as ThirdPlaceAssignmentMap;

/** Builds the fixed 24-team round of 16, including the configured third-place matchups. */
export function createTwentyFourTeamRoundOf16(groups: TwentyFourTeamStanding[][]): KnockoutPair[] {
  if (groups.length !== 6 || groups.some(group => group.length !== 4)) {
    throw new Error("A 24-team knockout draw requires six completed groups of four teams.");
  }

  const winners = new Map<string, string>();
  const runnersUp = new Map<string, string>();
  const thirdPlaceTeams: TwentyFourTeamStanding[] = [];
  for (const group of groups) {
    const standings = [...group].sort((a, b) => a.position - b.position);
    const name = standings[0].group;
    winners.set(name, standings[0].code);
    runnersUp.set(name, standings[1].code);
    thirdPlaceTeams.push(standings[2]);
  }

  const bestThirds = thirdPlaceTeams
    .sort((a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.worldRank - b.worldRank
    )
    .slice(0, 4);
  const qualifiedGroups = bestThirds.map(team => team.group).sort().join("");
  const assignment = thirdPlaceAssignments[qualifiedGroups];
  if (!assignment || assignment.length !== 4) {
    throw new Error(`No round-of-16 third-place assignment is configured for groups "${qualifiedGroups}".`);
  }

  const thirdByGroup = new Map(bestThirds.map(team => [team.group, team.code]));
  const thirdForWinner = (group: string): string => {
    const opponentGroup = assignment[group.charCodeAt(0) - "A".charCodeAt(0)];
    const opponent = thirdByGroup.get(opponentGroup);
    if (!opponent) throw new Error(`Invalid third-place assignment: Group ${group} cannot face Group ${opponentGroup}.`);
    return opponent;
  };
  const winner = (group: string) => {
    const team = winners.get(group);
    if (!team) throw new Error(`Missing Group ${group} winner in 24-team bracket.`);
    return team;
  };
  const runner = (group: string) => {
    const team = runnersUp.get(group);
    if (!team) throw new Error(`Missing Group ${group} runner-up in 24-team bracket.`);
    return team;
  };

  return [
    { home: runner("A"), away: runner("C") },
    { home: winner("D"), away: thirdForWinner("D") },
    { home: winner("B"), away: thirdForWinner("B") },
    { home: winner("F"), away: runner("E") },
    { home: winner("C"), away: thirdForWinner("C") },
    { home: winner("E"), away: runner("D") },
    { home: winner("A"), away: thirdForWinner("A") },
    { home: runner("B"), away: runner("F") }
  ];
}

/** Pairs adjacent winners to create the next single-elimination round. */
export function pairKnockoutWinners(winners: string[]): KnockoutPair[] {
  if (winners.length < 2 || winners.length % 2 !== 0) {
    throw new Error("A knockout round must have an even number of at least two winners.");
  }
  return Array.from({ length: winners.length / 2 }, (_, index) => ({
    home: winners[index * 2],
    away: winners[index * 2 + 1]
  }));
}
