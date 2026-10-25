import retirementChanceRaw from "./data/retirement_chance.json";
import { SEASON_END_MATCHDAY } from "./constants";
import { closeStint } from "./playerHistory";
import { collectSeasonPlayers } from "./playerIds";
import type { Season } from "./season";
import type { Player } from "./types";

const retirementChance = retirementChanceRaw as Record<string, number>;
const MINIMUM_RETIREMENT_AGE = 34;
const MAXIMUM_RETIREMENT_AGE = 41;
const LATE_BLOOMER_AGE_SHIFT = 2;
const BURNOUT_AGE_SHIFT = -2;

function getRetirementChance(player: Player): number {
  if (player.age < MINIMUM_RETIREMENT_AGE) return 0;
  if (player.age > MAXIMUM_RETIREMENT_AGE) return 0.95;

  const shift = player.playerType === "LATE BLOOMER"
    ? LATE_BLOOMER_AGE_SHIFT
    : player.playerType === "BURNOUT"
      ? BURNOUT_AGE_SHIFT
      : 0;
  const probabilityAge = player.age - shift;
  if (probabilityAge < MINIMUM_RETIREMENT_AGE) return 0;
  return retirementChance[String(Math.min(probabilityAge, MAXIMUM_RETIREMENT_AGE))] ?? 0;
}

/** Assigns each active player a once-per-season chance to retire at the end of this season. */
export function schedulePlayerRetirements(season: Season): void {
  for (const player of collectSeasonPlayers(season)) {
    if (player.isRetired) continue;
    if (player.retirementYear === season.year) continue;

    player.retirementYear = null;
    const chance = getRetirementChance(player);
    if (chance > 0 && Math.random() < chance) {
      player.retirementYear = season.year;
    }
  }
}

/** Moves designated players out of active squads and into the permanent retired-player list. */
export function retireScheduledPlayers(season: Season): Player[] {
  const retiring = collectSeasonPlayers(season).filter(player =>
    !player.isRetired && player.retirementYear === season.year
  );
  if (retiring.length === 0) return [];

  const retiringSet = new Set(retiring);
  const manager = season.managerTeam;
  if (manager) {
    manager.seniorSquad = (manager.seniorSquad ?? []).filter(player => !retiringSet.has(player));
    manager.youthAcademySquad = (manager.youthAcademySquad ?? []).filter(player => !retiringSet.has(player));
    manager.scoutedPlayers = (manager.scoutedPlayers ?? []).filter(player => !retiringSet.has(player));
    for (const mission of manager.scoutingMissions ?? []) {
      mission.candidates = mission.candidates.filter(player => !retiringSet.has(player));
    }
  }

  const freeAgents = season.freeAgents;
  freeAgents.available = freeAgents.available.filter(entry => !retiringSet.has(entry.player));
  for (const [teamID, entries] of Object.entries(freeAgents.clubPlayers)) {
    const remaining = entries.filter(entry => !retiringSet.has(entry.player));
    if (remaining.length === 0) delete freeAgents.clubPlayers[Number(teamID)];
    else freeAgents.clubPlayers[Number(teamID)] = remaining;
  }

  for (const player of retiring) {
    player.isRetired = true;
    closeStint(player, season.year, SEASON_END_MATCHDAY);
    freeAgents.retiredPlayers.push(player);
  }
  return retiring;
}
