import windowsRaw from "./data/international_windows.json";
import importanceRaw from "./data/match_importance.json";
import { nationInfo, getNationName } from "./nations";
import { simulateMatch } from "./matchEngine";
import { SEASON_END_MATCHDAY } from "./constants";
import { STAR_PLAYER_FACTOR, starBonus } from "./squadStrength";
import { POSITION_GROUP } from "./formation";
import {
  completeNationsLeagueEditions, createNationsLeagueState, getInternationalWindowType,
  getNationConfederation, getNationsLeagueRoundsForWindow, prepareNationsLeagueDraws
} from "./nationsLeague";
import type { NationsLeagueState } from "./nationsLeague";
import type { Season } from "./season";
import type { Team } from "./team";
import type { Player } from "./types";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export interface WindowDef {
  id: string;
  label: string;
  afterMatchday: number;
  postSeason?: boolean;
}

export const WINDOW_DEFS: WindowDef[] = (windowsRaw as { windows: WindowDef[] }).windows;

/** FIFA-style match importance coefficients (I in the ranking formula). */
export const MATCH_IMPORTANCE = importanceRaw as Record<string, number>;
export type MatchKind = keyof typeof importanceRaw;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface NationTeam {
  code: string;
  /** The nation's own strength (from nation_info.json). */
  baseOverall: number;
  /** Base overall plus the contribution of exceptional called-up players (latest window). */
  actualOverall: number;
  /** FIFA ranking points. */
  points: number;
}

export interface InternationalMatch {
  home: string;
  away: string;
  kind: string;
  /** null until the window is simulated. */
  homeGoals: number | null;
  awayGoals: number | null;
  homeChange: number | null;
  awayChange: number | null;
  nationsLeagueId?: string;
  nationsLeagueConfederation?: string;
  nationsLeagueDivision?: string;
  nationsLeagueGroup?: string;
  nationsLeagueRound?: number;
  windowYear?: number;
  windowId?: string;
}

export interface InternationalRound {
  matches: InternationalMatch[];
  kind?: "friendly" | "nationsLeague";
  label?: string;
  /** The one nation without a match in this set of fixtures (there is an odd number of nations). */
  leftOut: string | null;
}

export interface WindowRecord {
  year: number;
  windowId: string;
  label: string;
  afterMatchday: number;
  status: "scheduled" | "played";
  rounds: InternationalRound[];
  /** Nation code -> IDs of the players called up for this window. */
  callUps: Record<string, string[]>;
}

export interface RankingSnapshot {
  year: number;
  windowId: string;
  label: string;
  /** Nations in rank order (index 0 = rank 1) with their points after the window. */
  ranks: [string, number][];
}

export interface InternationalState {
  nations: Record<string, NationTeam>;
  windows: WindowRecord[];
  rankingHistory: RankingSnapshot[];
  nationsLeague: NationsLeagueState;
  /** The nation left out of the most recent set of fixtures (never left out twice in a row). */
  lastLeftOut: string | null;
  /** When true, windows must be simulated explicitly instead of automatically. */
  explicitWindows: boolean;
}

