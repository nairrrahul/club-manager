import teamsJson from "./data/teams.json";
import {
  createInitialSeason, getTeamFromSeason, simulateMatchdays, simulateSeasonToCompletion,
  isSeasonComplete, advanceToNextSeason
} from "./season";
import type { Season } from "./season";
import {
  initializeManagerTeam, promoteYouthPlayer, releaseSeniorPlayer, releaseYouthPlayer,
  calculateTeamOverall, getYouthPlayersAgingOut, changePlayerPosition, changeFormation,
  setStartingXIMode, setStartingXISlot, getPlayer, MAX_GOD_MODE_POTENTIAL
} from "./playerSquad";
import { sendYouthScout, signScoutedPlayer } from "./youthScouting";
import { europeanTeamPool } from "./europeanCompetitions";
import {
  addReleasedPlayer, signFreeAgentForTeam, isResignBlocked, generateClubRegens
} from "./freeAgents";
import { clubRestingOverall, refreshAllClubOveralls, refreshClubOverall } from "./squadStrength";
import { snapshotSeason } from "./snapshots";
import type { SeasonArchive } from "./snapshots";
import {
  autoSimulateWindowIfDue, computeOverallRankings, computeRankings, getActiveWindow, getCallUpNation,
  hasPendingWindow, simulateInternationalWindow, startWindowIfDue
} from "./international";
import type { OverallRankRow, RankRow, WindowRecord } from "./international";
import { SEASON_END_MATCHDAY, seasonDisplay } from "./constants";
import { RESIGN_BLOCK_SEASONS } from "./freeAgents";
import { Team } from "./team";
import type { RawTeam } from "./team";
import type { ClubPlayerEntry, FreeAgentEntry, Player, Position } from "./types";
import { POSITION_ORDER } from "./formation";
import { generateNameForNationalities } from "./nameGenerator";
import { isValidNationCode } from "./nations";
import { openStint } from "./playerHistory";
import { nextPlayerID, assertUniquePlayerID } from "./playerIds";
import { schedulePlayerRetirements } from "./retirement";
import { continentalTeams, simulateClubWorldCup as playClubWorldCup } from "./clubWorldCup";
import type { ClubWorldCup } from "./clubWorldCup";

export interface Game {
  season: Season;
  managerTeam: Team;
  godMode: boolean;
  /** Bumped by the store after every mutation; used to invalidate caches. */
  version: number;
  liveCache: { version: number; snap: SeasonArchive } | null;
}

export interface ActionResult {
  ok: boolean;
  message?: string;
  error?: string;
}

export const ADD_PLAYER_AGE_MIN = 15;
export const ADD_PLAYER_AGE_MAX = 45;

export interface GodAddPlayerInput {
  firstName?: string;
  lastName?: string;
  age: number;
  position: Position;
  overall: number;
  potential: number;
  primaryNationality: string;
  secondaryNationality: string | null;
  clubID: number | null;
}

const ok = (message?: string): ActionResult => ({ ok: true, message });
const fail = (error: string): ActionResult => ({ ok: false, error });

// ---------------------------------------------------------------------------
// Team directory (static info for every team in the game world)
// ---------------------------------------------------------------------------

export interface TeamDirectoryEntry {
  id: number;
  name: string;
  kind: "ENG" | "EUR" | "CON";
  countrycode: string;
  baseOverall: number;
  facilityRating: number;
  youthScouting: number;
  youthExperience: number;
}

const rawTeams = teamsJson as RawTeam[];

