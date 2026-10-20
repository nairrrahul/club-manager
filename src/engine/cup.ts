import cupRoundInfoRaw from "./data/cup_round_info.json";
import { scheduleBracket } from "./scheduler";
import { simulateMatch, parseKOMatchWinner } from "./matchEngine";
import { updateFormAfterMatch } from "./form";
import type { Team } from "./team";
import type { CupFinish, CupState, MatchResult } from "./types";

const cupRoundInfo = cupRoundInfoRaw as Record<string, number>;

export function createCupState(teams: Team[]): CupState {
  return {
    bracket: scheduleBracket(teams, 8),
    roundMatchdays: cupRoundInfo,
    completed: false
  };
}

export function simulateCupRound(cup: CupState): void {
  const bracket = cup.bracket;

  if (isCupComplete(cup)) {
    return;
  }

  const roundIndex = bracket.activeRound;
  const round = bracket.rounds[roundIndex];

  for (const match of round) {
    const team1 = match.player1?.team ?? null;
    const team2 = match.player2?.team ?? null;

    if (team1 === null) {
      match.winner = team2;
      continue;
    }

    if (team2 === null) {
      match.winner = team1;
      continue;
    }

    const matchResult = simulateMatch(team1, team2, true, "CUP");

    match.result = matchResult;
    match.winner = parseKOMatchWinner(matchResult);
    updateFormAfterMatch(matchResult, match.winner);
  }

  if (roundIndex < bracket.rounds.length - 1) {
    const nextRound = bracket.rounds[roundIndex + 1];

    for (let i = 0; i < round.length; i++) {
      const nextMatch = nextRound[Math.floor(i / 2)];
      const winner = round[i].winner;
      const winnerSlot = { team: winner };

      if (i % 2 === 0) {
        nextMatch.player1 = winnerSlot;
      } else {
        nextMatch.player2 = winnerSlot;
      }
    }

    bracket.activeRound++;
  } else {
    cup.completed = true;
  }
}

export function isCupComplete(cup: CupState): boolean {
  const finalRound = cup.bracket.rounds[cup.bracket.rounds.length - 1];
  return finalRound[0].winner !== null;
}

export function getCupRoundMatchday(roundNumber: number): number {
  return cupRoundInfo[String(roundNumber)];
}

export function getCurrentCupRound(cup: CupState): number {
  if (isCupComplete(cup)) {
    return cup.bracket.rounds.length;
  }

  return cup.bracket.activeRound + 1;
}

function getPenaltyScore(matchResult: MatchResult | null | undefined): { home: number; away: number } | null {
  if (!matchResult) {
    return null;
  }

  const homePenalties = matchResult.homeGoalInfo.penalties;
  const awayPenalties = matchResult.awayGoalInfo.penalties;

  if (!homePenalties || !awayPenalties) {
    return null;
  }

  return {
    home: homePenalties.filter(penalty => penalty === "O").length,
    away: awayPenalties.filter(penalty => penalty === "O").length
  };
}

export function formatCupMatchResult(matchResult: MatchResult | null | undefined): string | null {
  if (!matchResult) {
    return null;
  }

  const homeGoals = matchResult.homeGoalInfo.homeGoals;
  const awayGoals = matchResult.awayGoalInfo.awayGoals;
  const penaltyScore = getPenaltyScore(matchResult);

  if (penaltyScore) {
    return `${homeGoals} - ${awayGoals} (${penaltyScore.home} - ${penaltyScore.away} PSO)`;
  }

  return `${homeGoals} - ${awayGoals}`;
}

export function getCupRoundForTeam(cup: CupState, teamID: number): number | null {
  for (let roundIndex = 0; roundIndex < cup.bracket.rounds.length; roundIndex++) {
    const round = cup.bracket.rounds[roundIndex];

    for (const match of round) {
      if (match.player1?.team?.ID === teamID || match.player2?.team?.ID === teamID) {
        return roundIndex + 1;
      }
    }
  }

  return null;
}

export function getCupFinish(cup: CupState, teamID: number): CupFinish {
  const rounds = cup.bracket.rounds;

  for (let roundIndex = 0; roundIndex < rounds.length; roundIndex++) {
    const round = rounds[roundIndex];

    for (const match of round) {
      const team1 = match.player1?.team ?? null;
      const team2 = match.player2?.team ?? null;
      const team = team1?.ID === teamID ? team1 : team2?.ID === teamID ? team2 : null;

      if (!team) {
        continue;
      }

      if (match.winner && match.winner.ID !== teamID) {
        return {
          round: roundIndex + 1,
          label: roundIndex + 1 === rounds.length
            ? "Runner-up"
            : roundIndex + 1 === rounds.length - 1
              ? "Semifinal"
              : `Round ${roundIndex + 1}`
        };
      }
    }
  }

  const finalRound = rounds[rounds.length - 1];
  const finalMatch = finalRound[0];

  if (finalMatch.winner?.ID === teamID) {
    return {
      round: rounds.length,
      label: "Winner"
    };
  }

  // The team may not have reached its elimination round yet.
  const currentRound = getCurrentCupRound(cup);
  const reachedRound = getCupRoundForTeam(cup, teamID);

  if (reachedRound === null) {
    return {
      round: currentRound,
      label: `Round ${currentRound}`
    };
  }

  return {
    round: reachedRound,
    label: `Round ${reachedRound}`
  };
}
