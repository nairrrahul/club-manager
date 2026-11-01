import windowsRaw from "../data/international_windows.json";
import importanceRaw from "../data/match_importance.json";
import { nationInfo, getNationName } from "../nations";
import { parseKOMatchWinner, simulateMatch, simulatePenaltyShootoutOnly } from "../matchEngine";
import { SEASON_END_MATCHDAY, SEASON_START_YEAR } from "../constants";
import { STAR_PLAYER_FACTOR, starBonus } from "../squadStrength";
import { POSITION_GROUP } from "../formation";
import {
  completeNationsLeagueEditions, createNationsLeagueState,
  getNationConfederation, getNationsLeagueRoundsForWindow, prepareNationsLeagueDraws
} from "./nationsLeague";
import {
  beginAfconQualifyingMainRounds, completeAfconMainQualifiers, completeAfconPreliminary,
  createAfconQualifierEdition, createAfconState, findAfconQualifierForWindow, getAFCONTournament,
  getAfconPreliminaryRounds, getAfconQualifier, getAfconTournamentRounds, getAfconWindowType, resolveAfconPreliminaryTie,
  setAfconKnockoutWinner, startAfconRoundOf16, advanceAfconKnockoutRound
} from "./afcon";
import type { AfconState } from "./afcon";
import {
  completeAfcCupMainQualifiers, completeAfcCupPreliminary, createAfcCupQualifierEdition,
  createAfcCupState, findAfcCupQualifier, getAfcCupMainRounds, getAfcCupPreliminaryRounds,
  getAfcCupQualifier, getAfcCupTournament, getAfcCupTournamentRounds, getAfcCupWindowType,
  resolveAfcCupPreliminaryTie, setAfcCupKnockoutWinner, startAfcCupRoundOf16, advanceAfcCupKnockoutRound
} from "./afcCup";
import type { AfcCupState } from "./afcCup";
import type { NationsLeagueState } from "./nationsLeague";
import {
  completeGoldCupPlayoff, createGoldCupEdition, createGoldCupPlayoffEdition,
  createGoldCupState, findLatestGoldCupPlayoff, getGoldCupPlayoff,
  getGoldCupWindowType, resolveGoldCupPlayoffTie
} from "./goldCup";
import type { GoldCupState } from "./goldCup";
import {
  advanceInternationalCupRound, setInternationalCupKnockoutWinner,
  getInternationalWindowType
} from "./internationalCompetitionsUtils";
import type { InternationalCompetitionEdition } from "./internationalCompetitionsUtils";
import {
  createCopaAmericaEdition, createCopaAmericaState
} from "./copaAmerica";
import type { CopaAmericaState } from "./copaAmerica";
import type { Season } from "../season";
import type { Team } from "../team";
import type { Player } from "../types";

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

interface LocatedWindow {
  year: number;
  def: WindowDef;
  offset: number;
}

function findUpcomingWindow(
  year: number,
  windowId: string,
  matches: (year: number, def: WindowDef) => boolean
): LocatedWindow | null {
  const currentIndex = WINDOW_DEFS.findIndex(def => def.id === windowId);
  if (currentIndex === -1) throw new Error(`Unknown international window ID "${windowId}".`);

  for (let offset = 1; offset <= WINDOW_DEFS.length * 4; offset++) {
    const absoluteIndex = (year - SEASON_START_YEAR) * WINDOW_DEFS.length + currentIndex + offset;
    const candidateYear = SEASON_START_YEAR + Math.floor(absoluteIndex / WINDOW_DEFS.length);
    const candidateDef = WINDOW_DEFS[absoluteIndex % WINDOW_DEFS.length];
    if (matches(candidateYear, candidateDef)) return { year: candidateYear, def: candidateDef, offset };
  }
  return null;
}

function createCupGroupRounds(
  edition: InternationalCompetitionEdition,
  competition: "goldCup" | "copaAmerica"
): InternationalRound[] {
  return [0, 1, 2].map(roundIndex => ({
    kind: competition,
    label: `${competition === "goldCup" ? "Gold Cup" : "Copa América"} · Group stage · Matchday ${roundIndex + 1}`,
    leftOut: null,
    matches: edition.groups.flatMap(group => group.matches[roundIndex])
  }));
}

function drawGoldCupAfterPlayoff(
  state: InternationalState,
  playoffId: string,
  year: number,
  windowId: string
): void {
  const playoff = getGoldCupPlayoff(state.goldCup, playoffId);
  const tournamentWindow = findUpcomingWindow(year, windowId, (candidateYear, candidateDef) =>
    getGoldCupWindowType(candidateYear, candidateDef.id) === "GC"
  );
  if (!tournamentWindow) throw new Error(`No Gold Cup tournament window follows playoff "${playoffId}".`);

  const worldRanks = Object.fromEntries(computeRankings(state).map(row => [row.code, row.rank]));
  createGoldCupEdition(
    state.goldCup,
    playoffId,
    playoff.directQualifiers,
    tournamentWindow.year,
    tournamentWindow.def.id,
    tournamentWindow.def.afterMatchday,
    worldRanks
  );
}

