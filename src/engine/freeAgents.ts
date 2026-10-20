import { createFreeAgentPlayer, calculateTeamOverall } from "./playerSquad";
import { applyPlayerGrowth } from "./playerGrowth";
import { europeanTeamPool } from "./europeanCompetitions";
import { nationInfo } from "./nations";
import { seasonDisplay } from "./constants";
import { transferPlayer } from "./playerHistory";
import { refreshClubOverall } from "./squadStrength";
import type { Season } from "./season";
import type { Team } from "./team";
import type { FreeAgentEntry, FreeAgentState, Player } from "./types";

/** Seasons the managed club must wait before re-signing a player it released. */
export const RESIGN_BLOCK_SEASONS = 2;
/** Free agents develop as if training at a 1-star facility. */
export const FREE_AGENT_FACILITY_RATING = 1;

export function createFreeAgentState(): FreeAgentState {
  return { available: [], clubPlayers: {}, nextSeq: 1, autoSendUnsignedScouts: false };
}

/** Generates 3-5 new free agents at the start of a season. */
export function generateFreeAgents(state: FreeAgentState, year: number): Player[] {
  const count = 3 + Math.floor(Math.random() * 3);
  const created: Player[] = [];
  for (let i = 0; i < count; i++) {
    const player = createFreeAgentPlayer(`FA${year}-${state.nextSeq++}`, year);
    state.available.push({ player, addedYear: year, releasedBy: null, resignBlockedUntilYear: null });
    created.push(player);
  }
  return created;
}

/** A player released by the managed club becomes a free agent (re-signing blocked for 2 seasons). */
export function addReleasedPlayer(
  state: FreeAgentState,
  player: Player,
  year: number,
  matchday: number,
  releasedBy: string
): void {
  transferPlayer(player, null, year, matchday);
  state.available.push({
    player,
    addedYear: year,
    releasedBy,
    resignBlockedUntilYear: year + RESIGN_BLOCK_SEASONS
  });
}

export function isResignBlocked(entry: FreeAgentEntry, year: number): boolean {
  return entry.resignBlockedUntilYear !== null && year < entry.resignBlockedUntilYear;
}

export function resignBlockMessage(entry: FreeAgentEntry): string {
  return entry.resignBlockedUntilYear === null
    ? ""
    : `You released ${entry.player.firstName} ${entry.player.lastName}; they cannot be re-signed until the ${seasonDisplay(entry.resignBlockedUntilYear)} season.`;
}

/** The managed club signs a free agent into the senior squad. */
export function signFreeAgentForTeam(
  season: Season,
  team: Team,
  playerID: string
): { error?: string; player?: Player } {
  const state = season.freeAgents;
  const index = state.available.findIndex(entry => entry.player.id === playerID);
  if (index < 0) return { error: "That player is no longer available." };
  const entry = state.available[index];
  if (isResignBlocked(entry, season.year)) return { error: resignBlockMessage(entry) };
  if ((team.seniorSquad as Player[]).length >= team.maxSeniorSquadSize) return { error: "Senior squad is full." };

  state.available.splice(index, 1);
  entry.player.isShortlisted = false; // managed-club players are never shortlisted
  entry.player.contractExpiry = season.year + 3;
  transferPlayer(entry.player, { id: team.ID, name: team.Team }, season.year, season.matchday);
  (team.seniorSquad as Player[]).push(entry.player);
  calculateTeamOverall(team);
  return { player: entry.player };
}

// ---------------------------------------------------------------------------
// Development
// ---------------------------------------------------------------------------

function advanceOneYear(player: Player, facilityRating: number, year: number): void {
  player.age += 1;
  applyPlayerGrowth(player, facilityRating);
  player.progression.push({ year, age: player.age, overall: player.overall, potential: player.potential });
}

/**
 * Season rollover: free agents age and develop as if at a 1-star facility; players
 * signed by other clubs develop with their club's facility rating.
 */
export function developFreeAgentWorld(season: Season, newYear: number): void {
  const state = season.freeAgents;
  for (const entry of state.available) {
    advanceOneYear(entry.player, FREE_AGENT_FACILITY_RATING, newYear);
  }

  const facilityByTeam = new Map<number, number>();
  for (const league of Object.values(season.leagueStates)) {
    for (const team of league.teams) facilityByTeam.set(team.ID, team.facilityRating);
  }
  for (const [teamID, entries] of Object.entries(state.clubPlayers)) {
    const facility = facilityByTeam.get(Number(teamID)) ?? 3;
    for (const entry of entries) advanceOneYear(entry.player, facility, newYear);
  }
}

// ---------------------------------------------------------------------------
// Other clubs signing free agents
// ---------------------------------------------------------------------------

interface Suitor {
  id: number;
  name: string;
  overall: number;
  country: string;
}

const confederationByCode = new Map<string, string>(
  Object.values(nationInfo).map(info => [info.threeLetterCode, info.confederationID])
);