export function createInternationalState(): InternationalState {
  const nations: Record<string, NationTeam> = {};
  for (const info of Object.values(nationInfo)) {
    nations[info.threeLetterCode] = {
      code: info.threeLetterCode,
      baseOverall: info.teamOverall,
      actualOverall: info.teamOverall,
      points: info.rankingPts
    };
  }
  return {
    nations,
    windows: [],
    rankingHistory: [],
    nationsLeague: createNationsLeagueState(),
    lastLeftOut: null,
    explicitWindows: false
  };
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

// ---------------------------------------------------------------------------
// Rankings (FIFA "SUM" Elo method)
// ---------------------------------------------------------------------------

/** We = 1 / (10^(-dr/600) + 1), where dr is the rating difference. */
export function expectedResult(pointDifference: number): number {
  return 1 / (Math.pow(10, -pointDifference / 600) + 1);
}

export type MatchOutcome = "win" | "draw" | "loss";

/** W: 1 win, 0.5 draw, 0 loss. Matches settled on penalties count 0.75 for the winner and 0.5 for the loser. */
export function resultValue(outcome: MatchOutcome, shootout = false): number {
  if (outcome === "draw") return 0.5;
  if (shootout) return outcome === "win" ? 0.75 : 0.5;
  return outcome === "win" ? 1 : 0;
}

/**
 * P = P_before + I * (W - We). Returns the change for one team.
 * `noPointLoss` implements the rule that teams cannot lose points in World Cup knockout matches.
 */
export function rankingPointChange(
  points: number,
  opponentPoints: number,
  importance: number,
  outcome: MatchOutcome,
  options: { shootout?: boolean; noPointLoss?: boolean } = {}
): number {
  const expected = expectedResult(points - opponentPoints);
  const change = importance * (resultValue(outcome, options.shootout) - expected);
  return options.noPointLoss && change < 0 ? 0 : change;
}

export interface RankRow {
  code: string;
  rank: number;
  points: number;
}

export function computeRankings(state: InternationalState): RankRow[] {
  return Object.values(state.nations)
    .sort((a, b) => b.points - a.points || getNationName(a.code).localeCompare(getNationName(b.code)))
    .map((nation, index) => ({ code: nation.code, rank: index + 1, points: nation.points }));
}

export interface OverallRankRow {
  code: string;
  rank: number;
  overall: number;
  baseOverall: number;
}

/** Nations ranked by their current (actual) squad overall. */
export function computeOverallRankings(state: InternationalState): OverallRankRow[] {
  return Object.values(state.nations)
    .sort((a, b) =>
      b.actualOverall - a.actualOverall ||
      b.points - a.points ||
      getNationName(a.code).localeCompare(getNationName(b.code)))
    .map((nation, index) => ({
      code: nation.code,
      rank: index + 1,
      overall: nation.actualOverall,
      baseOverall: nation.baseOverall
    }));
}

// ---------------------------------------------------------------------------
// Call-ups and caps
// ---------------------------------------------------------------------------

/** Spread of the call-up distribution: the further below the nation's overall, the less likely. */
export const CALL_UP_SIGMA = 7;
export { STAR_PLAYER_FACTOR };
export const NATIONAL_SQUAD_QUOTAS: Record<"GK" | "DEF" | "MID" | "FWD", number> = {
  GK: 3, DEF: 8, MID: 8, FWD: 7
};

export function callUpChance(playerOverall: number, nationBaseOverall: number): number {
  if (playerOverall > nationBaseOverall) return 1;
  const gap = nationBaseOverall - playerOverall;
  return Math.exp(-0.5 * (gap / CALL_UP_SIGMA) ** 2);
}

export function capChance(playerOverall: number, nationBaseOverall: number): number {
  return playerOverall >= nationBaseOverall ? 0.85 : 0.5;
}

/** Every player in the game world (managed squad & academy, free agents, players signed by clubs). */
export function collectAllPlayers(season: Season): Player[] {
  const players: Player[] = [];
  const team = season.managerTeam;
  if (team) players.push(...(team.seniorSquad ?? []), ...(team.youthAcademySquad ?? []));
  players.push(...season.freeAgents.available.map(entry => entry.player));
  for (const entries of Object.values(season.freeAgents.clubPlayers)) {
    players.push(...entries.map(entry => entry.player));
  }
  return players;
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

function gaussian(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Standard deviation of the random noise added to overalls when pairing, keeping opponents similar but varied. */
const PAIRING_NOISE = 2.5;

const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Removes rematches (pairs in `avoid`) by swapping partners with the closest-rated other pair,
 * so opponents stay similar in overall.
 */
function repairRematches(pairs: [string, string][], avoid: Set<string>, overalls: Record<string, number>): void {
  const mid = (pair: [string, string]) => (overalls[pair[0]] + overalls[pair[1]]) / 2;
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let i = 0; i < pairs.length; i++) {
      if (!avoid.has(pairKey(pairs[i][0], pairs[i][1]))) continue;
      const [a, b] = pairs[i];
      const others = pairs
        .map((pair, index) => ({ pair, index }))
        .filter(item => item.index !== i)
        .sort((x, y) => Math.abs(mid(x.pair) - mid(pairs[i])) - Math.abs(mid(y.pair) - mid(pairs[i])));
      for (const { pair: [c, d], index } of others) {
        const options: [[string, string], [string, string]][] = [[[a, c], [b, d]], [[a, d], [b, c]]];
        const ok = options.find(([p1, p2]) =>
          !avoid.has(pairKey(p1[0], p1[1])) && !avoid.has(pairKey(p2[0], p2[1])));
        if (ok) {
          pairs[i] = ok[0];
          pairs[index] = ok[1];
          changed = true;
          break;
        }
      }
    }
    if (!changed) break;
  }
}

/**
 * One set of friendlies: nations are paired with similar-overall opponents (a little noise keeps
 * pairings varied). With an odd number of nations one is left out, never the nation that was left
 * out of the previous set. Rematches of pairs in `avoid` are avoided where possible.
 */
function scheduleFriendlies(
  state: InternationalState,
  overalls: Record<string, number>,
  avoid: Set<string>,
  eligibleCodes: string[]
): InternationalRound {
  const codes = eligibleCodes;
  let leftOut: string | null = null;
  let pool = codes;

  if (codes.length % 2 === 1) {
    const candidates = codes.filter(code => code !== state.lastLeftOut);
    leftOut = candidates[Math.floor(Math.random() * candidates.length)];
    pool = codes.filter(code => code !== leftOut);
  }

  let best: [string, string][] = [];
  let bestConflicts = Infinity;
  for (let attempt = 0; attempt < 40 && bestConflicts > 0; attempt++) {
    const ordered = pool
      .map(code => ({ code, key: overalls[code] + gaussian() * PAIRING_NOISE }))
      .sort((a, b) => b.key - a.key)
      .map(item => item.code);
    const pairs: [string, string][] = [];
    let conflicts = 0;
    for (let i = 0; i + 1 < ordered.length; i += 2) {
      const pair: [string, string] = Math.random() < 0.5 ? [ordered[i], ordered[i + 1]] : [ordered[i + 1], ordered[i]];
      if (avoid.has(pairKey(pair[0], pair[1]))) conflicts++;
      pairs.push(pair);
    }
    if (conflicts < bestConflicts) {
      best = pairs;
      bestConflicts = conflicts;
    }
  }

  repairRematches(best, avoid, overalls);

  state.lastLeftOut = leftOut;
  return {
    kind: "friendly",
    leftOut,
    matches: best.map(([home, away]) => ({
      home, away, kind: "friendly", homeGoals: null, awayGoals: null, homeChange: null, awayChange: null
    }))
  };
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

export const FRIENDLY_SETS_PER_WINDOW = 2;

export function getActiveWindow(state: InternationalState): WindowRecord | null {
  return state.windows.find(window => window.status === "scheduled") ?? null;
}

function hasWindowRecord(state: InternationalState, year: number, windowId: string): boolean {
  return state.windows.some(window => window.year === year && window.windowId === windowId);
}

/** The window that should start now (matchday reached / season concluded), if any. */
export function findDueWindowDef(season: Season): WindowDef | null {
  const state = season.international;
  for (const def of WINDOW_DEFS) {
    if (hasWindowRecord(state, season.year, def.id)) continue;
    const due = def.postSeason
      ? season.matchday >= SEASON_END_MATCHDAY && season.promotionPlayoffs !== null
      : season.matchday === def.afterMatchday;
    if (due) return def;
  }
  return null;
}

/**
 * Opens an international window if one is due: players are called up and the fixtures are drawn.
 * Matches are played later by simulateInternationalWindow.
 */
export function startWindowIfDue(season: Season): WindowRecord | null {
  const state = season.international;
  const active = getActiveWindow(state);
  if (active) return active;
  const def = findDueWindowDef(season);
  if (!def) return null;

  prepareNationsLeagueDraws(state.nationsLeague, season.year, def.id);

  // Players first decide whether they are willing, then compete for their positional quota.
  const callUps: Record<string, string[]> = {};
  const calledPlayers: Record<string, Player[]> = {};
  for (const player of collectAllPlayers(season)) {
    const nation = state.nations[player.primaryNationality];
    if (!nation) continue;
    if (Math.random() < callUpChance(player.overall, nation.baseOverall)) {
      (calledPlayers[nation.code] ??= []).push(player);
    }
  }

  for (const nation of Object.values(state.nations)) {
    const willing = calledPlayers[nation.code] ?? [];
    const selected: Player[] = [];
    for (const [group, quota] of Object.entries(NATIONAL_SQUAD_QUOTAS) as ["GK" | "DEF" | "MID" | "FWD", number][]) {
      selected.push(...willing
        .filter(player => POSITION_GROUP[player.position] === group)
        .sort((a, b) => b.overall - a.overall || b.potential - a.potential || a.id.localeCompare(b.id))
        .slice(0, quota));
    }
    calledPlayers[nation.code] = selected;
    if (selected.length > 0) callUps[nation.code] = selected.map(player => player.id);
  }

  // Actual overall uses the same positional XI selection as non-managed clubs.
  const overalls: Record<string, number> = {};
  for (const nation of Object.values(state.nations)) {
    const bonus = starBonus(nation.baseOverall, calledPlayers[nation.code] ?? []);
    nation.actualOverall = Math.round(nation.baseOverall + bonus);
    overalls[nation.code] = nation.actualOverall;
  }

  // Confederations use the window type assigned to this position in the four-year cycle.
  const rounds: InternationalRound[] = [];
  const played = new Set<string>();
  const friendlyNations = Object.keys(state.nations).filter(code =>
    getInternationalWindowType(getNationConfederation(code), season.year, def.id) === "FR"
  );
  if (friendlyNations.length > 1) {
    for (let i = 0; i < FRIENDLY_SETS_PER_WINDOW; i++) {
      const round = scheduleFriendlies(state, overalls, played, friendlyNations);
      round.label = `Friendlies · Set ${i + 1}`;
      round.matches.forEach(match => played.add(pairKey(match.home, match.away)));
      rounds.push(round);
    }
  }

  const nationsLeagueRounds = new Map<string, InternationalRound>();
  for (const confederation of Object.keys(state.nationsLeague.divisions)) {
    const scheduled = getNationsLeagueRoundsForWindow(
      state.nationsLeague,
      confederation,
      season.year,
      def.id
    );
    if (!scheduled) continue;
    for (const item of scheduled.rounds) {
      const round = nationsLeagueRounds.get(item.label) ?? {
        kind: "nationsLeague",
        label: item.label,
        matches: [],
        leftOut: null
      };
      round.matches.push(...item.matches);
      nationsLeagueRounds.set(item.label, round);
    }
  }
  rounds.push(...nationsLeagueRounds.values());

  const record: WindowRecord = {
    year: season.year,
    windowId: def.id,
    label: def.label,
    afterMatchday: def.afterMatchday,
    status: "scheduled",
    rounds,
    callUps
  };
  state.windows.push(record);
  return record;
}

/** Plays every match of the open window, updating rankings after each one and awarding caps. */
export function simulateInternationalWindow(season: Season): WindowRecord | null {
  const state = season.international;
  const window = getActiveWindow(state);
  if (!window) return null;

  const playersByID = new Map<string, Player>();
  for (const player of collectAllPlayers(season)) playersByID.set(player.id, player);

  const awardCaps = (code: string): void => {
    const nation = state.nations[code];
    for (const id of window.callUps[code] ?? []) {
      const player = playersByID.get(id);
      if (!player) continue;
      if (Math.random() < capChance(player.overall, nation.baseOverall)) {
        player.caps = (player.caps ?? 0) + 1;
      }
    }
  };

  for (const round of window.rounds) {
    for (const match of round.matches) {
      const home = state.nations[match.home];
      const away = state.nations[match.away];

      // The match engine reads only `Overall`, so lightweight stand-ins are enough.
      const homeTeam = { ID: 0, Team: home.code, Overall: home.actualOverall } as unknown as Team;
      const awayTeam = { ID: 0, Team: away.code, Overall: away.actualOverall } as unknown as Team;
      const result = simulateMatch(homeTeam, awayTeam, false, "LEAGUE");
      const homeGoals = result.homeGoalInfo.homeGoals;
      const awayGoals = result.awayGoalInfo.awayGoals;

      const importance = MATCH_IMPORTANCE[match.kind];
      const homeOutcome: MatchOutcome = homeGoals > awayGoals ? "win" : homeGoals < awayGoals ? "loss" : "draw";
      const awayOutcome: MatchOutcome = homeOutcome === "win" ? "loss" : homeOutcome === "loss" ? "win" : "draw";
      const homeChange = rankingPointChange(home.points, away.points, importance, homeOutcome);
      const awayChange = rankingPointChange(away.points, home.points, importance, awayOutcome);

      home.points = round2(home.points + homeChange);
      away.points = round2(away.points + awayChange);
      match.homeGoals = homeGoals;
      match.awayGoals = awayGoals;
      match.homeChange = round2(homeChange);
      match.awayChange = round2(awayChange);

      awardCaps(match.home);
      awardCaps(match.away);
    }
  }

  window.status = "played";
  completeNationsLeagueEditions(state.nationsLeague);
  state.rankingHistory.push({
    year: window.year,
    windowId: window.windowId,
    label: window.label,
    ranks: computeRankings(state).map(row => [row.code, row.points] as [string, number])
  });
  return window;
}

/** True while a window is open and waiting to be simulated. */
export function hasPendingWindow(season: Season): boolean {
  return getActiveWindow(season.international) !== null;
}

/**
 * Opens (if due) and plays a window automatically, unless windows are set to be simulated explicitly.
 * Returns true if a window was simulated.
 */
export function autoSimulateWindowIfDue(season: Season): boolean {
  startWindowIfDue(season);
  if (season.international.explicitWindows || !hasPendingWindow(season)) return false;
  simulateInternationalWindow(season);
  return true;
}

// ---------------------------------------------------------------------------
// Per-nation views
// ---------------------------------------------------------------------------

/** The nation a called-up player is away with (only while a window is open). */
export function getCallUpNation(state: InternationalState, playerID: string): string | null {
  const window = getActiveWindow(state);
  if (!window) return null;
  for (const [code, ids] of Object.entries(window.callUps)) {
    if (ids.includes(playerID)) return code;
  }
  return null;
}

export interface NationMatchRow {
  year: number;
  windowId: string;
  windowLabel: string;
  opponent: string;
  home: boolean;
  goalsFor: number;
  goalsAgainst: number;
  outcome: MatchOutcome;
  pointsChange: number;
  kind: string;
}

/** Played international matches for a nation, oldest first. */
export function getNationMatches(state: InternationalState, code: string): NationMatchRow[] {
  const rows: NationMatchRow[] = [];
  for (const window of state.windows) {
    if (window.status !== "played") continue;
    for (const round of window.rounds) {
      for (const match of round.matches) {
        if (match.home !== code && match.away !== code) continue;
        if (match.homeGoals === null || match.awayGoals === null) continue;
        const isHome = match.home === code;
        const goalsFor = isHome ? match.homeGoals : match.awayGoals;
        const goalsAgainst = isHome ? match.awayGoals : match.homeGoals;
        rows.push({
          year: window.year,
          windowId: window.windowId,
          windowLabel: window.label,
          opponent: isHome ? match.away : match.home,
          home: isHome,
          goalsFor,
          goalsAgainst,
          outcome: goalsFor > goalsAgainst ? "win" : goalsFor < goalsAgainst ? "loss" : "draw",
          pointsChange: (isHome ? match.homeChange : match.awayChange) ?? 0,
          kind: match.kind
        });
      }
    }
  }
  return rows;
}

export interface NationRankingEntry {
  year: number;
  windowId: string;
  label: string;
  rank: number;
  points: number;
}

/** Ranking after each completed window (oldest first). */
export function getNationRankingHistory(state: InternationalState, code: string): NationRankingEntry[] {
  const entries: NationRankingEntry[] = [];
  for (const snapshot of state.rankingHistory) {
    const index = snapshot.ranks.findIndex(([nation]) => nation === code);
    if (index < 0) continue;
    entries.push({
      year: snapshot.year,
      windowId: snapshot.windowId,
      label: snapshot.label,
      rank: index + 1,
      points: snapshot.ranks[index][1]
    });
  }
  return entries;
}