function drawCopaAmericaIfDue(state: InternationalState, year: number, windowId: string): void {
  const tournamentWindow = findUpcomingWindow(year, windowId, (candidateYear, candidateDef) =>
    getInternationalWindowType("CONMEBOL", candidateYear, candidateDef.id) === "COPA"
  );
  if (!tournamentWindow || tournamentWindow.offset !== 2) return;
  if (state.copaAmerica.editions.some(edition =>
    edition.year === tournamentWindow.year && edition.windowId === tournamentWindow.def.id
  )) return;

  const worldRanks = Object.fromEntries(computeRankings(state).map(row => [row.code, row.rank]));
  createCopaAmericaEdition(
    state.copaAmerica,
    state.goldCup,
    tournamentWindow.year,
    tournamentWindow.def.id,
    tournamentWindow.def.afterMatchday,
    worldRanks
  );
}

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
  windowMatchday?: number;
  goldCupPlayoffId?: string;
  goldCupTieId?: string;
  goldCupLeg?: 1 | 2;
  goldCupEditionId?: string;
  goldCupStage?: "group" | "knockout";
  goldCupGroup?: string;
  goldCupRound?: number;
  goldCupKnockoutMatchId?: string;
  goldCupWinner?: string;
  copaAmericaEditionId?: string;
  copaAmericaStage?: "group" | "knockout";
  copaAmericaGroup?: string;
  copaAmericaRound?: number;
  copaAmericaKnockoutMatchId?: string;
  copaAmericaWinner?: string;
  afconEditionId?: string;
  afconQualifierId?: string;
  afconTieId?: string;
  afconStage?: "preliminary" | "main" | "group" | "knockout";
  afconGroup?: string;
  afconRound?: number;
  afconLeg?: 1 | 2;
  afconKnockoutMatchId?: string;
  afconWinner?: string;
  afcCupEditionId?: string;
  afcCupQualifierId?: string;
  afcCupTieId?: string;
  afcCupStage?: "preliminary" | "main" | "group" | "knockout";
  afcCupGroup?: string;
  afcCupRound?: number;
  afcCupLeg?: 1 | 2;
  afcCupKnockoutMatchId?: string;
  afcCupWinner?: string;
  homePenalties?: string[];
  awayPenalties?: string[];
}