export const TEAM_DIRECTORY: Map<number, TeamDirectoryEntry> = new Map();
for (const team of rawTeams) {
  TEAM_DIRECTORY.set(team.ID, {
    id: team.ID,
    name: team.Team,
    kind: "ENG",
    countrycode: "ENG",
    baseOverall: team.Overall,
    facilityRating: team.facilityRating ?? 3,
    youthScouting: team.youthScouting ?? 3,
    youthExperience: team.youthExperience ?? 3
  });
}
for (const teams of Object.values(europeanTeamPool)) {
  for (const team of teams) {
    TEAM_DIRECTORY.set(team.id, {
      id: team.id,
      name: team.team,
      kind: "EUR",
      countrycode: team.countrycode,
      baseOverall: team.overall,
      facilityRating: team.facilityRating ?? 3,
      youthScouting: team.youthScouting ?? 3,
      youthExperience: team.youthExperience ?? 3
    });
  }
}
for (const teams of Object.values(continentalTeams)) {
  for (const team of teams) {
    TEAM_DIRECTORY.set(team.id, {
      id: team.id,
      name: team.team,
      kind: "CON",
      countrycode: team.countrycode,
      baseOverall: team.overall,
      facilityRating: team.facilityRating ?? 3,
      youthScouting: team.youthScouting ?? 3,
      youthExperience: team.youthExperience ?? 3
    });
  }
}

// ---------------------------------------------------------------------------

export function createGame(teamID: number): Game {
  const season = createInitialSeason();
  const team = getTeamFromSeason(season, teamID);
  if (!team) throw new Error(`No team found with ID ${teamID}.`);

  initializeManagerTeam(team, season.year);
  season.managerTeam = team;
  generateClubRegens(season);
  refreshAllClubOveralls(season);
  schedulePlayerRetirements(season);

  return { season, managerTeam: team, godMode: false, version: 0, liveCache: null };
}

/** Snapshot of the in-progress season (cached per game version). */
export function getLiveSnapshot(game: Game): SeasonArchive {
  if (!game.liveCache || game.liveCache.version !== game.version) {
    game.liveCache = { version: game.version, snap: snapshotSeason(game.season) };
  }
  return game.liveCache.snap;
}

export function getSeasonView(game: Game, year: number): SeasonArchive | null {
  if (year === game.season.year) return getLiveSnapshot(game);
  return game.season.archives.find(archive => archive.year === year) ?? null;
}

/** All season archives, oldest first, with the live season last. */
export function getAllSeasonViews(game: Game): SeasonArchive[] {
  return [...game.season.archives, getLiveSnapshot(game)];
}

/** Live Team object for English clubs and teams participating in this season's competitions. */
export function getLiveTeam(game: Game, teamID: number): Team | null {
  const english = getTeamFromSeason(game.season, teamID);
  if (english) return english;
  const worldCupTeam = game.season.clubWorldCup?.teams.find(team => team.ID === teamID);
  if (worldCupTeam) return worldCupTeam;
  for (const tournament of Object.values(game.season.continentalTournaments ?? {})) {
    const team = tournament.teams.find(candidate => candidate.ID === teamID);
    if (team) return team;
  }
  for (const competition of Object.values(game.season.europeanCompetitions ?? {})) {
    const team = competition.teams.find(candidate => candidate.ID === teamID);
    if (team) return team;
  }
  return null;
}

export function getTeamProfile(game: Game, teamID: number) {
  const entry = TEAM_DIRECTORY.get(teamID);
  if (!entry) return null;

  const live = getLiveTeam(game, teamID);
  const base = live ?? new Team({
    ID: entry.id,
    Team: entry.name,
    Overall: entry.baseOverall,
    Tier: 0,
    facilityRating: entry.facilityRating,
    youthScouting: entry.youthScouting,
    youthExperience: entry.youthExperience
  });

  let league: { tier: number; position: number } | null = null;
  if (entry.kind === "ENG") {
    for (const [tier, state] of Object.entries(game.season.leagueStates)) {
      if (state.table[teamID]) {
        const standings = Object.values(state.table).sort((a, b) =>
          b.PTS - a.PTS || b.GD - a.GD || b.GF - a.GF || a.team.Team.localeCompare(b.team.Team));
        league = { tier: Number(tier), position: standings.findIndex(row => row.team.ID === teamID) + 1 };
        break;
      }
    }
  }

  const europe: string[] = [];
  for (const [code, competition] of Object.entries(game.season.europeanCompetitions ?? {})) {
    if (competition.teams.some(team => team.ID === teamID)) europe.push(code);
  }
  const clubWorldCup = game.season.clubWorldCup?.teams.some(team => team.ID === teamID) ?? false;

  return {
    id: entry.id,
    name: entry.name,
    kind: entry.kind,
    countrycode: entry.countrycode,
    baseOverall: live
      ? Math.round(base.BaseOverall + (base.playerBonus ?? 0))
      : clubRestingOverall(game.season.freeAgents.clubPlayers, entry.id, entry.baseOverall),
    // In-season overall (base + player-based bonus + form, whole number). A club that is not part of
    // this season's simulation has no form, so its resting overall is shown.
    overall: live ? base.Overall : clubRestingOverall(game.season.freeAgents.clubPlayers, entry.id, entry.baseOverall),
    facilityRating: base.facilityRating,
    scoutingRating: base.scoutingRating,
    scoutingExperience: base.scoutingExperience,
    isManaged: teamID === game.managerTeam.ID,
    league,
    europe,
    clubWorldCup,
    seasonHistory: base.seasonHistory
  };
}

