import scoreProbsRaw from "./data/scoreline_info.json";
import zscoresRaw from "./data/team_z_score.json";
import type { Team } from "./team";
import type { MatchResult } from "./types";

const score_probs = scoreProbsRaw as Record<string, number[]>;
const zscores = zscoresRaw as Record<string, number>;
// Beyond this skew the approximate CDF can round every supported score difference down to zero.
const MAX_SCORELINE_SKEW = 12;

function normSDist(z: number): number {
  // Standard normal CDF
  return 0.5 * (1 + erf(z / Math.sqrt(2)));
}

function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1 / (1 + p * x);

  const y = 1 - (
    (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1)
    * t
    * Math.exp(-x * x)
  );

  return sign * y;
}

function differenceFromPrevious(data: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(data)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([key, value], i, entries) => [
        key,
        i === 0 ? value : Math.max(value - entries[i - 1][1], 0)
      ])
  );
}

function computeProbTable(ovr1: number, ovr2: number, context: string): Record<string, number> {
  const SKEW_POW = context == "LEAGUE" ? 1 : 2;
  const initRatingRatio = Math.pow(ovr1 / ovr2, SKEW_POW);
  const ratingRatio = initRatingRatio < 1 ? computeUnderdogRatio(initRatingRatio) : initRatingRatio;
  const skewFactor = Math.max(
    -MAX_SCORELINE_SKEW,
    Math.min(MAX_SCORELINE_SKEW, (1 - ratingRatio) * 4)
  );

  const skewProbs = Object.fromEntries(Object.entries(zscores).map(([delta, zscore]) => {
    return [
      delta,
      normSDist(zscore + skewFactor + Math.sign(zscore) * Math.pow(Math.abs(zscore), 2))
    ];
  }));

  return Object.fromEntries(Object.entries(differenceFromPrevious(skewProbs)).map(
    ([delta, netProb]) => {
      return [delta, Math.floor(netProb * 100)];
    }
  ).filter(
    ([, netProb]) => { return netProb != 0; }
  ));
}

function computeUnderdogRatio(ratio: number): number {
  return ratio * (0.0276842 * Math.pow(27.50952, ratio) + 0.0723158);
}

function weightedRandom(weights: Record<string, number>): number {
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error("Cannot select a match outcome from an empty probability distribution.");
  }
  const random = Math.random() * total;

  let cumulative = 0;

  for (const [outcome, weight] of Object.entries(weights)) {
    cumulative += weight;

    if (random < cumulative) {
      return Number(outcome);
    }
  }

  // Unreachable in practice (random < total); mirrors the original's fall-through.
  return NaN;
}

function genScoreline(delta: number): { homeGoals: number; awayGoals: number } {
  const probWeights = Object.fromEntries(
    score_probs[String(Math.abs(Number(delta)))].map(
      (value, idx) => [idx, value]
    )
  );

  const losingGoalsScored = weightedRandom(probWeights);
  return {
    homeGoals: Number(delta) < 0 ? losingGoalsScored : losingGoalsScored + delta,
    awayGoals: Number(delta) < 0 ? losingGoalsScored - delta : losingGoalsScored
  };
}

export function simulateMatch(team1: Team, team2: Team, isKO: boolean, compType: string): MatchResult {
  const team1ovr = team1.Overall;
  const team2ovr = team2.Overall;

  const probTable = computeProbTable(team1ovr, team2ovr, compType);

  const goalDelta = weightedRandom(probTable);
  const scoreline = genScoreline(goalDelta);

  const penalties = (goalDelta == 0 && isKO) ? penaltyShootout() : null;

  return {
    homeGoalInfo: {
      homeTeam: team1,
      homeGoals: scoreline.homeGoals,
      penalties: penalties ? penalties.team1Results : null
    },
    awayGoalInfo: {
      awayTeam: team2,
      awayGoals: scoreline.awayGoals,
      penalties: penalties ? penalties.team2Results : null
    }
  };
}

/**
 * A penalty shootout with no match played: used when a two-legged tie is level on aggregate.
 * The result carries 0-0 goals plus the shootout; parseKOMatchWinner reads the winner from it.
 */
export function simulatePenaltyShootoutOnly(team1: Team, team2: Team): MatchResult {
  const shootout = penaltyShootout();
  return {
    homeGoalInfo: { homeTeam: team1, homeGoals: 0, penalties: shootout.team1Results },
    awayGoalInfo: { awayTeam: team2, awayGoals: 0, penalties: shootout.team2Results }
  };
}

function penaltyResult(val: number): "O" | "X" {
  if (val <= 10) {
    return "O";
  } else {
    return "X";
  }
}

function penaltyShootout(): { team1Results: string[]; team2Results: string[] } {
  const homePenalties: string[] = [];
  let homePensScored = 0;
  const awayPenalties: string[] = [];
  let awayPensScored = 0;

  for (let i = 0; i < 5; i++) {
    const homeShot = penaltyResult(Math.floor(Math.random() * 14));
    const awayShot = penaltyResult(Math.floor(Math.random() * 14));

    homePenalties.push(homeShot);
    if (homeShot == "O") homePensScored += 1;

    if (homePensScored + (4 - i) < awayPensScored || awayPensScored + (5 - i) < homePensScored) {
      break;
    }

    awayPenalties.push(awayShot);
    if (awayShot == "O") awayPensScored += 1;

    if (awayPensScored + (4 - i) < homePensScored || homePensScored + (5 - i) < awayPensScored) {
      break;
    }
  }

  // sudden death if so
  if (homePensScored === awayPensScored) {
    let eqCounter = true;
    while (eqCounter) {
      const homeShot = penaltyResult(Math.floor(Math.random() * 14));
      const awayShot = penaltyResult(Math.floor(Math.random() * 14));

      homePenalties.push(homeShot);
      if (homeShot == "O") homePensScored += 1;

      awayPenalties.push(awayShot);
      if (awayShot == "O") awayPensScored += 1;

      eqCounter = homePensScored === awayPensScored;
    }
  }

  return {
    team1Results: homePenalties,
    team2Results: awayPenalties
  };
}

export function parseKOMatchWinner(koMatchResult: MatchResult): Team {
  if (koMatchResult.homeGoalInfo.homeGoals > koMatchResult.awayGoalInfo.awayGoals) {
    return koMatchResult.homeGoalInfo.homeTeam;
  } else if (koMatchResult.homeGoalInfo.homeGoals < koMatchResult.awayGoalInfo.awayGoals) {
    return koMatchResult.awayGoalInfo.awayTeam;
  } else {
    const homePenCount = (koMatchResult.homeGoalInfo.penalties ?? []).filter(pen => pen == "O").length;
    const awayPenCount = (koMatchResult.awayGoalInfo.penalties ?? []).filter(pen => pen == "O").length;
    if (homePenCount > awayPenCount) {
      return koMatchResult.homeGoalInfo.homeTeam;
    } else {
      return koMatchResult.awayGoalInfo.awayTeam;
    }
  }
}
