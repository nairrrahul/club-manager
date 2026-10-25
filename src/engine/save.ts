import { Team } from "./team";
import type { Game } from "./game";
import type { Season } from "./season";
import { seasonDisplay } from "./constants";
import { createFreeAgentState, generateFreeAgents } from "./freeAgents";
import { FREE_AGENTS_LABEL } from "./playerHistory";
import { createInternationalState, startWindowIfDue, collectAllPlayers } from "./international";
import { refreshAllClubOveralls } from "./squadStrength";
import { collectSeasonPlayers } from "./playerIds";
import { refreshStartingXI } from "./playerSquad";
import { TEAM_DIRECTORY } from "./game";
import { schedulePlayerRetirements } from "./retirement";
import { createClubWorldCup, simulateClubWorldCup } from "./clubWorldCup";
import {
  CONTINENTAL_TOURNAMENT_MATCHDAY, CONTINENTAL_TOURNAMENT_START_YEAR,
  createContinentalTournaments, simulateContinentalTournaments
} from "./continentalTournaments";
import type { Player, PlayerStint } from "./types";

/**
 * Save / load of a complete game.
 *
 * The game state is one large object graph in which the same Team (etc.) object is
 * referenced from many places (leagues, cup bracket, European competitions, history…).
 * A plain JSON.stringify would duplicate those objects and break identity, so this module
 * writes the graph with explicit references:
 *   - objects referenced more than once (and Teams) go in a shared `nodes` table and are
 *     referenced as {"$r": index}; objects referenced once are inlined.
 *   - Team instances are tagged {"$class": "Team"} and rebuilt with the Team prototype.
 *   - `undefined` array entries are written as {"$u": 1}.
 * Anything that cannot be represented exactly (functions, Maps, NaN, unknown classes…)
 * makes saving fail loudly instead of silently dropping data.
 */

export const SAVE_FORMAT = "soccer-season-simulator-save";
/**
 * v1: original format.
 * v2: adds season.freeAgents (free-agent pool + players signed by other clubs).
 * v3: adds player.history (team-by-team career history).
 * v4: adds season.international (national teams, rankings, windows) and player.caps
 *     (a missing caps value in an older save means 0 caps).
 * v5: clubs have playerBonus (overall added by exceptional players they signed); recomputed on load.
 * v6: player.isShortlisted (missing = false) and freeAgents.autoSendUnsignedScouts (missing = false).
 * v7: club-player source, duplicate player-ID repair, and positional club overall recalculation.
 * v8: adds Club World Cup state and automatic/manual simulation preference.
 * v9: adds continental knockout tournaments and their history.
 * v10: stores continental tournaments using the shared seeded knockout bracket.
 * v11: schedules each continental knockout round on its own matchday.
 * v12: adds Nations League divisions, groups, fixtures and history.
 * v13: tracks scheduled and retired players.
 */
export const SAVE_VERSION = 13;

export interface SaveMeta {
  team: string;
  teamID: number;
  season: string;
  year: number;
  matchday: number;
  godMode: boolean;
  savedAt: string;
}

export interface SaveFile {
  format: string;
  version: number;
  meta: SaveMeta;
  root: unknown;
  nodes: unknown[];
}

interface GameRoot {
  season: Season;
  managerTeam: Team;
  godMode: boolean;
}

type Kind = "array" | "plain" | "team";

function classify(value: object, where: string): Kind {
  if (Array.isArray(value)) return "array";
  if (value instanceof Team) return "team";
  const proto = Object.getPrototypeOf(value);
  if (proto === Object.prototype || proto === null) return "plain";
  const name = (proto as { constructor?: { name?: string } })?.constructor?.name ?? "unknown";
  throw new Error(`Cannot save a value of type "${name}" (at "${where}").`);
}

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

