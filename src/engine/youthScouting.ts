import { createYouthScoutedPlayer, addYouthPlayer } from "./playerSquad";
import { isValidNationCode } from "./nations";
import { openStint } from "./playerHistory";
import type { Team } from "./team";
import type { Player, Position, ScoutingMission } from "./types";

const MISSION_LENGTH = 4;
const MIN_CANDIDATES = 2;
const MAX_CANDIDATES = 6;
export const LAST_SCOUT_SEND_MATCHDAY = 41;
export const MAX_ACTIVE_MISSIONS = 3;

function normalizeCountryCode(code: string): string | null {
  const upper = code.toUpperCase();
  return isValidNationCode(upper) ? upper : null;
}

export function getUnexpiredMissions(team: Team, matchday = Infinity): ScoutingMission[] {
  return (team?.scoutingMissions ?? []).filter(mission => mission.returnMatchday >= matchday);
}

export function canSendYouthScout(team: Team, matchday: number): boolean {
  if (!Array.isArray(team.scoutingMissions)) return false;
  const activeMissions = team.scoutingMissions.filter(mission => !mission.returned && mission.returnMatchday >= matchday);
  if (activeMissions.length >= MAX_ACTIVE_MISSIONS) return false;
  return matchday <= LAST_SCOUT_SEND_MATCHDAY;
}

/** Human-readable reason a scout cannot currently be sent (null when sending is allowed). */
export function getScoutSendBlockReason(team: Team, matchday: number): string | null {
  if (canSendYouthScout(team, matchday)) return null;
  if (matchday > LAST_SCOUT_SEND_MATCHDAY) return "There are fewer than 5 matchdays remaining, so a youth scouting mission cannot be sent.";
  return `You already have ${MAX_ACTIVE_MISSIONS} youth scouting missions out.`;
}

export function sendYouthScout(
  team: Team,
  countryCode: string,
  matchday: number,
  year: number,
  positions: Position[] = []
): { error?: string; mission?: ScoutingMission } {
  const country = normalizeCountryCode(countryCode);
  if (!country) return { error: `Unknown country code: ${countryCode}.` };
  const blockReason = getScoutSendBlockReason(team, matchday);
  if (blockReason) return { error: blockReason };

  // Web UI: season year and a per-matchday sequence number keep mission/player IDs unique
  // across seasons and when several missions are sent on the same matchday.
  const sentThisMatchday = (team.scoutingMissions as ScoutingMission[]).filter(mission => mission.sentMatchday === matchday).length;
  const missionID = `${team.ID}-Y${year}-${matchday}-${sentThisMatchday + 1}`;
  const count = MIN_CANDIDATES + Math.floor(Math.random() * (MAX_CANDIDATES - MIN_CANDIDATES + 1));
  const candidates = Array.from({ length: count }, (_, index) =>
    createYouthScoutedPlayer(team, country, `${missionID}-${index + 1}`, year, positions)
  );

  const mission: ScoutingMission = {
    id: missionID,
    countryCode: country,
    sentMatchday: matchday,
    returnMatchday: matchday + MISSION_LENGTH,
    candidates,
    returned: false
  };

  (team.scoutingMissions as ScoutingMission[]).push(mission);
  team.lastScoutSendMatchday = matchday;
  return { mission };
}

export function processReturnedMissions(
  team: Team,
  matchday: number,
  onExpire?: (unsigned: Player[]) => void
): ScoutingMission[] {
  const returned: ScoutingMission[] = [];
  const remainingMissions: ScoutingMission[] = [];

  for (const mission of team.scoutingMissions ?? []) {
    // A returned mission is valid only on its return matchday. Once the next
    // matchday begins, every unsigned candidate is permanently discarded.
    if (mission.returned && mission.returnMatchday < matchday) {
      const candidateIDs = new Set(mission.candidates.map(player => String(player.id)));
      // Candidates still in the report list were not signed.
      const unsigned = (team.scoutedPlayers ?? []).filter(player => candidateIDs.has(String(player.id)));
      team.scoutedPlayers = (team.scoutedPlayers ?? []).filter(player => !candidateIDs.has(String(player.id)));
      if (unsigned.length > 0) onExpire?.(unsigned);
      continue;
    }

    if (!mission.returned && mission.returnMatchday <= matchday) {
      mission.returned = true;
      (team.scoutedPlayers as Player[]).push(...mission.candidates);
      returned.push(mission);
    }

    if (mission.returnMatchday >= matchday) remainingMissions.push(mission);
  }

  team.scoutingMissions = remainingMissions;
  return returned;
}

export function getNextScoutReturnMatchday(team: Team | null): number | null {
  return (team?.scoutingMissions ?? [])
    .filter(mission => !mission.returned)
    .map(mission => mission.returnMatchday)
    .sort((a, b) => a - b)[0] ?? null;
}

export function getActiveMissionCount(team: Team | null): number {
  return (team?.scoutingMissions ?? []).filter(mission => !mission.returned).length;
}

export function expireAllScoutingMissions(team: Team, onExpire?: (unsigned: Player[]) => void): void {
  const signedIDs = new Set((team?.youthAcademySquad ?? []).map(player => String(player.id)));
  const unsigned = (team.scoutedPlayers ?? []).filter(player => !signedIDs.has(String(player.id)));
  team.scoutedPlayers = (team.scoutedPlayers ?? []).filter(player => signedIDs.has(String(player.id)));
  team.scoutingMissions = [];
  if (unsigned.length > 0) onExpire?.(unsigned);
}

export function signScoutedPlayer(
  team: Team,
  playerID: string,
  year: number,
  matchday: number
): { error?: string; player?: Player } {
  const index = team.scoutedPlayers?.findIndex(player => String(player.id) === String(playerID));
  if (index === undefined || index < 0) return { error: `No scouted player found with ID ${playerID}.` };
  if ((team.youthAcademySquad as Player[]).length >= team.maxYouthAcademySquadSize) return { error: "Youth academy is full." };

  const [player] = (team.scoutedPlayers as Player[]).splice(index, 1);
  addYouthPlayer(team, player);
  openStint(player, { id: team.ID, name: team.Team }, year, matchday);
  return { player };
}

export function getPlayerPotentialRange(player: Player): { lower: number; upper: number } {
  return player.potentialRange ?? { lower: Math.max(40, player.potential - 1), upper: Math.min(95, player.potential + 1) };
}