export interface InternationalRound {
  matches: InternationalMatch[];
  kind?: "friendly" | "nationsLeague" | "goldCupPlayoff" | "goldCup" | "copaAmerica" | "afconQualifier" | "afcon" | "afcCupQualifier" | "afcCup";
  label?: string;
  afconQualifierId?: string;
  afconStage?: "preliminary" | "main" | "tournamentGroup" | "tournamentKnockout";
  afconRound?: number;
  afcCupQualifierId?: string;
  afcCupStage?: "preliminary" | "main" | "group" | "knockout";
  afcCupRound?: number;
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
  goldCup: GoldCupState;
  copaAmerica: CopaAmericaState;
  afcon: AfconState;
  afcCup: AfcCupState;
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
    goldCup: createGoldCupState(),
    copaAmerica: createCopaAmericaState(),
    afcon: createAfconState(),
    afcCup: createAfcCupState(),
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

function latestCompletedConcacafNationsLeague(state: InternationalState): NationsLeagueState["editions"][number] {
  const edition = [...state.nationsLeague.editions]
    .filter(candidate => candidate.confederation === "CONCACAF" && candidate.status === "complete")
    .sort((a, b) => b.startWindowIndex - a.startWindowIndex)[0];
  if (!edition) throw new Error("A completed CONCACAF Nations League edition is required for Gold Cup qualification.");
  return edition;
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
  let copaAmericaTeams: string[] = [];
  let afconTeams: string[] = [];
  let afcCupTeams: string[] = [];
  const afconWindowType = getAfconWindowType(season.year, def.id);
  const afconSuffix = afconWindowType?.slice(-1) as "1" | "2" | undefined;
  const afcCupWindowType = getAfcCupWindowType(season.year, def.id);
  const goldCupWindowType = getGoldCupWindowType(season.year, def.id);
  let goldCupPlayoff: ReturnType<typeof createGoldCupPlayoffEdition> | null = null;
  if (goldCupWindowType === "GCPO") {
    const nationsLeagueEdition = latestCompletedConcacafNationsLeague(state);
    const worldRanks = Object.fromEntries(computeRankings(state).map(row => [row.code, row.rank]));
    goldCupPlayoff = createGoldCupPlayoffEdition(
      nationsLeagueEdition,
      season.year,
      def.id,
      def.afterMatchday,
      worldRanks
    );
  }
  if (afconWindowType?.startsWith("CAFQP") && afconSuffix) {
    let qualifier = findAfconQualifierForWindow(state.afcon, season.year, afconSuffix);
    if (!qualifier) {
      const worldRanks = Object.fromEntries(computeRankings(state).map(row => [row.code, row.rank]));
      qualifier = createAfconQualifierEdition(
        state.afcon,
        season.year,
        afconSuffix,
        def.id,
        def.afterMatchday,
        worldRanks
      );
    }
    rounds.push(...getAfconPreliminaryRounds(qualifier));
    afconTeams = qualifier.preliminaryTeams;
  } else if (afconWindowType?.startsWith("CAFQM") && afconSuffix) {
    const qualifier = findAfconQualifierForWindow(state.afcon, season.year, afconSuffix);
    if (!qualifier) throw new Error(`AFCON ${afconSuffix} qualifying has not started.`);
    const mainRounds = beginAfconQualifyingMainRounds(
      qualifier,
      season.year,
      def.id,
      def.afterMatchday
    );
    rounds.push(...mainRounds);
    afconTeams = qualifier.mainGroups?.flatMap(group => group.teams) ?? [];
  } else if (afconWindowType?.startsWith("AFCON") && afconSuffix) {
    const edition = getAFCONTournament(state.afcon, season.year, afconSuffix);
    if (!edition) throw new Error(`AFCON ${afconSuffix} edition has not been drawn.`);
    afconTeams = edition.teams;
    rounds.push(...getAfconTournamentRounds(edition));
  }
  if (afcCupWindowType === "AFCQP") {
    let qualifier = findAfcCupQualifier(state.afcCup, season.year);
    if (!qualifier) {
      qualifier = createAfcCupQualifierEdition(
        state.afcCup,
        season.year,
        def.id,
        def.afterMatchday,
        Object.fromEntries(computeRankings(state).map(row => [row.code, row.rank]))
      );
    }
    rounds.push(...getAfcCupPreliminaryRounds(qualifier));
    afcCupTeams = qualifier.preliminaryTeams;
  } else if (afcCupWindowType === "AFCQM") {
    const qualifier = findAfcCupQualifier(state.afcCup, season.year);
    if (!qualifier) throw new Error("AFC Cup qualifying has not started.");
    rounds.push(...getAfcCupMainRounds(qualifier, season.year, def.id, def.afterMatchday));
    afcCupTeams = qualifier.mainGroups?.flatMap(group => group.teams) ?? [];
  } else if (afcCupWindowType === "AFCCUP") {
    const edition = getAfcCupTournament(state.afcCup, season.year);
    if (!edition) throw new Error("AFC Cup edition has not been drawn.");
    afcCupTeams = edition.teams;
    rounds.push(...getAfcCupTournamentRounds(edition));
  }
  if (getInternationalWindowType("CONMEBOL", season.year, def.id) === "COPA") {
    let edition = state.copaAmerica.editions.find(item => item.year === season.year && item.windowId === def.id);
    if (!edition) {
      const worldRanks = Object.fromEntries(computeRankings(state).map(row => [row.code, row.rank]));
      edition = createCopaAmericaEdition(
        state.copaAmerica,
        state.goldCup,
        season.year,
        def.id,
        def.afterMatchday,
        worldRanks
      ).edition;
    }
    copaAmericaTeams = edition.teams;
    rounds.push(...createCupGroupRounds(edition, "copaAmerica"));
  }
  const friendlyNations = Object.keys(state.nations).filter(code =>
    (getInternationalWindowType(getNationConfederation(code), season.year, def.id) === "FR" ||
      (afconWindowType !== null && getNationConfederation(code) === "CAF") ||
      (afcCupWindowType !== null && getNationConfederation(code) === "AFC") ||
      (goldCupPlayoff !== null &&
        getNationConfederation(code) === "CONCACAF" &&
        !goldCupPlayoff.edition.entrants.includes(code))) &&
    !copaAmericaTeams.includes(code) &&
    !afconTeams.includes(code) &&
    !afcCupTeams.includes(code)
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

  if (goldCupPlayoff) {
    state.goldCup.playoffEditions.push(goldCupPlayoff.edition);
    rounds.push(...goldCupPlayoff.rounds);
  } else if (goldCupWindowType === "GC") {
    let edition = state.goldCup.editions.find(item => item.year === season.year && item.windowId === def.id);
    if (!edition) {
      const playoff = findLatestGoldCupPlayoff(state.goldCup);
      if (!playoff) throw new Error("A completed Gold Cup playoff is required before the Gold Cup draw.");
      const worldRanks = Object.fromEntries(computeRankings(state).map(row => [row.code, row.rank]));
      edition = createGoldCupEdition(
        state.goldCup,
        playoff.id,
        playoff.directQualifiers,
        season.year,
        def.id,
        def.afterMatchday,
        worldRanks
      ).edition;
    }
    rounds.push(...createCupGroupRounds(edition, "goldCup"));
  }

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

  for (let roundIndex = 0; roundIndex < window.rounds.length; roundIndex++) {
    const round = window.rounds[roundIndex];
    for (const match of round.matches) {
      const home = state.nations[match.home];
      const away = state.nations[match.away];

      // The match engine reads only `Overall`, so lightweight stand-ins are enough.
      const homeTeam = { ID: 0, Team: home.code, Overall: home.actualOverall } as unknown as Team;
      const awayTeam = { ID: 0, Team: away.code, Overall: away.actualOverall } as unknown as Team;
      const isKnockout = match.goldCupStage === "knockout" ||
        match.copaAmericaStage === "knockout" || match.afconStage === "knockout" ||
        match.afcCupStage === "knockout";
      const result = simulateMatch(homeTeam, awayTeam, isKnockout, "LEAGUE");
      const homeGoals = result.homeGoalInfo.homeGoals;
      const awayGoals = result.awayGoalInfo.awayGoals;
      let playoffResolution: {
        playoffId: string;
        tieId: string;
        winner: string;
        penalties: { home: string[]; away: string[] } | null;
        shootout: ReturnType<typeof simulatePenaltyShootoutOnly> | null;
      } | null = null;
      let afconTieResolution: {
        qualifierId: string;
        tieId: string;
        winner: string;
        penalties: { home: string[]; away: string[] } | null;
        shootout: ReturnType<typeof simulatePenaltyShootoutOnly> | null;
      } | null = null;
      let afcCupTieResolution: {
        qualifierId: string;
        tieId: string;
        winner: string;
        penalties: { home: string[]; away: string[] } | null;
        shootout: ReturnType<typeof simulatePenaltyShootoutOnly> | null;
      } | null = null;
      if (match.goldCupPlayoffId && match.goldCupTieId && match.goldCupLeg === 2) {
        const playoff = getGoldCupPlayoff(state.goldCup, match.goldCupPlayoffId);
        const tie = playoff.ties.find(candidate => candidate.id === match.goldCupTieId);
        if (!tie || tie.firstLeg.homeGoals === null || tie.firstLeg.awayGoals === null) {
          throw new Error(`Gold Cup playoff tie "${match.goldCupTieId}" has no completed first leg.`);
        }
        const aggregateTeam1 = tie.firstLeg.homeGoals + awayGoals;
        const aggregateTeam2 = tie.firstLeg.awayGoals + homeGoals;
        let winner: string;
        let shootout: ReturnType<typeof simulatePenaltyShootoutOnly> | null = null;
        let penalties: { home: string[]; away: string[] } | null = null;
        if (aggregateTeam1 !== aggregateTeam2) {
          winner = aggregateTeam1 > aggregateTeam2 ? tie.team1 : tie.team2;
        } else {
          shootout = simulatePenaltyShootoutOnly(
            { ID: 0, Team: tie.team1, Overall: state.nations[tie.team1].actualOverall } as unknown as Team,
            { ID: 0, Team: tie.team2, Overall: state.nations[tie.team2].actualOverall } as unknown as Team
          );
          winner = parseKOMatchWinner(shootout).Team;
          penalties = {
            home: shootout.homeGoalInfo.penalties ?? [],
            away: shootout.awayGoalInfo.penalties ?? []
          };
        }
        playoffResolution = {
          playoffId: match.goldCupPlayoffId,
          tieId: match.goldCupTieId,
          winner,
          penalties,
          shootout
        };
      }
      if (match.afconQualifierId && match.afconTieId && match.afconLeg === 2) {
        const qualifier = getAfconQualifier(state.afcon, match.afconQualifierId);
        const tie = qualifier.preliminaryTies.find(candidate => candidate.id === match.afconTieId);
        if (!tie || tie.firstLeg.homeGoals === null || tie.firstLeg.awayGoals === null) {
          throw new Error(`AFCON preliminary tie "${match.afconTieId}" has no completed first leg.`);
        }
        const aggregateTeam1 = tie.firstLeg.homeGoals + awayGoals;
        const aggregateTeam2 = tie.firstLeg.awayGoals + homeGoals;
        let winner: string;
        let shootout: ReturnType<typeof simulatePenaltyShootoutOnly> | null = null;
        let penalties: { home: string[]; away: string[] } | null = null;
        if (aggregateTeam1 !== aggregateTeam2) {
          winner = aggregateTeam1 > aggregateTeam2 ? tie.team1 : tie.team2;
        } else {
          shootout = simulatePenaltyShootoutOnly(
            { ID: 0, Team: tie.team1, Overall: state.nations[tie.team1].actualOverall } as unknown as Team,
            { ID: 0, Team: tie.team2, Overall: state.nations[tie.team2].actualOverall } as unknown as Team
          );
          winner = parseKOMatchWinner(shootout).Team;
          penalties = {
            home: shootout.homeGoalInfo.penalties ?? [],
            away: shootout.awayGoalInfo.penalties ?? []
          };
        }
        afconTieResolution = {
          qualifierId: match.afconQualifierId,
          tieId: match.afconTieId,
          winner,
          penalties,
          shootout
        };
      }
      if (match.afcCupQualifierId && match.afcCupTieId && match.afcCupLeg === 2) {
        const qualifier = getAfcCupQualifier(state.afcCup, match.afcCupQualifierId);
        const tie = qualifier.preliminaryTies.find(candidate => candidate.id === match.afcCupTieId);
        if (!tie || tie.firstLeg.homeGoals === null || tie.firstLeg.awayGoals === null) {
          throw new Error(`AFC Cup preliminary tie "${match.afcCupTieId}" has no completed first leg.`);
        }
        const aggregateTeam1 = tie.firstLeg.homeGoals + awayGoals;
        const aggregateTeam2 = tie.firstLeg.awayGoals + homeGoals;
        let winner: string;
        let shootout: ReturnType<typeof simulatePenaltyShootoutOnly> | null = null;
        let penalties: { home: string[]; away: string[] } | null = null;
        if (aggregateTeam1 !== aggregateTeam2) {
          winner = aggregateTeam1 > aggregateTeam2 ? tie.team1 : tie.team2;
        } else {
          shootout = simulatePenaltyShootoutOnly(
            { ID: 0, Team: tie.team1, Overall: state.nations[tie.team1].actualOverall } as unknown as Team,
            { ID: 0, Team: tie.team2, Overall: state.nations[tie.team2].actualOverall } as unknown as Team
          );
          winner = parseKOMatchWinner(shootout).Team;
          penalties = {
            home: shootout.homeGoalInfo.penalties ?? [],
            away: shootout.awayGoalInfo.penalties ?? []
          };
        }
        afcCupTieResolution = {
          qualifierId: match.afcCupQualifierId,
          tieId: match.afcCupTieId,
          winner,
          penalties,
          shootout
        };
      }

      const importance = MATCH_IMPORTANCE[match.kind];
      const hasShootout = Boolean(
        (result.homeGoalInfo.penalties && result.awayGoalInfo.penalties) ||
        (playoffResolution?.shootout && homeGoals === awayGoals) ||
        (afconTieResolution?.shootout && homeGoals === awayGoals) ||
        (afcCupTieResolution?.shootout && homeGoals === awayGoals)
      );
      const homeOutcome: MatchOutcome = hasShootout
        ? playoffResolution?.shootout || afconTieResolution?.shootout || afcCupTieResolution?.shootout
          ? (playoffResolution?.winner ?? afconTieResolution?.winner ?? afcCupTieResolution?.winner) === match.home ? "win" : "loss"
          : parseKOMatchWinner(result) === homeTeam ? "win" : "loss"
        : homeGoals > awayGoals ? "win" : homeGoals < awayGoals ? "loss" : "draw";
      const awayOutcome: MatchOutcome = homeOutcome === "win" ? "loss" : homeOutcome === "loss" ? "win" : "draw";
      const homeChange = rankingPointChange(home.points, away.points, importance, homeOutcome, { shootout: hasShootout });
      const awayChange = rankingPointChange(away.points, home.points, importance, awayOutcome, { shootout: hasShootout });

      home.points = round2(home.points + homeChange);
      away.points = round2(away.points + awayChange);
      match.homeGoals = homeGoals;
      match.awayGoals = awayGoals;
      match.homeChange = round2(homeChange);
      match.awayChange = round2(awayChange);
      match.homePenalties = result.homeGoalInfo.penalties ?? (
        (playoffResolution?.shootout || afconTieResolution?.shootout || afcCupTieResolution?.shootout) && homeGoals === awayGoals
          ? [...((playoffResolution?.shootout ?? afconTieResolution?.shootout ?? afcCupTieResolution?.shootout)?.awayGoalInfo.penalties ?? [])]
          : undefined
      );
      match.awayPenalties = result.awayGoalInfo.penalties ?? (
        (playoffResolution?.shootout || afconTieResolution?.shootout || afcCupTieResolution?.shootout) && homeGoals === awayGoals
          ? [...((playoffResolution?.shootout ?? afconTieResolution?.shootout ?? afcCupTieResolution?.shootout)?.homeGoalInfo.penalties ?? [])]
          : undefined
      );
      if (playoffResolution) {
        resolveGoldCupPlayoffTie(
          state.goldCup,
          playoffResolution.playoffId,
          playoffResolution.tieId,
          playoffResolution.winner,
          playoffResolution.penalties
        );
      }
      if (afconTieResolution) {
        resolveAfconPreliminaryTie(
          state.afcon,
          afconTieResolution.qualifierId,
          afconTieResolution.tieId,
          afconTieResolution.winner,
          afconTieResolution.penalties
        );
      }
      if (afcCupTieResolution) {
        resolveAfcCupPreliminaryTie(
          state.afcCup,
          afcCupTieResolution.qualifierId,
          afcCupTieResolution.tieId,
          afcCupTieResolution.winner,
          afcCupTieResolution.penalties
        );
      }

      if (match.goldCupEditionId && match.goldCupKnockoutMatchId) {
        const edition = state.goldCup.editions.find(candidate => candidate.id === match.goldCupEditionId);
        if (!edition) throw new Error(`Unknown Gold Cup edition "${match.goldCupEditionId}".`);
        const winner = hasShootout ? parseKOMatchWinner(result).Team : homeGoals > awayGoals ? match.home : match.away;
        match.goldCupWinner = winner;
        setInternationalCupKnockoutWinner(edition, match.goldCupKnockoutMatchId, winner);
      }
      if (match.copaAmericaEditionId && match.copaAmericaKnockoutMatchId) {
        const edition = state.copaAmerica.editions.find(candidate => candidate.id === match.copaAmericaEditionId);
        if (!edition) throw new Error(`Unknown Copa América edition "${match.copaAmericaEditionId}".`);
        const winner = hasShootout ? parseKOMatchWinner(result).Team : homeGoals > awayGoals ? match.home : match.away;
        match.copaAmericaWinner = winner;
        setInternationalCupKnockoutWinner(edition, match.copaAmericaKnockoutMatchId, winner);
      }
      if (match.afconEditionId && match.afconKnockoutMatchId) {
        const edition = state.afcon.editions.find(candidate => candidate.id === match.afconEditionId);
        if (!edition) throw new Error(`Unknown AFCON edition "${match.afconEditionId}".`);
        const winner = hasShootout ? parseKOMatchWinner(result).Team : homeGoals > awayGoals ? match.home : match.away;
        match.afconWinner = winner;
        setAfconKnockoutWinner(edition, match.afconKnockoutMatchId, winner);
      }
      if (match.afcCupEditionId && match.afcCupKnockoutMatchId) {
        const edition = state.afcCup.editions.find(candidate => candidate.id === match.afcCupEditionId);
        if (!edition) throw new Error(`Unknown AFC Cup edition "${match.afcCupEditionId}".`);
        const winner = hasShootout ? parseKOMatchWinner(result).Team : homeGoals > awayGoals ? match.home : match.away;
        match.afcCupWinner = winner;
        setAfcCupKnockoutWinner(edition, match.afcCupKnockoutMatchId, winner);
      }

      awardCaps(match.home);
      awardCaps(match.away);
    }

    if (round.kind === "goldCupPlayoff" && round.label?.endsWith("Second leg")) {
      const playoffId = round.matches[0]?.goldCupPlayoffId;
      if (playoffId) {
        completeGoldCupPlayoff(state.goldCup, playoffId);
        drawGoldCupAfterPlayoff(state, playoffId, window.year, window.windowId);
      }
    }
    if (round.kind === "afconQualifier" && round.afconStage === "preliminary") {
      const qualifierId = round.afconQualifierId;
      if (qualifierId && round.matches.every(match =>
        getAfconQualifier(state.afcon, qualifierId).preliminaryTies.every(tie => tie.winner !== null)
      )) {
        const qualifier = getAfconQualifier(state.afcon, qualifierId);
        if (!qualifier.preliminaryComplete) {
          completeAfconPreliminary(
            state.afcon,
            qualifierId,
            window.year,
            window.windowId,
            window.afterMatchday,
            Object.fromEntries(computeRankings(state).map(row => [row.code, row.rank]))
          );
        }
      }
    }
    if (round.kind === "afconQualifier" && round.afconStage === "main" && round.afconQualifierId) {
      const qualifier = getAfconQualifier(state.afcon, round.afconQualifierId);
      qualifier.mainRoundsPlayed++;
      if (qualifier.mainRoundsPlayed === 6) {
        completeAfconMainQualifiers(
          state.afcon,
          qualifier.id,
          window.year,
          window.windowId,
          Object.fromEntries(computeRankings(state).map(row => [row.code, row.rank]))
        );
      }
    }
    if (round.kind === "afcCupQualifier" && round.afcCupStage === "preliminary") {
      const qualifierId = round.afcCupQualifierId;
      if (qualifierId && round.matches.every(match =>
        getAfcCupQualifier(state.afcCup, qualifierId).preliminaryTies.every(tie => tie.winner !== null)
      )) {
        const qualifier = getAfcCupQualifier(state.afcCup, qualifierId);
        if (!qualifier.preliminaryComplete) {
          completeAfcCupPreliminary(
            state.afcCup,
            qualifierId,
            window.year,
            window.windowId,
            window.afterMatchday,
            Object.fromEntries(computeRankings(state).map(row => [row.code, row.rank]))
          );
        }
      }
    }
    if (round.kind === "afcCupQualifier" && round.afcCupStage === "main" && round.afcCupQualifierId) {
      const qualifier = getAfcCupQualifier(state.afcCup, round.afcCupQualifierId);
      qualifier.mainRoundsPlayed++;
      if (qualifier.mainRoundsPlayed === 6) {
        completeAfcCupMainQualifiers(
          state.afcCup,
          qualifier.id,
          window.year,
          window.windowId,
          Object.fromEntries(computeRankings(state).map(row => [row.code, row.rank]))
        );
      }
    }
    if (round.kind === "goldCup") {
      const match = round.matches[0];
      if (match?.goldCupEditionId) {
        const edition = state.goldCup.editions.find(candidate => candidate.id === match.goldCupEditionId);
        if (!edition) throw new Error(`Unknown Gold Cup edition "${match.goldCupEditionId}".`);
        let nextRound: InternationalRound | null = null;
        if (match.goldCupStage === "group") {
          nextRound = advanceInternationalCupRound(edition, -1);
        } else {
          const knockoutRoundIndex = edition.knockout?.findIndex(knockoutRound =>
            knockoutRound.matches.some(knockoutMatch => round.matches.includes(knockoutMatch.fixture))
          ) ?? -1;
          nextRound = advanceInternationalCupRound(edition, knockoutRoundIndex);
        }
        if (nextRound) window.rounds.push(nextRound);
      }
    }
    if (round.kind === "copaAmerica") {
      const match = round.matches[0];
      if (match?.copaAmericaEditionId) {
        const edition = state.copaAmerica.editions.find(candidate => candidate.id === match.copaAmericaEditionId);
        if (!edition) throw new Error(`Unknown Copa América edition "${match.copaAmericaEditionId}".`);
        let nextRound: InternationalRound | null = null;
        if (match.copaAmericaStage === "group") {
          nextRound = advanceInternationalCupRound(edition, -1, "copaAmerica");
        } else {
          const knockoutRoundIndex = edition.knockout?.findIndex(knockoutRound =>
            knockoutRound.matches.some(knockoutMatch => round.matches.includes(knockoutMatch.fixture))
          ) ?? -1;
          nextRound = advanceInternationalCupRound(edition, knockoutRoundIndex, "copaAmerica");
        }
        if (nextRound) window.rounds.push(nextRound);
      }
    }
    if (round.kind === "afcon") {
      const match = round.matches[0];
      if (match?.afconEditionId) {
        const edition = state.afcon.editions.find(candidate => candidate.id === match.afconEditionId);
        if (!edition) throw new Error(`Unknown AFCON edition "${match.afconEditionId}".`);
        let nextRound: InternationalRound | null = null;
        if (match.afconStage === "group") {
          nextRound = startAfconRoundOf16(edition);
        } else if (match.afconStage === "knockout") {
          const knockoutRoundIndex = edition.knockout?.findIndex(knockoutRound =>
            knockoutRound.matches.some(knockoutMatch => round.matches.includes(knockoutMatch.fixture))
          ) ?? -1;
          nextRound = advanceAfconKnockoutRound(edition, knockoutRoundIndex);
        }
        if (nextRound) window.rounds.push(nextRound);
      }
    }
    if (round.kind === "afcCup") {
      const match = round.matches[0];
      if (match?.afcCupEditionId) {
        const edition = state.afcCup.editions.find(candidate => candidate.id === match.afcCupEditionId);
        if (!edition) throw new Error(`Unknown AFC Cup edition "${match.afcCupEditionId}".`);
        let nextRound: InternationalRound | null = null;
        if (match.afcCupStage === "group") {
          nextRound = startAfcCupRoundOf16(edition);
        } else if (match.afcCupStage === "knockout") {
          const knockoutRoundIndex = edition.knockout?.findIndex(knockoutRound =>
            knockoutRound.matches.some(knockoutMatch => round.matches.includes(knockoutMatch.fixture))
          ) ?? -1;
          nextRound = advanceAfcCupKnockoutRound(edition, knockoutRoundIndex);
        }
        if (nextRound) window.rounds.push(nextRound);
      }
    }
  }

  drawCopaAmericaIfDue(state, window.year, window.windowId);
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
  competitionLink?: string;
  stage?: string;
  penaltyShootout?: { goalsFor: number; goalsAgainst: number };
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
        const shootoutFor = isHome ? match.homePenalties : match.awayPenalties;
        const shootoutAgainst = isHome ? match.awayPenalties : match.homePenalties;
        const outcome = shootoutFor && shootoutAgainst
          ? shootoutFor.filter(kick => kick === "O").length > shootoutAgainst.filter(kick => kick === "O").length
            ? "win"
            : "loss"
          : goalsFor > goalsAgainst ? "win" : goalsFor < goalsAgainst ? "loss" : "draw";
        rows.push({
          year: window.year,
          windowId: window.windowId,
          windowLabel: window.label,
          opponent: isHome ? match.away : match.home,
          home: isHome,
          goalsFor,
          goalsAgainst,
          outcome,
          pointsChange: (isHome ? match.homeChange : match.awayChange) ?? 0,
          kind: match.kind,
          stage: match.kind === "goldCupGroup"
            ? "Gold Cup GS"
            : match.kind === "goldCupKnockout"
              ? `Gold Cup ${match.goldCupKnockoutMatchId?.startsWith("QF") ? "QF"
                : match.goldCupKnockoutMatchId?.startsWith("SF") ? "SF"
                  : match.goldCupKnockoutMatchId === "F" ? "Final" : "Knockout"}`
              : match.kind === "goldCupPlayoff"
                ? `Gold Cup Playoff · Leg ${match.goldCupLeg ?? "—"}`
                : match.kind === "copaAmericaGroup"
                  ? "Copa América GS"
                  : match.kind === "copaAmericaKnockout"
                    ? `Copa América ${match.copaAmericaKnockoutMatchId?.startsWith("QF") ? "QF"
                      : match.copaAmericaKnockoutMatchId?.startsWith("SF") ? "SF"
                        : match.copaAmericaKnockoutMatchId === "F" ? "Final" : "Knockout"}`
                      : match.kind === "afconQualifier"
                        ? match.afconStage === "preliminary"
                          ? `AFCON Preliminary · Leg ${match.afconLeg ?? "—"}`
                          : `AFCON Qualifying · Matchday ${match.afconRound ?? "—"}`
                        : match.kind === "afconGroup"
                          ? `AFCON ${match.afconStage === "group" ? "Group Stage" : "Group"} · Matchday ${match.afconRound ?? "—"}`
                          : match.kind === "afconKnockout"
                            ? `AFCON ${match.afconKnockoutMatchId?.startsWith("R16") ? "Round of 16"
                              : match.afconKnockoutMatchId?.startsWith("QF") ? "Quarter-finals"
                                : match.afconKnockoutMatchId?.startsWith("SF") ? "Semi-finals"
                                  : match.afconKnockoutMatchId === "F" ? "Final" : "Knockout"}`
                          : match.kind === "afcCupQualifier"
                            ? match.afcCupStage === "preliminary"
                              ? `AFC Cup Preliminary · Leg ${match.afcCupLeg ?? "—"}`
                              : `AFC Cup Qualifying · Matchday ${match.afcCupRound ?? "—"}`
                            : match.kind === "afcCupGroup"
                              ? `AFC Cup Group Stage · Matchday ${match.afcCupRound ?? "—"}`
                              : match.kind === "afcCupKnockout"
                                ? `AFC Cup ${match.afcCupKnockoutMatchId?.startsWith("R16") ? "Round of 16"
                                  : match.afcCupKnockoutMatchId?.startsWith("QF") ? "Quarter-finals"
                                    : match.afcCupKnockoutMatchId?.startsWith("SF") ? "Semi-finals"
                                      : match.afcCupKnockoutMatchId === "F" ? "Final" : "Knockout"}`
                    : undefined,
          penaltyShootout: shootoutFor && shootoutAgainst
            ? {
                goalsFor: shootoutFor.filter(kick => kick === "O").length,
                goalsAgainst: shootoutAgainst.filter(kick => kick === "O").length
              }
            : undefined,
          competitionLink: match.kind === "nationsLeague"
            ? `/nations-league/${getNationConfederation(code)}`
            : match.kind === "goldCupPlayoff"
              ? "/gold-cup-playoff"
              : match.kind === "goldCupGroup" || match.kind === "goldCupKnockout"
                ? "/gold-cup"
                : match.kind === "copaAmericaGroup" || match.kind === "copaAmericaKnockout"
                  ? "/copa-america"
                    : match.kind === "afconQualifier"
                      ? "/afcon-qualifiers"
                      : match.kind === "afconGroup" || match.kind === "afconKnockout"
                        ? "/afcon"
                        : match.kind === "afcCupQualifier"
                          ? "/afc-cup-qualifiers"
                          : match.kind === "afcCupGroup" || match.kind === "afcCupKnockout"
                            ? "/afc-cup"
                  : undefined
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