export function serializeGraph(root: unknown): { root: unknown; nodes: unknown[] } {
  // Pass 1: count how often each object is reached, and reject unsupported values.
  const counts = new Map<object, number>();

  const visit = (value: unknown, where: string): void => {
    const type = typeof value;
    if (value === null || value === undefined || type === "string" || type === "boolean") return;
    if (type === "number") {
      if (!Number.isFinite(value as number)) throw new Error(`Cannot save non-finite number at "${where}".`);
      return;
    }
    if (type !== "object") throw new Error(`Cannot save a ${type} value (at "${where}").`);

    const object = value as Record<string, unknown>;
    const seen = counts.get(object);
    counts.set(object, (seen ?? 0) + 1);
    if (seen !== undefined) return;

    const kind = classify(object, where);
    if (kind === "array") {
      const array = object as unknown as unknown[];
      for (let i = 0; i < array.length; i++) visit(array[i], where);
    } else {
      for (const key of Object.keys(object)) {
        if (key.startsWith("$")) throw new Error(`Cannot save property "${key}" (at "${where}").`);
        visit(object[key], key);
      }
    }
  };
  visit(root, "game");

  // Pass 2: encode.
  const nodes: unknown[] = [];
  const ids = new Map<object, number>();

  const encode = (value: unknown): unknown => {
    if (value === undefined) return { $u: 1 };
    if (value === null || typeof value !== "object") return value;
    const object = value as object;
    const shared = (counts.get(object) as number) > 1 || object instanceof Team;
    if (!shared) return encodeBody(object);

    let id = ids.get(object);
    if (id === undefined) {
      id = nodes.length;
      ids.set(object, id);
      nodes.push(null); // reserve the slot first so cycles resolve to this id
      nodes[id] = encodeBody(object);
    }
    return { $r: id };
  };

  const encodeBody = (object: object): unknown => {
    if (Array.isArray(object)) {
      const out: unknown[] = new Array(object.length);
      for (let i = 0; i < object.length; i++) out[i] = encode(object[i]);
      return out;
    }
    const record = object as Record<string, unknown>;
    const out: Record<string, unknown> = object instanceof Team ? { $class: "Team" } : {};
    for (const key of Object.keys(record)) {
      const child = record[key];
      if (child === undefined) continue; // absent and undefined are equivalent for objects
      out[key] = encode(child);
    }
    return out;
  };

  return { root: encode(root), nodes };
}

// ---------------------------------------------------------------------------
// Deserialize
// ---------------------------------------------------------------------------

export function deserializeGraph(encodedRoot: unknown, nodes: unknown[]): unknown {
  const resolved: unknown[] = new Array(nodes.length);
  const done: boolean[] = new Array(nodes.length).fill(false);

  const decode = (value: unknown): unknown => {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return decodeArray(value, []);

    const record = value as Record<string, unknown>;
    if ("$u" in record) return undefined;
    if ("$r" in record) return reference(record.$r);
    return decodeObject(record, undefined);
  };

  const decodeArray = (raw: unknown[], target: unknown[]): unknown[] => {
    for (let i = 0; i < raw.length; i++) target[i] = decode(raw[i]);
    return target;
  };

  const decodeObject = (raw: Record<string, unknown>, target: object | undefined): object => {
    let out: Record<string, unknown>;
    if (target) {
      out = target as Record<string, unknown>;
    } else if (raw.$class === "Team") {
      out = Object.create(Team.prototype) as Record<string, unknown>;
    } else if (raw.$class === undefined) {
      out = {};
    } else {
      throw new Error(`Unknown saved class "${String(raw.$class)}".`);
    }
    for (const key of Object.keys(raw)) {
      if (key === "$class") continue;
      out[key] = decode(raw[key]);
    }
    return out;
  };

  const reference = (idValue: unknown): unknown => {
    const id = idValue as number;
    if (!Number.isInteger(id) || id < 0 || id >= nodes.length) throw new Error("Save file contains an invalid reference.");
    if (done[id]) return resolved[id];

    const raw = nodes[id];
    if (Array.isArray(raw)) {
      const target: unknown[] = [];
      resolved[id] = target;
      done[id] = true;
      decodeArray(raw, target);
    } else if (raw && typeof raw === "object") {
      const record = raw as Record<string, unknown>;
      let target: object;
      if (record.$class === "Team") target = Object.create(Team.prototype);
      else if (record.$class === undefined) target = {};
      else throw new Error(`Unknown saved class "${String(record.$class)}".`);
      resolved[id] = target;
      done[id] = true;
      decodeObject(record, target);
    } else {
      throw new Error("Save file contains a malformed node.");
    }
    return resolved[id];
  };

  return decode(encodedRoot);
}

// ---------------------------------------------------------------------------
// Structural comparison (used to prove a save loses nothing)
// ---------------------------------------------------------------------------

