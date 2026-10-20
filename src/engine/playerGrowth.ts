import type { Player, PeakRange, Position } from "./types";
import type { Team } from "./team";

const FACILITY_MULTIPLIERS: Record<number, { growth: number; decline: number }> = {
  1: { growth: 0.90, decline: 1.10 },
  2: { growth: 0.95, decline: 1.05 },
  3: { growth: 1.00, decline: 1.00 },
  4: { growth: 1.05, decline: 0.95 },
  5: { growth: 1.10, decline: 0.90 }
};

const POSITION_CATEGORIES: Record<string, Position[]> = {
  ATK: ["ST", "LW", "LM", "RW", "RM"],
  MID: ["CM", "CAM", "CDM"],
  DEF: ["RB", "LB", "CB"],
  GK: ["GK"]
};

const PEAK_RANGES: Record<string, PeakRange> = {
  ATK: { start: 25, end: 32 },
  MID: { start: 25, end: 32 },
  DEF: { start: 26, end: 33 },
  GK: { start: 27, end: 34 }
};

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function getPeakRange(position: Position): PeakRange {
  for (const [category, positions] of Object.entries(POSITION_CATEGORIES)) {
    if (positions.includes(position)) return PEAK_RANGES[category];
  }
  return PEAK_RANGES.MID;
}

function getPlayerGrowthRange(player: Player): PeakRange {
  if (player.peakRange?.start !== undefined && player.peakRange?.end !== undefined) {
    return player.peakRange;
  }

  return getPeakRange(player.position);
}

function getGrowthPotential(player: Player): number {
  if (player.playerType === "BURNOUT") return Math.floor(player.potential * 0.80);
  return player.potential;
}

export function calculateOverallChange(player: Player, facilityRating = 3): number {
  const { age, overall, potential } = player;
  const { start: peakStart, end: peakEnd } = getPlayerGrowthRange(player);
  const growthPotential = Math.min(potential, getGrowthPotential(player));

  let newOverall = overall;

  if (age < peakStart) {
    if (age < 19) {
      newOverall = Math.min(
        growthPotential,
        overall + Math.floor(0.65 * randInt(3, 5) * (19 - age))
      );
    } else {
      const coefficient = age < 23 ? 0.8 : 0.7;
      newOverall = Math.min(
        growthPotential,
        overall + Math.floor(
          coefficient * randInt(4, 7 + (age - 18)) / (age - 18)
        )
      );
    }
  } else if (age >= peakStart && age <= peakEnd) {
    if (overall < 0.75 * growthPotential || overall < growthPotential - 11) {
      newOverall = overall + 0.25 * (growthPotential - overall);
    } else {
      newOverall = Math.min(overall + randInt(-2, 2), growthPotential);
    }
  } else {
    newOverall = overall - (0.5 * randInt(1, 2) * (age - peakEnd));
  }

  newOverall = Math.max(20, Math.min(growthPotential, newOverall));

  const rawChange = newOverall - overall;
  const multipliers = FACILITY_MULTIPLIERS[facilityRating] ?? FACILITY_MULTIPLIERS[3];
  let adjustedChange = rawChange;
  if (rawChange > 0) adjustedChange *= multipliers.growth;
  else if (rawChange < 0) adjustedChange *= multipliers.decline;

  const finalOverall = Math.round(overall + adjustedChange);
  return Math.max(20, Math.min(growthPotential, finalOverall)) - overall;
}

export function applyPlayerGrowth(player: Player, facilityRating = 3): number {
  const change = calculateOverallChange(player, facilityRating);
  player.overall = Math.max(
    20,
    Math.min(player.playerType === "BURNOUT" ? Math.floor(player.potential * 0.80) : player.potential,
      player.overall + change)
  );
  return change;
}

/**
 * Ages every player on the managed team by one year and applies growth.
 * `newSeasonYear` is only used to record the year-by-year progression history.
 */
export function applySquadGrowth(team: Team, newSeasonYear: number): void {
  for (const player of [
    ...(team.seniorSquad ?? []),
    ...(team.youthAcademySquad ?? [])
  ]) {
    player.age += 1;
    applyPlayerGrowth(player, team.facilityRating);
    player.progression.push({
      year: newSeasonYear,
      age: player.age,
      overall: player.overall,
      potential: player.potential
    });
  }
}
