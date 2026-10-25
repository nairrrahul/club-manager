import type { Season } from "./season";
import type { Player } from "./types";

/** Lists each distinct player object once, including unsigned scouting candidates. */
export function collectSeasonPlayers(season: Season): Player[] {
  const manager = season.managerTeam;
  const players = [
    ...(manager?.seniorSquad ?? []),
    ...(manager?.youthAcademySquad ?? []),
    ...(manager?.scoutedPlayers ?? []),
    ...(manager?.scoutingMissions ?? []).flatMap(mission => mission.candidates),
    ...season.freeAgents.available.map(entry => entry.player),
    ...Object.values(season.freeAgents.clubPlayers).flatMap(entries => entries.map(entry => entry.player)),
    ...season.freeAgents.retiredPlayers
  ];
  return [...new Set(players)];
}

/** Allocates a globally checked ID using the persisted world-wide sequence counter. */
export function nextPlayerID(season: Season, prefix: string, year = season.year): string {
  const players = collectSeasonPlayers(season);
  let id: string;
  do {
    id = `${prefix}${year}-${season.freeAgents.nextSeq++}`;
  } while (players.some(player => player.id === id));
  return id;
}

/** Throws when a distinct player already occupies this ID. */
export function assertUniquePlayerID(season: Season, id: string, player?: Player): void {
  if (collectSeasonPlayers(season).some(candidate => candidate !== player && candidate.id === id)) {
    throw new Error(`Duplicate player ID detected: ${id}.`);
  }
}