export type TeamProfile = NonNullable<ReturnType<typeof getTeamProfile>>;

// ---------------------------------------------------------------------------
// Simulation (terminal: c, c X, z, n)
// ---------------------------------------------------------------------------

export function simulate(game: Game, count: number): ActionResult {
  const { season } = game;
  if (isSeasonComplete(season)) {
    return fail("Season is complete. Start the next season when you are ready.");
  }

  const remaining = SEASON_END_MATCHDAY - season.matchday;
  const before = season.matchday;
  const actual = Math.min(count, remaining);
  simulateMatchdays(season, actual);

  const played = season.matchday - before;
  let message = `Simulated ${played} matchday${played === 1 ? "" : "s"}. Current matchday: ${season.matchday}.`;
  // Stopping for an international window is not announced (the controls change instead).
  const stoppedForWindow = season.international.explicitWindows && hasPendingWindow(season);
  const stoppedForClubWorldCup = season.explicitClubWorldCup && season.clubWorldCup !== null &&
    !season.clubWorldCup.completed && season.matchday >= 21;
  if (!isSeasonComplete(season) && season.matchday !== before + actual && !stoppedForWindow && !stoppedForClubWorldCup) {
    message += " Simulation stopped because a youth scouting mission is returning.";
  } else if (isSeasonComplete(season)) {
    message += " Season complete.";
  }
  return ok(message);
}

export function finishSeason(game: Game): ActionResult {
  const { season } = game;
  if (isSeasonComplete(season) && season.promotionPlayoffs) {
    return fail("The season and promotion playoffs are already complete.");
  }
  simulateSeasonToCompletion(season);
  if (isSeasonComplete(season)) {
    return ok("Season and promotion playoffs complete.");
  }
  if (season.international.explicitWindows && hasPendingWindow(season)) return ok();
  if (season.explicitClubWorldCup && season.clubWorldCup && !season.clubWorldCup.completed) return ok();
  return ok(`Simulation stopped at matchday ${season.matchday} because a youth scouting mission returned.`);
}

export interface SeasonSummary {
  newSeasonLabel: string;
  emergencyPlayers: Player[];
  overallChanges: { team: string; tier: number; oldOverall: number; newOverall: number; change: number; reasons: string[] }[];
}

export function canStartNextSeason(game: Game): { ok: boolean; reason?: string; agingOut: Player[] } {
  const { season, managerTeam } = game;
  const agingOut = getYouthPlayersAgingOut(managerTeam);
  if (!isSeasonComplete(season)) {
    return { ok: false, reason: `Cannot start the next season until matchday ${SEASON_END_MATCHDAY}. Current matchday: ${season.matchday}.`, agingOut };
  }
  if (!season.promotionPlayoffs) {
    return { ok: false, reason: "Finish the promotion playoffs before starting the next season.", agingOut };
  }
  if (agingOut.length > 0) {
    return { ok: false, reason: "Youth players aging out must be promoted or released before the next season can begin.", agingOut };
  }
  if (season.international.explicitWindows && hasPendingWindow(season)) {
    return { ok: false, reason: "Simulate the international window before starting the next season.", agingOut };
  }
  if (season.explicitClubWorldCup && season.clubWorldCup && !season.clubWorldCup.completed) {
    return { ok: false, reason: "Simulate the Club World Cup before starting the next season.", agingOut };
  }
  return { ok: true, agingOut };
}