/**
 * Checks that two object graphs are isomorphic: same values, same prototypes, and the
 * same sharing/cycle structure. Returns the path of the first difference, or null.
 */
export function compareGraphs(a: unknown, b: unknown): string | null {
  const forward = new Map<object, object>();
  const backward = new Map<object, object>();

  const compare = (x: unknown, y: unknown, path: string): string | null => {
    if (x === undefined && y === undefined) return null;
    if (x === null || y === null || typeof x !== "object" || typeof y !== "object") {
      return Object.is(x, y) || (x === y) ? null : `${path}: ${String(x)} !== ${String(y)}`;
    }

    const mappedX = forward.get(x);
    const mappedY = backward.get(y);
    if (mappedX !== undefined || mappedY !== undefined) {
      return mappedX === y && mappedY === x ? null : `${path}: shared-reference structure differs`;
    }
    forward.set(x, y);
    backward.set(y, x);

    if (Object.getPrototypeOf(x) !== Object.getPrototypeOf(y)) return `${path}: different types`;

    if (Array.isArray(x)) {
      const arrayY = y as unknown[];
      if (x.length !== arrayY.length) return `${path}: array length ${x.length} !== ${arrayY.length}`;
      for (let i = 0; i < x.length; i++) {
        const diff = compare(x[i], arrayY[i], `${path}[${i}]`);
        if (diff) return diff;
      }
      return null;
    }

    const recordX = x as Record<string, unknown>;
    const recordY = y as Record<string, unknown>;
    const keysX = Object.keys(recordX).filter(key => recordX[key] !== undefined);
    const keysY = Object.keys(recordY).filter(key => recordY[key] !== undefined);
    if (keysX.length !== keysY.length) {
      const missing = keysX.find(key => !(key in recordY)) ?? keysY.find(key => !(key in recordX));
      return `${path}: property sets differ (${missing ?? "count"})`;
    }
    for (const key of keysX) {
      if (recordY[key] === undefined) return `${path}.${key}: missing after load`;
      const diff = compare(recordX[key], recordY[key], `${path}.${key}`);
      if (diff) return diff;
    }
    return null;
  };

  return compare(a, b, "game");
}

// ---------------------------------------------------------------------------
// Game <-> save file
// ---------------------------------------------------------------------------

function gameRoot(game: Game): GameRoot {
  return { season: game.season, managerTeam: game.managerTeam, godMode: game.godMode };
}

export function gameToSave(game: Game): SaveFile {
  const { root, nodes } = serializeGraph(gameRoot(game));
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    meta: {
      team: game.managerTeam.Team,
      teamID: game.managerTeam.ID,
      season: seasonDisplay(game.season.year),
      year: game.season.year,
      matchday: game.season.matchday,
      godMode: game.godMode,
      savedAt: new Date().toISOString()
    },
    root,
    nodes
  };
}

/** Throws a user-readable Error if `value` is not a loadable save file. */
export function parseSaveFile(value: unknown): SaveFile {
  const file = value as Partial<SaveFile> | null;
  if (!file || typeof file !== "object" || file.format !== SAVE_FORMAT) {
    throw new Error("This file is not a Soccer Season Simulator save.");
  }
  if (typeof file.version !== "number" || file.version > SAVE_VERSION) {
    throw new Error("This save was created by a newer version of the game and cannot be loaded.");
  }
  if (!file.meta || !Array.isArray(file.nodes) || file.root === undefined) {
    throw new Error("The save file is incomplete or corrupted.");
  }
  return file as SaveFile;
}

export function parseSaveText(text: string): SaveFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The file is not valid JSON, so it cannot be a game save.");
  }
  return parseSaveFile(parsed);
}

