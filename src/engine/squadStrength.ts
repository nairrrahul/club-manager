import type { Season } from "./season";
import { POSITION_GROUP } from "./formation";
import type { Position } from "./types";

/** A player counts as a "star" (raising the team's overall) above this multiple of the team's base overall. */
export const STAR_PLAYER_FACTOR = 1.1;
export const STAR_PLAYERS_COUNTED = 11;
export const STAR_XI_SLOTS: Record<"GK" | "DEF" | "MID" | "FWD", number> = {
  GK: 1, DEF: 4, MID: 3, FWD: 3
};

/**
 * Overall added by exceptional players selected for a positional 1-4-3-3 XI.
 * Every selected star adds 1/11 of their rating above the club or nation's base overall.
 */
export function starBonus(
  baseOverall: number,
  players: { overall: number; position: Position }[]
): number {
  let total = 0;
  for (const [group, slots] of Object.entries(STAR_XI_SLOTS) as ["GK" | "DEF" | "MID" | "FWD", number][]) {
    const stars = players
      .filter(player => POSITION_GROUP[player.position] === group && player.overall > STAR_PLAYER_FACTOR * baseOverall)
      .sort((a, b) => b.overall - a.overall)
      .slice(0, slots);
    total += stars.reduce((sum, player) => sum + player.overall - baseOverall, 0);
  }
  return total / STAR_PLAYERS_COUNTED;
}

type ClubPlayers = Record<number, { player: { overall: number; position: Position } }[]>;

/** Star bonus for a non-managed club from the players it has signed. */
export function clubStarBonus(clubPlayers: ClubPlayers, teamID: number, baseOverall: number): number {
  return starBonus(baseOverall, (clubPlayers[teamID] ?? []).map(entry => entry.player));
}

/** Rounded in-season overall: base + player bonus (no form) for a club not currently simulated. */
export function clubRestingOverall(clubPlayers: ClubPlayers, teamID: number, baseOverall: number): number {
  return Math.round(baseOverall + clubStarBonus(clubPlayers, teamID, baseOverall));
}

/**
 * Recomputes the player bonus and the in-season overall (base + player bonus + form, rounded) of
 * every non-managed club that is currently part of the simulation (English clubs and this
 * season's European and Club World Cup entrants).
 */
export function refreshAllClubOveralls(season: Season): void {
  const managerID = season.managerTeam?.ID;
  const refresh = (team: { ID: number; BaseOverall: number; playerBonus: number; recomputeOverall: () => void }) => {
    if (team.ID === managerID) {
      // The managed club's overall comes from its starting XI, never from a player bonus.
      team.playerBonus = 0;
      return;
    }
    team.playerBonus = clubStarBonus(season.freeAgents.clubPlayers, team.ID, team.BaseOverall);
    team.recomputeOverall();
  };
  for (const league of Object.values(season.leagueStates)) league.teams.forEach(refresh);
  for (const competition of Object.values(season.europeanCompetitions ?? {})) {
    competition.teams.filter(team => team.isEuropeanGuest).forEach(refresh);
  }
  for (const team of season.clubWorldCup?.teams ?? []) refresh(team);
  for (const tournament of Object.values(season.continentalTournaments ?? {})) {
    for (const team of tournament.teams) refresh(team);
  }
}

/** Refreshes one live club (e.g. right after it signs a player). */
export function refreshClubOverall(season: Season, teamID: number): void {
  const managerID = season.managerTeam?.ID;
  if (teamID === managerID) return;
  const apply = (team: { ID: number; BaseOverall: number; playerBonus: number; recomputeOverall: () => void }) => {
    team.playerBonus = clubStarBonus(season.freeAgents.clubPlayers, team.ID, team.BaseOverall);
    team.recomputeOverall();
  };
  for (const league of Object.values(season.leagueStates)) {
    const team = league.teams.find(candidate => candidate.ID === teamID);
    if (team) apply(team);
  }
  for (const competition of Object.values(season.europeanCompetitions ?? {})) {
    const team = competition.teams.find(candidate => candidate.ID === teamID);
    if (team) apply(team);
  }
  const worldCupTeam = season.clubWorldCup?.teams.find(team => team.ID === teamID);
  if (worldCupTeam) apply(worldCupTeam);
  for (const tournament of Object.values(season.continentalTournaments ?? {})) {
    const team = tournament.teams.find(candidate => candidate.ID === teamID);
    if (team) apply(team);
  }
}