/** Every club except the managed one: English teams and the European pool. */
function buildSuitors(season: Season): Suitor[] {
  const suitors: Suitor[] = [];
  const managerID = season.managerTeam?.ID;
  for (const league of Object.values(season.leagueStates)) {
    for (const team of league.teams) {
      if (team.ID === managerID) continue;
      suitors.push({ id: team.ID, name: team.Team, overall: team.BaseOverall, country: "ENG" });
    }
  }
  for (const teams of Object.values(europeanTeamPool)) {
    for (const team of teams) {
      suitors.push({ id: team.id, name: team.team, overall: team.overall, country: team.countrycode });
    }
  }
  return suitors;
}

/** How good a player is for the purpose of matching to a club (potential counts for the young). */
export function playerValue(player: Player): number {
  return 0.7 * player.overall + 0.3 * player.potential;
}

/** Highest value a club will take relative to its own rating, and how far below it will go. */
const MAX_ABOVE_CLUB = 3;
const MAX_BELOW_CLUB = 13;

export function clubCanSign(clubOverall: number, player: Player): boolean {
  const value = playerValue(player);
  return value <= clubOverall + MAX_ABOVE_CLUB && value >= clubOverall - MAX_BELOW_CLUB;
}

/**
 * Chance (per matchday) that some club signs a given free agent. It is driven mainly by overall
 * (with a little weight on potential) and rises steeply: a high-rated free agent is usually picked up
 * within a few matchdays, a mid-rated one within a month or two, and a low-rated one may stay
 * unattached for a season or more.
 *
 *   appeal 75+ -> ~31%/matchday (median ~2 matchdays)    appeal 60 -> ~6%   (median ~11)
 *   appeal 70  -> ~20%/matchday (median ~3)              appeal 55 -> ~2.4% (median ~28)
 *   appeal 65  -> ~12%/matchday (median ~5)              appeal <=50 -> 1.2% (median ~57)
 */
export function dailySigningChance(player: Player): number {
  const appeal = 0.75 * player.overall + 0.25 * player.potential;
  const strength = Math.max(0, Math.min(1, (appeal - 50) / 25));
  let chance = 0.012 + 0.30 * strength * strength;
  if (player.age >= 30) chance *= 0.6;
  return chance;
}

export const HOME_COUNTRY_WEIGHT = 5.5;        // club in the player's primary nationality
export const SECONDARY_COUNTRY_WEIGHT = 3.5; // club in the player's secondary nationality
export const SAME_CONFEDERATION_WEIGHT = 1.5;


function nationalityWeight(player: Player, suitor: Suitor): number {
  const nationalities = [player.primaryNationality, player.secondaryNationality].filter(Boolean) as string[];
  const british = ["ENG", "SCO", "WAL", "NIR"];
  let weight = 1;
  for (const code of nationalities) {
    if (code === suitor.country || (suitor.country === "ENG" && british.includes(code))) {
      weight = Math.max(weight, code === player.primaryNationality ? HOME_COUNTRY_WEIGHT : SECONDARY_COUNTRY_WEIGHT);
    } else if (
      confederationByCode.get(code) !== undefined &&
      confederationByCode.get(code) === confederationByCode.get(suitor.country)
    ) {
      weight = Math.max(weight, SAME_CONFEDERATION_WEIGHT);
    }
  }
  return weight;
}


function weightedPick<T>(items: T[], weights: number[]): T | null {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return null;
  let random = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random < 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Called once per matchday. Each free agent may be signed by a club whose rating fits the
 * player (no large overall/potential gap in either direction); club choice favours the
 * same country/region and a close rating match, and clubs that already took free agents
 * are less likely to take more.
 */
export function processFreeAgentSigning(season: Season): void {
  const state = season.freeAgents;
  if (state.available.length === 0) return;

  const suitors = buildSuitors(season);
  for (const entry of [...state.available]) {
    const player = entry.player;
    if (Math.random() >= dailySigningChance(player)) continue;

    const eligible = suitors.filter(suitor => clubCanSign(suitor.overall, player));
    if (eligible.length === 0) continue;

    const value = playerValue(player);
    const weights = eligible.map(suitor => {
      const closeness = Math.exp(-Math.abs(suitor.overall - 3 - value) / 6);
      const alreadySigned = state.clubPlayers[suitor.id]?.length ?? 0;
      return nationalityWeight(player, suitor) * closeness / (1 + alreadySigned);
    });
    const chosen = weightedPick(eligible, weights);
    if (!chosen) continue;

    state.available.splice(state.available.indexOf(entry), 1);
    player.contractExpiry = season.year + 3;
    transferPlayer(player, { id: chosen.id, name: chosen.name }, season.year, season.matchday);
    (state.clubPlayers[chosen.id] ??= []).push({
      player,
      teamID: chosen.id,
      signedYear: season.year,
      signedMatchday: season.matchday
    });
    // A star signing raises the club's overall straight away.
    refreshClubOverall(season, chosen.id);
  }
}

/**
 * Unsigned youth-scouting candidates become free agents (only when the user has enabled
 * auto-sending). They are unattached, with no re-sign restriction.
 */
export function sendUnsignedScoutsToFreeAgents(season: Season, players: Player[]): void {
  if (!season.freeAgents.autoSendUnsignedScouts) return;
  for (const player of players) {
    player.isShortlisted = false;
    transferPlayer(player, null, season.year, season.matchday);
    season.freeAgents.available.push({
      player,
      addedYear: season.year,
      releasedBy: null,
      resignBlockedUntilYear: null
    });
  }
}