function validateRoot(root: unknown): GameRoot {
  const candidate = root as Partial<GameRoot> | null;
  const season = candidate?.season;
  const team = candidate?.managerTeam;
  const valid =
    !!season && !!team && team instanceof Team &&
    typeof season.year === "number" && typeof season.matchday === "number" &&
    !!season.leagueStates && ["1", "2", "3", "4", "5"].every(tier => !!season.leagueStates[tier]) &&
    !!season.cup && Array.isArray(season.archives) && Array.isArray(season.history) &&
    !!season.freeAgents && Array.isArray(season.freeAgents.available) && !!season.freeAgents.clubPlayers &&
    Array.isArray(season.freeAgents.retiredPlayers) &&
    typeof season.freeAgents.nextSeq === "number" &&
    !!season.international && !!season.international.nations && Array.isArray(season.international.windows) &&
    Array.isArray(season.international.rankingHistory) && !!season.international.nationsLeague &&
    !!season.international.nationsLeague.divisions && !!season.international.nationsLeague.pots &&
    Array.isArray(season.international.nationsLeague.editions) &&
    Array.isArray(team.seniorSquad) && Array.isArray(team.youthAcademySquad) &&
    Object.values(season.leagueStates).some(league => league.teams.includes(team));
  if (!valid) throw new Error("The save file is corrupted: the game data is missing or inconsistent.");
  return { season: season!, managerTeam: team!, godMode: candidate!.godMode === true };
}

/**
 * v2 -> v3: older saves have no team history. It is rebuilt from what the save does know:
 * the first progression year, who holds the player now, when a club signed them, when the
 * managed club signed a generated free agent (contract = signing year + 3), and the year they
 * were released. Dates inside a season (matchdays) that were never recorded are approximated.
 */
function migratePlayerHistories(season: Season, manager: Team): void {
  const userClub = { id: manager.ID, name: manager.Team };
  const fa = season.freeAgents;

  const stint = (
    club: { id: number; name: string } | null,
    startYear: number, startMatchday: number,
    endYear: number | null, endMatchday: number | null
  ): PlayerStint => ({
    teamID: club ? club.id : null,
    teamName: club ? club.name : FREE_AGENTS_LABEL,
    startYear, startMatchday, endYear, endMatchday
  });
  const firstYearOf = (player: Player) => player.progression?.[0]?.year ?? season.year;
  const isGeneratedFA = (player: Player) => String(player.id).startsWith("FA");

  const squadPlayers = [...(manager.seniorSquad ?? []), ...(manager.youthAcademySquad ?? [])];
  for (const player of squadPlayers) {
    if (Array.isArray(player.history)) continue;
    const first = firstYearOf(player);
    if (isGeneratedFA(player)) {
      // A generated free agent the managed club signed: contract expiry = signing year + 3.
      const signed = Math.max(first, (player.contractExpiry ?? first + 3) - 3);
      player.history = [stint(null, first, 0, signed, 0), stint(userClub, signed, 0, null, null)];
    } else {
      player.history = [stint(userClub, first, 0, null, null)];
    }
  }

  // Scouting candidates have no club until they are signed.
  for (const player of manager.scoutedPlayers ?? []) if (!Array.isArray(player.history)) player.history = [];
  for (const mission of manager.scoutingMissions ?? []) {
    for (const player of mission.candidates) if (!Array.isArray(player.history)) player.history = [];
  }

  for (const entry of fa.available) {
    const player = entry.player;
    if (Array.isArray(player.history)) continue;
    const first = firstYearOf(player);
    player.history = isGeneratedFA(player)
      ? [stint(null, first, 0, null, null)]
      : [stint(userClub, first, 0, entry.addedYear, 0), stint(null, entry.addedYear, 0, null, null)];
  }

  for (const [teamID, entries] of Object.entries(fa.clubPlayers)) {
    const club = { id: Number(teamID), name: TEAM_DIRECTORY.get(Number(teamID))?.name ?? `Club ${teamID}` };
    for (const entry of entries) {
      const player = entry.player;
      if (Array.isArray(player.history)) continue;
      const first = firstYearOf(player);
      const stints: PlayerStint[] = [];
      if (isGeneratedFA(player)) {
        stints.push(stint(null, first, 0, entry.signedYear, entry.signedMatchday));
      } else {
        stints.push(stint(userClub, first, 0, entry.signedYear, 0));
        stints.push(stint(null, entry.signedYear, 0, entry.signedYear, entry.signedMatchday));
      }
      stints.push(stint(club, entry.signedYear, entry.signedMatchday, null, null));
      player.history = stints;
    }
  }
}