export function startNextSeason(game: Game): { result: ActionResult; summary?: SeasonSummary } {
  const check = canStartNextSeason(game);
  if (!check.ok) return { result: fail(check.reason as string) };

  const previous = game.season;
  // Windows set to automatic are played before the season rolls over.
  autoSimulateWindowIfDue(previous);
  game.season = advanceToNextSeason(previous, game.managerTeam);

  const emergencyPlayers = [...(game.managerTeam.lastSeasonEmergencyPlayers ?? [])];
  game.managerTeam.lastSeasonEmergencyPlayers = [];

  const summary: SeasonSummary = {
    newSeasonLabel: seasonDisplay(game.season.year),
    emergencyPlayers,
    overallChanges: (previous.seasonOverallChanges ?? []).map(change => ({
      team: change.team.Team,
      tier: change.tier,
      oldOverall: change.oldOverall,
      newOverall: change.newOverall,
      change: change.change,
      reasons: change.reasons
    }))
  };

  return { result: ok(`Started season ${summary.newSeasonLabel}.`), summary };
}

// ---------------------------------------------------------------------------
// Squad management (terminal: promote, r, yr, f, position change)
// ---------------------------------------------------------------------------

export function promotePlayer(game: Game, playerID: string): ActionResult {
  const result = promoteYouthPlayer(game.managerTeam, playerID, game.season.year);
  if (result.error || !result.player) return fail(result.error ?? "Unable to promote player.");
  calculateTeamOverall(game.managerTeam);
  return ok(`Promoted ${result.player.firstName} ${result.player.lastName}. Team OVR is now ${game.managerTeam.BaseOverall}.`);
}

export function releaseSenior(game: Game, playerID: string): ActionResult {
  const player = releaseSeniorPlayer(game.managerTeam, playerID);
  if (!player) return fail(`No senior player found with ID ${playerID}.`);
  calculateTeamOverall(game.managerTeam);
  addReleasedPlayer(game.season.freeAgents, player, game.season.year, game.season.matchday, game.managerTeam.Team);
  return ok(`Released ${player.firstName} ${player.lastName} to the free agents. Team OVR is now ${game.managerTeam.BaseOverall}. They cannot be re-signed for ${RESIGN_BLOCK_SEASONS} seasons.`);
}

export function releaseYouth(game: Game, playerID: string): ActionResult {
  const player = releaseYouthPlayer(game.managerTeam, playerID);
  if (!player) return fail(`No youth player found with ID ${playerID}.`);
  addReleasedPlayer(game.season.freeAgents, player, game.season.year, game.season.matchday, game.managerTeam.Team);
  return ok(`Released ${player.firstName} ${player.lastName} from the youth academy to the free agents. They cannot be re-signed for ${RESIGN_BLOCK_SEASONS} seasons.`);
}

// ---------------------------------------------------------------------------
// Free agents
// ---------------------------------------------------------------------------

export function signFreeAgent(game: Game, playerID: string): ActionResult {
  const result = signFreeAgentForTeam(game.season, game.managerTeam, playerID);
  if (result.error || !result.player) return fail(result.error ?? "Unable to sign player.");
  return ok(`Signed ${result.player.firstName} ${result.player.lastName} from the free agents. Team OVR is now ${game.managerTeam.BaseOverall}.`);
}

export function getFreeAgents(game: Game): (FreeAgentEntry & { blocked: boolean })[] {
  return game.season.freeAgents.available.map(entry => ({
    ...entry,
    blocked: isResignBlocked(entry, game.season.year)
  }));
}

/** Players a non-managed club has signed from the free-agent pool. */
export function getClubPlayers(game: Game, teamID: number): ClubPlayerEntry[] {
  return (game.season.freeAgents.clubPlayers[teamID] ?? []).filter(entry => !entry.player.isRetired);
}

