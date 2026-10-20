import type { Team } from "./team";
import type { MatchResult } from "./types";

type Outcome = "WIN" | "LOSS";

function getPrediction(team1: Team, team2: Team): number {
  if (team1.Overall > team2.Overall) return 1;
  if (team1.Overall < team2.Overall) return -1;
  return 0;
}

function updateTeamResult(team: Team, opponent: Team, result: Outcome): void {
  const prediction = getPrediction(team, opponent);
  const upsetWin = result === "WIN" && prediction <= 0;
  const upsetLoss = result === "LOSS" && prediction >= 0;

  if (result === "WIN") {
    team.winStreak += 1;
    team.lossStreak = 0;
    team.upsetLossStreak = 0;

    if (upsetWin) {
      team.upsetWinStreak += 1;
    } else {
      team.upsetWinStreak = 0;
    }

    if (team.upsetWinStreak === 3) {
      team.applyFluctuation(1);
    }

    if (team.winStreak === 5) {
      team.applyFluctuation(1);
    }

    // A win ends a losing streak, so recover one point of fluctuation.
    if (team.seasonOverallChange < 0) {
      team.applyFluctuation(1);
    }

    return;
  }

  if (result === "LOSS") {
    team.lossStreak += 1;
    team.winStreak = 0;
    team.upsetWinStreak = 0;

    if (upsetLoss) {
      team.upsetLossStreak += 1;
    } else {
      team.upsetLossStreak = 0;
    }

    // Losing ends a positive win-streak fluctuation.
    if (team.seasonOverallChange > 0) {
      team.applyFluctuation(-1);
    }

    if (team.upsetLossStreak === 3) {
      team.applyFluctuation(-1);
    }

    if (team.lossStreak === 6) {
      team.applyFluctuation(-1);
    }
  }
}

export function updateFormAfterMatch(matchResult: MatchResult, knockoutWinner: Team | null = null): void {
  const team1 = matchResult.homeGoalInfo.homeTeam;
  const team2 = matchResult.awayGoalInfo.awayTeam;
  const goals1 = matchResult.homeGoalInfo.homeGoals;
  const goals2 = matchResult.awayGoalInfo.awayGoals;

  if (knockoutWinner !== null && goals1 === goals2) {
    if (knockoutWinner.ID === team1.ID) {
      updateTeamResult(team1, team2, "WIN");
      updateTeamResult(team2, team1, "LOSS");
    } else {
      updateTeamResult(team1, team2, "LOSS");
      updateTeamResult(team2, team1, "WIN");
    }
  } else if (goals1 > goals2) {
    updateTeamResult(team1, team2, "WIN");
    updateTeamResult(team2, team1, "LOSS");
  } else if (goals1 < goals2) {
    updateTeamResult(team1, team2, "LOSS");
    updateTeamResult(team2, team1, "WIN");
  } else {
    // A draw breaks both win and loss streaks, but does not otherwise
    // change the team's dynamic overall.
    team1.winStreak = 0;
    team1.lossStreak = 0;
    team1.upsetWinStreak = 0;
    team1.upsetLossStreak = 0;

    team2.winStreak = 0;
    team2.lossStreak = 0;
    team2.upsetWinStreak = 0;
    team2.upsetLossStreak = 0;
  }
}