export function gameFromSave(file: SaveFile): Game {
  let root: unknown;
  try {
    root = deserializeGraph(file.root, file.nodes);
  } catch (error) {
    throw new Error(`The save file could not be read: ${(error as Error).message}`);
  }
  // Migrate older saves to the current format before validating.
  const loadedSeason = (root as Partial<GameRoot> | null)?.season;
  if (loadedSeason && file.version < 2 && loadedSeason.freeAgents === undefined) {
    // v1 -> v2: introduce the free-agent pool (with a first batch for the current season).
    loadedSeason.freeAgents = createFreeAgentState();
    generateFreeAgents(loadedSeason);
  }
  if (loadedSeason?.freeAgents && !Array.isArray(loadedSeason.freeAgents.retiredPlayers)) {
    loadedSeason.freeAgents.retiredPlayers = [];
  }
  if (loadedSeason && file.version < 3) {
    migratePlayerHistories(loadedSeason, (root as Partial<GameRoot>).managerTeam as Team);
  }
  if (loadedSeason && file.version < 4) {
    // v3 -> v4: national teams start from nation_info.json, and no player has any caps yet.
    if (loadedSeason.international === undefined) {
      loadedSeason.international = createInternationalState();
      startWindowIfDue(loadedSeason);
    }
    const manager = (root as Partial<GameRoot>).managerTeam as Team;
    const everyone: Player[] = [
      ...collectAllPlayers(loadedSeason),
      ...(manager?.scoutedPlayers ?? []),
      ...(manager?.scoutingMissions ?? []).flatMap(mission => mission.candidates)
    ];
    for (const player of everyone) {
      if (typeof player.caps !== "number") player.caps = 0;
    }
  }
  if (loadedSeason?.international && loadedSeason.international.nationsLeague === undefined) {
    loadedSeason.international.nationsLeague = createInternationalState().nationsLeague;
  }
  if (loadedSeason && file.version < 6) {
    // v5 -> v6: nobody is shortlisted and unsigned scouting candidates are discarded, as before.
    const manager = (root as Partial<GameRoot>).managerTeam as Team;
    const everyone: Player[] = [
      ...collectAllPlayers(loadedSeason),
      ...(manager?.scoutedPlayers ?? []),
      ...(manager?.scoutingMissions ?? []).flatMap(mission => mission.candidates)
    ];
    for (const player of everyone) {
      if (typeof player.isShortlisted !== "boolean") player.isShortlisted = false;
    }
    if (loadedSeason.freeAgents && typeof loadedSeason.freeAgents.autoSendUnsignedScouts !== "boolean") {
      loadedSeason.freeAgents.autoSendUnsignedScouts = false;
    }
  }
  if (loadedSeason && file.version < 5) {
    // v4 -> v5: clubs gain a player-based overall bonus (and whole-number in-season overalls).
    refreshAllClubOveralls(loadedSeason);
  }
  if (loadedSeason && file.version < 7) {
    const manager = (root as Partial<GameRoot>).managerTeam as Team;
    const used = new Set<string>();
    const duplicated = new Set<string>();
    for (const player of collectSeasonPlayers(loadedSeason)) {
      const originalID = player.id;
      if (!used.has(originalID)) {
        used.add(originalID);
        continue;
      }
      duplicated.add(originalID);
      let suffix = 1;
      let repairedID = `${originalID}-r${suffix}`;
      while (used.has(repairedID)) repairedID = `${originalID}-r${++suffix}`;
      player.id = repairedID;
      used.add(repairedID);
    }

    for (const entries of Object.values(loadedSeason.freeAgents.clubPlayers)) {
      for (const entry of entries) {
        if (entry.source !== "regen" && entry.source !== "god-mode" && entry.source !== "free-agent") {
          entry.source = "free-agent";
        }
      }
    }

    if (duplicated.size > 0) {
      refreshStartingXI(manager);
      const openWindow = loadedSeason.international.windows.find(window => window.status === "scheduled");
      if (openWindow) {
        for (const code of Object.keys(openWindow.callUps)) {
          openWindow.callUps[code] = openWindow.callUps[code].filter(id => !duplicated.has(id));
        }
      }
    }
    refreshAllClubOveralls(loadedSeason);
  }
  if (loadedSeason && file.version < 8) {
    loadedSeason.explicitClubWorldCup = false;
    loadedSeason.continentalTournaments = createContinentalTournaments(loadedSeason.year);
    if (loadedSeason.matchday >= CONTINENTAL_TOURNAMENT_MATCHDAY) {
      simulateContinentalTournaments(loadedSeason.continentalTournaments, loadedSeason.matchday);
    } else if (loadedSeason.year >= CONTINENTAL_TOURNAMENT_START_YEAR + 1) {
      simulateContinentalTournaments(loadedSeason.continentalTournaments, CONTINENTAL_TOURNAMENT_MATCHDAY);
    }
    loadedSeason.clubWorldCup = createClubWorldCup(loadedSeason, loadedSeason.year);
    if (loadedSeason.clubWorldCup && loadedSeason.matchday >= 21) simulateClubWorldCup(loadedSeason);
  }
  if (loadedSeason && file.version < 9 && loadedSeason.continentalTournaments === undefined) {
    loadedSeason.continentalTournaments = createContinentalTournaments(loadedSeason.year);
    if (loadedSeason.matchday >= CONTINENTAL_TOURNAMENT_MATCHDAY) {
      simulateContinentalTournaments(loadedSeason.continentalTournaments, loadedSeason.matchday);
    }
  }
  if (loadedSeason && file.version === 9) {
    loadedSeason.continentalTournaments = createContinentalTournaments(loadedSeason.year);
    if (loadedSeason.matchday >= CONTINENTAL_TOURNAMENT_MATCHDAY) {
      simulateContinentalTournaments(loadedSeason.continentalTournaments, loadedSeason.matchday);
    }
  }
  if (loadedSeason && file.version < 11) {
    for (const tournament of Object.values(loadedSeason.continentalTournaments ?? {})) {
      const firstUnplayedRound = tournament.bracket.rounds.findIndex(
        (_, roundIndex) => CONTINENTAL_TOURNAMENT_MATCHDAY + roundIndex > loadedSeason.matchday
      );
      tournament.bracket.rounds.forEach((round, roundIndex) => {
        const roundMatchday = CONTINENTAL_TOURNAMENT_MATCHDAY + roundIndex;
        for (const match of round) {
          if (match.legs?.length === 2) {
            match.legs[0].matchday = roundMatchday;
            match.legs[1].matchday = roundMatchday;
          }
          if (firstUnplayedRound !== -1 && roundIndex >= firstUnplayedRound) {
            if (roundIndex > 0) {
              match.player1 = null;
              match.player2 = null;
            }
            match.winner = null;
            match.result = undefined;
            match.legs = undefined;
            match.tiebreak = undefined;
          }
        }
      });
      if (firstUnplayedRound !== -1) {
        tournament.bracket.activeRound = firstUnplayedRound;
        tournament.completed = false;
        tournament.winner = null;
        tournament.runnerUp = null;
      }
    }
    for (const archive of loadedSeason.archives) {
      for (const tournament of Object.values(archive.continentalTournaments ?? {})) {
        tournament.rounds.forEach((round, roundIndex) => {
          const roundMatchday = CONTINENTAL_TOURNAMENT_MATCHDAY + roundIndex;
          round.matchday = roundMatchday;
          for (const match of round.matches) {
            if (match.legMatchdays) match.legMatchdays = [roundMatchday, roundMatchday];
          }
        });
      }
    }
  }
  if (loadedSeason && file.version < 13) {
    const manager = (root as Partial<GameRoot>).managerTeam as Team;
    loadedSeason.managerTeam = manager;
    const retiredPlayers = loadedSeason.freeAgents.retiredPlayers;
    for (const player of retiredPlayers) {
      player.isRetired = true;
      player.retirementYear ??= loadedSeason.year;
    }
    for (const player of collectSeasonPlayers(loadedSeason)) {
      if (player.isRetired !== true) player.isRetired = false;
      player.retirementYear ??= null;
    }
    schedulePlayerRetirements(loadedSeason);
  }
  const { season, managerTeam, godMode } = validateRoot(root);
  return { season, managerTeam, godMode, version: 0, liveCache: null };
}

/**
 * Proves a save is lossless: writes the game exactly as it would be saved, reads it back
 * through JSON, and checks the result is identical to the live game. Returns an error
 * description, or null when the round trip is exact.
 */
export function verifySave(game: Game, file: SaveFile): string | null {
  try {
    const reloaded = gameFromSave(parseSaveText(JSON.stringify(file)));
    return compareGraphs(gameRoot(game), gameRoot(reloaded));
  } catch (error) {
    return (error as Error).message;
  }
}

export function saveFileName(game: Game): string {
  const team = game.managerTeam.Team.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `soccer-save_${team}_${seasonDisplay(game.season.year)}_md${game.season.matchday}.json`;
}