export function setFormation(game: Game, formation: string): ActionResult {
  const result = changeFormation(game.managerTeam, formation);
  if (result.error) return fail(result.error);
  return ok(`Formation changed to ${formation}. Team OVR is now ${game.managerTeam.BaseOverall}.`);
}

export function setXIMode(game: Game, mode: "auto" | "manual"): ActionResult {
  setStartingXIMode(game.managerTeam, mode);
  return ok(mode === "auto"
    ? "Starting XI is now selected automatically by player rating."
    : "Manual starting XI selection enabled.");
}

export function setXISlot(game: Game, slotIndex: number, playerID: string): ActionResult {
  const result = setStartingXISlot(game.managerTeam, slotIndex, playerID);
  if (result.error) return fail(result.error);
  return ok(`Starting XI updated. Team OVR is now ${game.managerTeam.BaseOverall}.`);
}

// ---------------------------------------------------------------------------
// Youth scouting (terminal: y, y X, ys X)
// ---------------------------------------------------------------------------

export function sendScout(game: Game, countryCode: string, positions: Position[]): ActionResult {
  const result = sendYouthScout(game.managerTeam, countryCode, game.season.matchday, game.season.year, positions);
  if (result.error || !result.mission) return fail(result.error ?? "Unable to send scout.");
  return ok(`Youth scout sent to ${result.mission.countryCode}. Returns on matchday ${result.mission.returnMatchday}.`);
}

export function signScouted(game: Game, playerID: string): ActionResult {
  const result = signScoutedPlayer(game.managerTeam, playerID, game.season.year, game.season.matchday);
  if (result.error || !result.player) return fail(result.error ?? "Unable to sign player.");
  return ok(`Signed ${result.player.firstName} ${result.player.lastName} to the youth academy.`);
}

// ---------------------------------------------------------------------------
// God Mode (terminal: gm, gms, gme, gmt, gmp)
// ---------------------------------------------------------------------------

export function setGodMode(game: Game, enabled: boolean): void {
  game.godMode = enabled;
}

export function setGodRating(game: Game, which: "scouting" | "experience" | "training", rating: number): ActionResult {
  if (!game.godMode) return fail("God Mode is not enabled.");
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fail("Rating must be an integer from 1 to 5.");
  if (which === "scouting") {
    game.managerTeam.scoutingRating = rating;
    return ok(`Youth scouting rating set to ${rating}.`);
  }
  if (which === "experience") {
    game.managerTeam.scoutingExperience = rating;
    return ok(`Youth scouting experience rating set to ${rating}.`);
  }
  game.managerTeam.facilityRating = rating;
  return ok(`Training rating set to ${rating}.`);
}

export function godChangePosition(game: Game, playerID: string, position: Position): ActionResult {
  if (!game.godMode) return fail("God Mode is not enabled.");
  const result = changePlayerPosition(game.managerTeam, playerID, position);
  if (result.error || !result.player) return fail(result.error ?? "Unable to change position.");
  let message = `Changed ${result.player.firstName} ${result.player.lastName} from ${result.oldPosition} to ${result.player.position}.`;
  if (game.managerTeam.seniorSquad?.includes(result.player)) {
    calculateTeamOverall(game.managerTeam);
    message += ` Team OVR is now ${game.managerTeam.BaseOverall}.`;
  }
  return ok(message);
}

