import type { Player, PlayerStint } from "./types";

export const FREE_AGENTS_LABEL = "Free Agents";

/** A club, or null for free agency. */
export type ClubRef = { id: number; name: string } | null;

export function openStint(player: Player, club: ClubRef, year: number, matchday: number): void {
  player.history.push({
    teamID: club ? club.id : null,
    teamName: club ? club.name : FREE_AGENTS_LABEL,
    startYear: year,
    startMatchday: matchday,
    endYear: null,
    endMatchday: null
  });
}

export function closeStint(player: Player, year: number, matchday: number): void {
  const current = player.history[player.history.length - 1];
  if (current && current.endYear === null) {
    current.endYear = year;
    current.endMatchday = matchday;
  }
}

/** Moves a player to another club (or to free agency with `club = null`). */
export function transferPlayer(player: Player, club: ClubRef, year: number, matchday: number): void {
  closeStint(player, year, matchday);
  openStint(player, club, year, matchday);
}

export interface HistoryRow {
  year: number;
  teamID: number | null;
  teamName: string;
  /** Matchday the player joined during this season (0 = start of season). */
  startMatchday: number;
  /** Matchday the player left during this season (null = stayed until the season ended / still there). */
  endMatchday: number | null;
  ongoing: boolean;
}

/**
 * Season-by-season rows, newest first. A player who belonged to several clubs in one
 * season gets one row per club for that season.
 */
export function buildHistoryRows(player: Player, currentYear: number): HistoryRow[] {
  const rows: HistoryRow[] = [];
  player.history.forEach((stint: PlayerStint) => {
    const lastYear = stint.endYear ?? currentYear;
    for (let year = stint.startYear; year <= lastYear; year++) {
      const startMatchday = year === stint.startYear ? stint.startMatchday : 0;
      const endMatchday = stint.endYear !== null && year === stint.endYear ? stint.endMatchday : null;
      // Skip stints that covered no matchdays at all (e.g. released at the very start of a season).
      if (endMatchday !== null && endMatchday === startMatchday) continue;
      rows.push({
        year,
        teamID: stint.teamID,
        teamName: stint.teamName,
        startMatchday,
        endMatchday,
        ongoing: stint.endYear === null && year === currentYear
      });
    }
  });
  // Newest season first; within a season the most recent club first.
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => b.row.year - a.row.year || b.index - a.index)
    .map(item => item.row);
}
