import type { Season } from "./season";

/** A player counts as a "star" (raising the team's overall) above this multiple of the team's base overall. */
export const STAR_PLAYER_FACTOR = 1.1;
export const STAR_PLAYERS_COUNTED = 11;

/**
 * Overall added to a team by its exceptional players: each of the top 11 players above
 * 1.1x the team's base overall adds 1/11 of (player overall - base overall).
 * Used for national teams (called-up players) and for clubs (players signed from free agency).
 */
export function starBonus(baseOverall: number, playerOveralls: number[]): number {
  return playerOveralls
    .filter(overall => overall > STAR_PLAYER_FACTOR * baseOverall)
    .sort((a, b) => b - a)
    .slice(0, STAR_PLAYERS_COUNTED)
    .reduce((sum, overall) => sum + (overall - baseOverall) / STAR_PLAYERS_COUNTED, 0);
}

type ClubPlayers = Record<number, { player: { overall: number } }[]>;

/** Star bonus for a non-managed club from the players it has signed. */
export function clubStarBonus(clubPlayers: ClubPlayers, teamID: number, baseOverall: number): number {
  return starBonus(baseOverall, (clubPlayers[teamID] ?? []).map(entry => entry.player.overall));
}

/** Rounded in-season overall: base + player bonus (no form) for a club not currently simulated. */
export function clubRestingOverall(clubPlayers: ClubPlayers, teamID: number, baseOverall: number): number {
  return Math.round(baseOverall + clubStarBonus(clubPlayers, teamID, baseOverall));
}

/**
 * Recomputes the player bonus and the in-season overall (base + player bonus + form, rounded) of
 * every non-managed club that is currently part of the simulation (English clubs and this
 * season's European entrants).
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
}