export function godAddPlayer(
  game: Game,
  input: GodAddPlayerInput
): ActionResult & { playerID?: string } {
  if (!game.godMode) return fail("God Mode is not enabled.");
  if (!Number.isInteger(input.age) || input.age < ADD_PLAYER_AGE_MIN || input.age > ADD_PLAYER_AGE_MAX) {
    return fail(`Age must be an integer from ${ADD_PLAYER_AGE_MIN} to ${ADD_PLAYER_AGE_MAX}.`);
  }
  if (!POSITION_ORDER.includes(input.position)) return fail("Choose a valid player position.");
  if (!Number.isInteger(input.overall) || input.overall < 20 || input.overall > MAX_GOD_MODE_POTENTIAL) {
    return fail(`Overall must be an integer from 20 to ${MAX_GOD_MODE_POTENTIAL}.`);
  }
  if (!Number.isInteger(input.potential) || input.potential < 20 || input.potential > MAX_GOD_MODE_POTENTIAL) {
    return fail(`Potential must be an integer from 20 to ${MAX_GOD_MODE_POTENTIAL}.`);
  }
  if (input.potential < input.overall) return fail("Potential must be greater than or equal to overall.");
  if (typeof input.primaryNationality !== "string") return fail("Choose a valid primary nationality.");

  const primaryNationality = input.primaryNationality.toUpperCase();
  if (!isValidNationCode(primaryNationality)) return fail("Choose a valid primary nationality.");
  const secondaryNationality = input.secondaryNationality?.toUpperCase() ?? null;
  if (secondaryNationality && !isValidNationCode(secondaryNationality)) {
    return fail("Choose a valid secondary nationality.");
  }
  if (secondaryNationality === primaryNationality) {
    return fail("The second nationality must differ from the primary nationality.");
  }

  const club = input.clubID === null ? null : TEAM_DIRECTORY.get(input.clubID);
  if (input.clubID !== null && !club) return fail("Choose a valid club.");
  if (input.clubID === game.managerTeam.ID) return fail("Players cannot be added directly to your managed club.");

  const firstName = input.firstName?.trim() ?? "";
  const lastName = input.lastName?.trim() ?? "";
  const generatedName = !firstName || !lastName
    ? generateNameForNationalities(primaryNationality, secondaryNationality)
    : { firstName, lastName };
  const player: Player = {
    id: nextPlayerID(game.season, "GM"),
    firstName: firstName || generatedName.firstName,
    lastName: lastName || generatedName.lastName,
    primaryNationality,
    secondaryNationality,
    age: input.age,
    overall: input.overall,
    potential: input.potential,
    contractExpiry: club ? game.season.year + 3 : null,
    position: input.position,
    isScouted: false,
    playerType: null,
    peakRange: null,
    progression: [{
      year: game.season.year,
      age: input.age,
      overall: input.overall,
      potential: input.potential
    }],
    history: [],
    caps: 0,
    isShortlisted: false
  };
  assertUniquePlayerID(game.season, player.id);
  openStint(player, club ? { id: club.id, name: club.name } : null, game.season.year, game.season.matchday);

  if (club) {
    const entry: ClubPlayerEntry = {
      player,
      teamID: club.id,
      signedYear: game.season.year,
      signedMatchday: game.season.matchday,
      source: "god-mode"
    };
    (game.season.freeAgents.clubPlayers[club.id] ??= []).push(entry);
    refreshClubOverall(game.season, club.id);
  } else {
    const entry: FreeAgentEntry = {
      player,
      addedYear: game.season.year,
      releasedBy: null,
      resignBlockedUntilYear: null
    };
    game.season.freeAgents.available.push(entry);
  }

  return { ...ok(`Added ${player.firstName} ${player.lastName}.`), playerID: player.id };
}

export type PlayerLocation = "senior" | "youth" | "free-agent" | "club" | "retired";

export interface FoundPlayer {
  player: Player;
  location: PlayerLocation;
  /** Club the player belongs to (managed club or the club that signed them). */
  teamID: number | null;
  freeAgent?: FreeAgentEntry;
  club?: ClubPlayerEntry;
}

/** Finds active players and retained retired players by ID. */
export function findPlayer(game: Game, playerID: string): FoundPlayer | null {
  const own = getPlayer(game.managerTeam, playerID);
  if (own) {
    return {
      player: own,
      location: game.managerTeam.seniorSquad?.includes(own) ? "senior" : "youth",
      teamID: game.managerTeam.ID
    };
  }

  const freeAgent = game.season.freeAgents.available.find(entry => entry.player.id === playerID);
  if (freeAgent) return { player: freeAgent.player, location: "free-agent", teamID: null, freeAgent };

  for (const entries of Object.values(game.season.freeAgents.clubPlayers)) {
    const club = entries.find(entry => entry.player.id === playerID);
    if (club) return { player: club.player, location: "club", teamID: club.teamID, club };
  }
  const retired = game.season.freeAgents.retiredPlayers.find(player => player.id === playerID);
  if (retired) return { player: retired, location: "retired", teamID: null };
  return null;
}

export interface PlayerSearchEntry {
  player: Player;
  clubID: number | null;
  clubName: string;
  leagueTier: number | null;
}

/** Searchable active players and their current club/league. */
export function getPlayerSearchPlayers(game: Game): PlayerSearchEntry[] {
  const leagueByTeam = new Map<number, number>();
  for (const league of Object.values(game.season.leagueStates)) {
    for (const team of league.teams) leagueByTeam.set(team.ID, league.tier);
  }

  const entries: PlayerSearchEntry[] = [];
  const add = (player: Player, clubID: number | null): void => {
    if (player.isRetired) return;
    const club = clubID === null ? null : TEAM_DIRECTORY.get(clubID);
    entries.push({
      player,
      clubID,
      clubName: club?.name ?? "Free Agents",
      leagueTier: clubID === null ? null : leagueByTeam.get(clubID) ?? null
    });
  };

  for (const player of [...(game.managerTeam.seniorSquad ?? []), ...(game.managerTeam.youthAcademySquad ?? [])]) {
    add(player, game.managerTeam.ID);
  }
  for (const entry of game.season.freeAgents.available) add(entry.player, null);
  for (const clubEntries of Object.values(game.season.freeAgents.clubPlayers)) {
    for (const entry of clubEntries) add(entry.player, entry.teamID);
  }
  return entries;
}

// ---------------------------------------------------------------------------
// International football
// ---------------------------------------------------------------------------

/** Plays the open international window (no notification: the screens update instead). */
export function simulateWindow(game: Game): ActionResult {
  startWindowIfDue(game.season);
  if (!hasPendingWindow(game.season)) return fail("There is no international window to simulate.");
  simulateInternationalWindow(game.season);
  return ok();
}

export function setExplicitWindows(game: Game, explicit: boolean): ActionResult {
  game.season.international.explicitWindows = explicit;
  return ok();
}

export function setExplicitClubWorldCup(game: Game, explicit: boolean): ActionResult {
  game.season.explicitClubWorldCup = explicit;
  return ok();
}

export function simulateClubWorldCup(game: Game): ActionResult {
  const cup = game.season.clubWorldCup;
  if (!cup || cup.completed || game.season.matchday < 21) {
    return fail("The Club World Cup is not ready to simulate.");
  }
  if (!playClubWorldCup(game.season)) return fail("The Club World Cup could not be simulated.");
  return ok("The Club World Cup has been completed.");
}

export function getPendingClubWorldCup(game: Game): { cup: ClubWorldCup; explicit: boolean } | null {
  const cup = game.season.clubWorldCup;
  if (!cup || cup.completed || game.season.matchday < 21) return null;
  return { cup, explicit: game.season.explicitClubWorldCup };
}

/** The open window, and whether the user must simulate it themselves. */
export function getPendingWindow(game: Game): { window: WindowRecord; explicit: boolean } | null {
  const window = getActiveWindow(game.season.international);
  if (!window) return null;
  return { window, explicit: game.season.international.explicitWindows };
}

/**
 * Nation code a player is away with, shown only while a window is open and windows are being
 * simulated explicitly (the "break").
 */
export function getPlayerInternationalDuty(game: Game, playerID: string): string | null {
  if (!game.season.international.explicitWindows) return null;
  return getCallUpNation(game.season.international, playerID);
}

export function getWorldRankings(game: Game): { points: RankRow[]; overall: OverallRankRow[] } {
  return {
    points: computeRankings(game.season.international),
    overall: computeOverallRankings(game.season.international)
  };
}

export interface NationPlayer {
  player: Player;
  clubID: number | null;
  clubName: string;
}

/** Active players in the game whose primary nationality is the given nation, best first. */
export function getNationPlayers(game: Game, code: string): NationPlayer[] {
  const out: NationPlayer[] = [];
  const manager = game.managerTeam;
  for (const player of [...(manager.seniorSquad ?? []), ...(manager.youthAcademySquad ?? [])]) {
    if (!player.isRetired && player.primaryNationality === code) out.push({ player, clubID: manager.ID, clubName: manager.Team });
  }
  for (const entry of game.season.freeAgents.available) {
    if (!entry.player.isRetired && entry.player.primaryNationality === code) out.push({ player: entry.player, clubID: null, clubName: "Free Agents" });
  }
  for (const [teamID, entries] of Object.entries(game.season.freeAgents.clubPlayers)) {
    for (const entry of entries) {
      if (!entry.player.isRetired && entry.player.primaryNationality === code) {
        out.push({ player: entry.player, clubID: Number(teamID), clubName: TEAM_DIRECTORY.get(Number(teamID))?.name ?? "Unknown club" });
      }
    }
  }
  return out.sort((a, b) => b.player.overall - a.player.overall || b.player.potential - a.player.potential);
}

export interface NationClub {
  id: number;
  name: string;
  overall: number;
  /** League tier for English clubs; null for European clubs. */
  tier: number | null;
}

/** Clubs located in a nation (English clubs for ENG, European pool clubs otherwise), best first. */
export function getNationClubs(game: Game, code: string): NationClub[] {
  const out: NationClub[] = [];
  for (const entry of TEAM_DIRECTORY.values()) {
    if (entry.countrycode !== code) continue;
    const live = getLiveTeam(game, entry.id);
    out.push({
      id: entry.id,
      name: entry.name,
      overall: live ? live.Overall : clubRestingOverall(game.season.freeAgents.clubPlayers, entry.id, entry.baseOverall),
      tier: entry.kind === "ENG" ? (live?.Tier ?? null) : null
    });
  }
  return out.sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Shortlist and scouting-report settings
// ---------------------------------------------------------------------------

/** Adds/removes a player from the shortlist. Managed-club players cannot be shortlisted. */
export function toggleShortlist(game: Game, playerID: string): ActionResult {
  const found = findPlayer(game, playerID);
  if (!found) return fail("Player not found.");
  if (found.location === "senior" || found.location === "youth") {
    return fail("Players on your own team cannot be shortlisted.");
  }
  found.player.isShortlisted = !found.player.isShortlisted;
  return ok();
}

export interface ShortlistEntry {
  player: Player;
  /** Club the player is at, or null for a free agent. */
  clubID: number | null;
  clubName: string;
  freeAgent?: FreeAgentEntry & { blocked: boolean };
  retired?: boolean;
}

/** Every shortlisted player (free agents and players at other clubs). */
export function getShortlistedPlayers(game: Game): ShortlistEntry[] {
  const out: ShortlistEntry[] = [];
  for (const entry of game.season.freeAgents.available) {
    if (entry.player.isShortlisted && !entry.player.isRetired) {
      out.push({
        player: entry.player,
        clubID: null,
        clubName: "Free Agents",
        freeAgent: { ...entry, blocked: isResignBlocked(entry, game.season.year) }
      });
    }
  }
  for (const [teamID, entries] of Object.entries(game.season.freeAgents.clubPlayers)) {
    for (const entry of entries) {
      if (entry.player.isShortlisted && !entry.player.isRetired) {
        out.push({
          player: entry.player,
          clubID: Number(teamID),
          clubName: TEAM_DIRECTORY.get(Number(teamID))?.name ?? "Unknown club"
        });
      }
    }
  }
  return out;
}

/** Every retired player still on the user's shortlist. */
export function getRetiredShortlistedPlayers(game: Game): ShortlistEntry[] {
  return game.season.freeAgents.retiredPlayers
    .filter(player => player.isShortlisted)
    .map(player => ({
      player,
      clubID: null,
      clubName: "Retired",
      retired: true
    }));
}

/** When on, unsigned youth-scouting candidates join the free agents instead of being discarded. */
export function setAutoSendScouts(game: Game, enabled: boolean): ActionResult {
  game.season.freeAgents.autoSendUnsignedScouts = enabled;
  return ok();
}
