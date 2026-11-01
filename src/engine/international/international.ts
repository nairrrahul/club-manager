import windowsRaw from "../data/intl/international_windows.json";
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
import {
  advanceOfcCupKnockoutRound, completeOfcCupQualifiers, createOfcCupQualifierEdition,
  createOfcCupState, findOfcCupQualifier, getOfcCupQualifier, getOfcCupQualifyingRounds,
  getOfcCupTournament, getOfcCupTournamentRounds, getOfcCupWindowType, setOfcCupKnockoutWinner,
  startOfcCupSemiFinals
} from "./ofcCup";
import type { OfcCupState } from "./ofcCup";
import {
  completeEuroMainQualifying, createEuroQualifyingEdition, createEuroQualifiersState,
  findEuroQualifyingEdition, getEuroPlayoffFinalRound, getEuroPlayoffRounds,
  getEuroQualifyingRounds, getEuroQualifyingEdition, getEuroWindowType, recordEuroPlayoffRound
} from "./euroQualifiers";
import type { EuroQualifiersState } from "./euroQualifiers";
import {
  advanceEuroKnockoutRound, createEuroEdition, createEuroState, getEuroTournament,
  getEuroTournamentRounds, setEuroKnockoutWinner, startEuroRoundOf16
} from "./euros";
import type { EuroState } from "./euros";
import {
  completeAfricaQualifying, completeAfricaPlayoff, createAfricaQualifying
} from "./worldcup/africa";
import {
  completeConcacafPreliminary, completeConcacafSecondRound, completeConcacafThirdRound,
  createConcacafQualifying
} from "./worldcup/concacaf";
import {
  completeAsiaPreliminary, completeAsiaSecondRound, completeAsiaThirdRound, createAsiaQualifying
} from "./worldcup/asia";
import {
  completeOceaniaPreliminary, completeOceaniaSecondRound, completeOceaniaThirdRound,
  createOceaniaQualifying
} from "./worldcup/oceania";
import {
  completeEuropePlayoff, completeEuropeQualifying, createEuropeQualifying
} from "./worldcup/europe";
import { completeSouthAmericaQualifying, createSouthAmericaQualifying } from "./worldcup/southAmerica";
import {
  createIntercontinentalPlayoff, getIntercontinentalPlayoffRounds,
  recordIntercontinentalPlayoffRound
} from "./worldcup/intercontinental";
import {
  advanceWorldCupKnockout, createWorldCupTournament, getWorldCupGroupRounds,
  recordWorldCupKnockoutWinner, startWorldCupRoundOf32
} from "./worldcup/tournament";
import {
  createWorldCupState, ensureWorldCupEdition, findWorldCupEdition,
  getWorldCupEdition, getWorldCupSeasonForWindow, getWorldCupWindowType
} from "./worldcup/worldCup";
import {
  createGroupFixtures, createWorldCupGroupRounds, findWorldCupTie,
  getWorldCupPathRound, getWorldCupTieRounds, recordWorldCupPathRound
} from "./worldcup/utils";
import type { WorldCupState, WorldCupEdition, WorldCupPhase } from "./worldcup/types";
import type { NationsLeagueState } from "./nationsLeague";
import {
  completeGoldCupPlayoff, createGoldCupEdition, createGoldCupPlayoffEdition,
  createGoldCupState, findLatestGoldCupPlayoff, getGoldCupPlayoff,
  getGoldCupWindowType, resolveGoldCupPlayoffTie
} from "./goldCup";
import type { GoldCupState } from "./goldCup";
import {
  advanceInternationalCupRound, setInternationalCupKnockoutWinner,
  getDistributedInternationalRoundSchedule, getFixedInternationalCompetitionHosts,
  getInternationalDisplayName, getInternationalWindowIndex, getInternationalWindowLabel,
  getInternationalWindowLocation, getInternationalWindowType,
  getNextCompetitionWindow, INTERNATIONAL_CYCLE_WINDOW_COUNT, isInternationalTeamCompetitivelyEligible
} from "./internationalCompetitionsUtils";
import type { InternationalCompetitionEdition } from "./internationalCompetitionsUtils";
import { getWorldCupHostConfederations } from "./worldcup/hosts";
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
  ofcCupEditionId?: string;
  ofcCupQualifierId?: string;
  ofcCupStage?: "qualifying" | "group" | "knockout";
  ofcCupGroup?: string;
  ofcCupRound?: number;
  ofcCupKnockoutMatchId?: string;
  ofcCupWinner?: string;
  euroEditionId?: string;
  euroQualifierId?: string;
  euroStage?: "qualifying" | "playoff" | "group" | "knockout";
  euroGroup?: string;
  euroRound?: number;
  euroTournamentYear?: number;
  euroPath?: string;
  euroPathRound?: number;
  euroPathMatch?: number;
  euroWinner?: string;
  euroKnockoutMatchId?: string;
  worldCupEditionId?: string;
  worldCupStage?: string;
  worldCupPhase?: string;
  worldCupGroup?: string;
  worldCupRound?: number;
  worldCupLeg?: 1 | 2;
  worldCupTieId?: string;
  worldCupPath?: string;
  worldCupPathRound?: number;
  worldCupPathMatch?: number;
  worldCupMatchIndex?: number;
  worldCupWinner?: string;
  worldCupKnockoutMatchId?: string;
  homePenalties?: string[];
  awayPenalties?: string[];
}

export interface InternationalRound {
  matches: InternationalMatch[];
  kind?: "friendly" | "nationsLeague" | "goldCupPlayoff" | "goldCup" | "copaAmerica" | "afconQualifier" | "afcon" | "afcCupQualifier" | "afcCup" | "ofcCupQualifier" | "ofcCup" | "euroQualifier" | "euro" | "worldCupQualifier" | "worldCup";
  label?: string;
  afconQualifierId?: string;
  afconStage?: "preliminary" | "main" | "tournamentGroup" | "tournamentKnockout";
  afconRound?: number;
  afcCupQualifierId?: string;
  afcCupStage?: "preliminary" | "main" | "group" | "knockout";
  afcCupRound?: number;
  ofcCupQualifierId?: string;
  ofcCupStage?: "qualifying" | "group" | "knockout";
  ofcCupRound?: number;
  euroQualifierId?: string;
  euroStage?: "qualifying" | "playoff" | "group" | "knockout";
  euroRound?: number;
  euroTournamentYear?: number;
  worldCupEditionId?: string;
  worldCupStage?: string;
  worldCupPhase?: string;
  worldCupRound?: number;
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
  ofcCup: OfcCupState;
  euroQualifiers: EuroQualifiersState;
  euro: EuroState;
  worldCup: WorldCupState;
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
    ofcCup: createOfcCupState(),
    euroQualifiers: createEuroQualifiersState(),
    euro: createEuroState(),
    worldCup: createWorldCupState(),
    lastLeftOut: null,
    explicitWindows: false
  };
}

export function migrateFixedInternationalHosts(state: InternationalState): void {
  const updateCompletedEdition = (edition: InternationalCompetitionEdition, competition: string) => {
    if (!edition.completed) return;
    const hosts = getFixedInternationalCompetitionHosts(competition, edition.year + 1);
    if (hosts) edition.hosts = hosts;
  };

  state.goldCup.editions.forEach(edition => updateCompletedEdition(edition, "GC"));
  state.copaAmerica.editions.forEach(edition => updateCompletedEdition(edition, "COPA"));
  state.afcon.qualifyingEditions.forEach(edition => {
    if (!edition.completed) return;
    const hosts = getFixedInternationalCompetitionHosts("AFCON", edition.year + 1);
    if (hosts) edition.hosts = hosts;
  });
  state.afcon.editions.forEach(edition => updateCompletedEdition(edition, "AFCON"));
  state.afcCup.qualifyingEditions.forEach(edition => {
    if (!edition.completed) return;
    const hosts = getFixedInternationalCompetitionHosts("AFCCUP", edition.year + 1);
    if (hosts) edition.hosts = hosts;
  });
  state.afcCup.editions.forEach(edition => updateCompletedEdition(edition, "AFCCUP"));
  state.ofcCup.qualifyingEditions.forEach(edition => {
    if (!edition.completed) return;
    const hosts = getFixedInternationalCompetitionHosts("OFCCUP", edition.year + 1);
    if (hosts) edition.hosts = hosts;
  });
  state.ofcCup.editions.forEach(edition => updateCompletedEdition(edition, "OFCCUP"));
  state.euroQualifiers.editions.forEach(edition => {
    if (!edition.completed) return;
    const hosts = getFixedInternationalCompetitionHosts("EURO", edition.tournamentYear + 1);
    if (hosts) edition.hosts = hosts;
  });
  state.euro.editions.forEach(edition => updateCompletedEdition(edition, "EURO"));

  for (const edition of state.worldCup.editions) {
    if (!edition.tournament?.completed) continue;
    const hosts = getFixedInternationalCompetitionHosts("WC", edition.year + 1);
    if (!hosts) continue;
    edition.hosts = hosts;
    edition.blockedConfederations = getWorldCupHostConfederations(hosts);
    edition.tournament.hosts = hosts;
  }
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
  let ofcCupTeams: string[] = [];
  let euroTeams: string[] = [];
  let worldCupTeams: string[] = [];
  const afconWindowType = getAfconWindowType(season.year, def.id);
  const afconSuffix = afconWindowType?.slice(-1) as "1" | "2" | undefined;
  const afcCupWindowType = getAfcCupWindowType(season.year, def.id);
  const ofcCupWindowType = getOfcCupWindowType(season.year, def.id);
  const euroWindowType = getEuroWindowType(season.year, def.id);
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
    if (!qualifier) throw new Error("Asian Cup qualifying has not started.");
    rounds.push(...getAfcCupMainRounds(qualifier, season.year, def.id, def.afterMatchday));
    afcCupTeams = qualifier.mainGroups?.flatMap(group => group.teams) ?? [];
  } else if (afcCupWindowType === "AFCCUP") {
    const edition = getAfcCupTournament(state.afcCup, season.year);
    if (!edition) throw new Error("Asian Cup edition has not been drawn.");
    afcCupTeams = edition.teams;
    rounds.push(...getAfcCupTournamentRounds(edition));
  }
  if (ofcCupWindowType === "OFCCUPQ") {
    const qualifier = findOfcCupQualifier(state.ofcCup, season.year);
    if (!qualifier) throw new Error(`OFC Cup qualifying for ${season.year} was not drawn in the preceding window.`);
    rounds.push(...getOfcCupQualifyingRounds(qualifier, season.year, def.id, def.afterMatchday));
    ofcCupTeams = qualifier.teams;
  } else if (ofcCupWindowType === "OFCCUP") {
    const edition = getOfcCupTournament(state.ofcCup, season.year);
    if (!edition) throw new Error(`OFC Cup edition for ${season.year} has not been drawn.`);
    ofcCupTeams = edition.teams;
    rounds.push(...getOfcCupTournamentRounds(edition));
  }
  if (euroWindowType === "EUROQ") {
    const tournamentWindow = getNextCompetitionWindow(season.year, def.id, (year, id) =>
      getEuroWindowType(year, id) === "EURO"
    );
    const qualifier = findEuroQualifyingEdition(state.euroQualifiers, tournamentWindow.year);
    if (!qualifier) throw new Error(`EURO qualifying for ${tournamentWindow.year} was not drawn in the preceding window.`);
    rounds.push(...getEuroQualifyingRounds(qualifier, season.year, def.id, def.afterMatchday));
    euroTeams = qualifier.groups.flatMap(group => group.teams);
  } else if (euroWindowType === "EUROQP") {
    const qualifier = state.euroQualifiers.editions.find(item =>
      item.tournamentYear === season.year && item.completed && !item.playoffComplete
    );
    if (!qualifier) throw new Error(`EURO qualifying play-offs for ${season.year} have not been drawn.`);
    rounds.push(...getEuroPlayoffRounds(qualifier, season.year, def.id, def.afterMatchday));
    euroTeams = qualifier.playoffTeams;
  } else if (euroWindowType === "EURO") {
    const edition = getEuroTournament(state.euro, season.year);
    if (!edition) throw new Error(`EURO edition for ${season.year} has not been drawn.`);
    euroTeams = edition.teams;
    rounds.push(...getEuroTournamentRounds(edition));
  }
  const worldCupCodes = ["UEFA", "CONCACAF", "CONMEBOL", "OFC", "AFC", "CAF"] as const;
  const worldCupTypes = Object.fromEntries(worldCupCodes.map(confederation => [
    confederation,
    getWorldCupWindowType(confederation, season.year, def.id)
  ])) as Record<typeof worldCupCodes[number], string | null>;
  const worldCupTypeSet = new Set([
    "SAWCQ", "CAFWCQ", "CAFWCQP", "CCWCQ1", "CCWCQ2", "CCWCQ3",
    "AFCWCQ1", "AFCWCQ2", "AFCWCQ3", "OFCWCQ1", "OFCWCQ2", "OFCWCQ3",
    "UEFAWCQM", "UEFAWCQP", "ICPO", "WC"
  ]);
  if (Object.values(worldCupTypes).some(type => type !== null && worldCupTypeSet.has(type))) {
    const tournamentYear = getWorldCupSeasonForWindow(season.year, def.id);
    const edition = ensureWorldCupEdition(
      state.worldCup,
      tournamentYear,
      Object.fromEntries(computeRankings(state).map(row => [row.code, row.rank]))
    );
    const addPhaseTeams = (phaseName: string, regionName?: keyof WorldCupEdition["regions"]): WorldCupPhase | null => {
      const region = regionName ? edition.regions[regionName] : edition.intercontinental;
      const phase = region.phases[phaseName];
      if (!phase) return null;
      worldCupTeams.push(
        ...phase.groups.flatMap(group => group.teams),
        ...phase.ties.flatMap(tie => [tie.team1, tie.team2]),
        ...phase.playoffTeams
      );
      return phase;
    };
    const addGroups = (phaseName: string, regionName: keyof WorldCupEdition["regions"]) => {
      const phase = addPhaseTeams(phaseName, regionName);
      if (!phase) throw new Error(`${regionName} World Cup phase ${phaseName} was not drawn.`);
      const totalRounds = Math.max(...phase.groups.map(group => group.matches.length));
      const schedule = getDistributedInternationalRoundSchedule(
        regionName,
        phaseName,
        season.year,
        def.id,
        totalRounds
      );
      rounds.push(...createWorldCupGroupRounds(
        phase, edition.id, phaseName, "worldCupQualifier",
        season.year, def.id, def.afterMatchday, schedule.count, totalRounds, schedule.start
      ));
    };
    const addTies = (phaseName: string, regionName: keyof WorldCupEdition["regions"]) => {
      const phase = addPhaseTeams(phaseName, regionName);
      if (!phase) throw new Error(`${regionName} World Cup phase ${phaseName} was not drawn.`);
      rounds.push(...getWorldCupTieRounds(
        phase, edition.id, phaseName, season.year, def.id, def.afterMatchday
      ));
    };
    const addPaths = (phaseName: string, regionName: keyof WorldCupEdition["regions"]) => {
      const phase = addPhaseTeams(phaseName, regionName);
      if (!phase) throw new Error(`${regionName} World Cup phase ${phaseName} was not drawn.`);
      const round = getWorldCupPathRound(
        phase, edition.id, phaseName, season.year, def.id, def.afterMatchday
      );
      if (round) rounds.push(round);
    };
    const initialize = (regionName: keyof WorldCupEdition["regions"], phaseName: string, create: () => void) => {
      if (!edition.regions[regionName].phases[phaseName]) create();
    };
    const ranksNow = () => Object.fromEntries(computeRankings(state).map(row => [row.code, row.rank]));

    if (worldCupTypes.CONMEBOL === "SAWCQ") {
      initialize("CONMEBOL", "SAWCQ", () => createSouthAmericaQualifying(edition));
      addGroups("SAWCQ", "CONMEBOL");
    }
    if (worldCupTypes.CAF === "CAFWCQ") {
      initialize("CAF", "CAFWCQ", () => createAfricaQualifying(edition));
      addGroups("CAFWCQ", "CAF");
    }
    if (worldCupTypes.CAF === "CAFWCQP") {
      const phase = addPhaseTeams("CAFWCQP", "CAF");
      if (!phase) throw new Error("CAF World Cup playoff was not drawn after the main qualifying round.");
      if (phase.ties.length > 0) addTies("CAFWCQP", "CAF");
      else addPaths("CAFWCQP", "CAF");
    }
    if (worldCupTypes.CONCACAF === "CCWCQ1") {
      initialize("CONCACAF", "CCWCQ1", () => createConcacafQualifying(edition, season.year, def.id, def.afterMatchday));
      addTies("CCWCQ1", "CONCACAF");
    }
    if (worldCupTypes.CONCACAF === "CCWCQ2") addGroups("CCWCQ2", "CONCACAF");
    if (worldCupTypes.CONCACAF === "CCWCQ3") addGroups("CCWCQ3", "CONCACAF");
    if (worldCupTypes.AFC === "AFCWCQ1") {
      initialize("AFC", "AFCWCQ1", () => createAsiaQualifying(edition, season.year, def.id, def.afterMatchday));
      addTies("AFCWCQ1", "AFC");
    }
    if (worldCupTypes.AFC === "AFCWCQ2") addGroups("AFCWCQ2", "AFC");
    if (worldCupTypes.AFC === "AFCWCQ3") addGroups("AFCWCQ3", "AFC");
    if (worldCupTypes.OFC === "OFCWCQ1") {
      initialize("OFC", "OFCWCQ1", () => createOceaniaQualifying(edition));
      addPaths("OFCWCQ1", "OFC");
    }
    if (worldCupTypes.OFC === "OFCWCQ2") addGroups("OFCWCQ2", "OFC");
    if (worldCupTypes.OFC === "OFCWCQ3") {
      const phase = addPhaseTeams("OFCWCQ3", "OFC");
      if (!phase) throw new Error("OFC third qualifying round was not drawn after the main round.");
      if (phase.ties.length > 0) addTies("OFCWCQ3", "OFC");
      else addPaths("OFCWCQ3", "OFC");
    }
    if (worldCupTypes.UEFA === "UEFAWCQM") {
      initialize("UEFA", "UEFAWCQM", () => createEuropeQualifying(edition));
      addGroups("UEFAWCQM", "UEFA");
    }
    if (worldCupTypes.UEFA === "UEFAWCQP") addPaths("UEFAWCQP", "UEFA");
    if (Object.values(worldCupTypes).includes("ICPO")) {
      if (!edition.intercontinental.phases.ICPO) {
        createIntercontinentalPlayoff(edition, season.year, def.id, def.afterMatchday);
      }
      addPhaseTeams("ICPO");
      rounds.push(...getIntercontinentalPlayoffRounds(edition, season.year, def.id, def.afterMatchday));
    }
    if (Object.values(worldCupTypes).includes("WC")) {
      if (!edition.tournament) {
        const uefaPlayoffWinners = edition.regions.UEFA.phases.UEFAWCQP?.qualifiers ?? [];
        const playoffSet = new Set(uefaPlayoffWinners);
        const direct = Object.values(edition.regions).flatMap(region =>
          region.qualified.filter(code => !playoffSet.has(code))
        );
        edition.tournament = createWorldCupTournament(
          season.year,
          edition.hosts,
          direct,
          edition.intercontinental.qualified,
          uefaPlayoffWinners,
          ranksNow()
        );
      }
      worldCupTeams.push(...edition.tournament.teams);
      rounds.push(...getWorldCupGroupRounds(edition.tournament));
    }
    worldCupTeams = [...new Set(worldCupTeams)];
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
  const worldCupFixtureTeams = new Set(rounds
    .filter(round => round.kind === "worldCupQualifier")
    .flatMap(round => round.matches.flatMap(match => [match.home, match.away])));
  for (const round of rounds) {
    if (round.kind === "friendly") continue;
    for (const match of round.matches) {
      for (const code of [match.home, match.away]) {
        if (!isInternationalTeamCompetitivelyEligible(code, season.year)) {
          throw new Error(`${code} is banned from competitive international matches in the ${season.year}-${String(season.year + 1).slice(-2)} season.`);
        }
      }
    }
  }
  const friendlyNations = Object.keys(state.nations).filter(code =>
    (!isInternationalTeamCompetitivelyEligible(code, season.year) ||
      getInternationalWindowType(getNationConfederation(code), season.year, def.id) === "FR" ||
      (afconWindowType !== null && getNationConfederation(code) === "CAF") ||
      (afcCupWindowType !== null && getNationConfederation(code) === "AFC") ||
      (ofcCupWindowType !== null && getNationConfederation(code) === "OFC") ||
      (euroWindowType !== null && getNationConfederation(code) === "UEFA") ||
      (getWorldCupWindowType(getNationConfederation(code), season.year, def.id) !== null &&
        worldCupTypeSet.has(getWorldCupWindowType(getNationConfederation(code), season.year, def.id)!)) ||
      (goldCupPlayoff !== null &&
        getNationConfederation(code) === "CONCACAF" &&
        !goldCupPlayoff.edition.entrants.includes(code))) &&
    !copaAmericaTeams.includes(code) &&
    !afconTeams.includes(code) &&
    !afcCupTeams.includes(code) &&
    !ofcCupTeams.includes(code) &&
    !euroTeams.includes(code) &&
    !worldCupTeams.includes(code) &&
    !worldCupFixtureTeams.has(code)
  );
  if (friendlyNations.length > 1) {
    for (let i = 0; i < FRIENDLY_SETS_PER_WINDOW; i++) {
      const round = scheduleFriendlies(state, overalls, played, friendlyNations);
      round.label = `Friendlies · Set ${i + 1}`;
      round.matches.forEach(match => played.add(pairKey(match.home, match.away)));
      rounds.push(round);
    }
  }
  if (rounds.some(round => round.kind === "friendly" && round.matches.some(match =>
    worldCupFixtureTeams.has(match.home) || worldCupFixtureTeams.has(match.away)
  ))) {
    throw new Error("A nation cannot be scheduled for both a World Cup qualifier and a friendly in the same window.");
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
        match.afcCupStage === "knockout" || match.ofcCupStage === "knockout" ||
        match.euroStage === "playoff" || match.euroStage === "knockout" ||
        match.worldCupPathMatch !== undefined || match.worldCupKnockoutMatchId !== undefined;
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
      let worldCupTieResolution: { edition: WorldCupEdition; tieId: string; winner: string; shootout: ReturnType<typeof simulatePenaltyShootoutOnly> | null } | null = null;
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
          throw new Error(`Asian Cup preliminary tie "${match.afcCupTieId}" has no completed first leg.`);
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
      if (match.worldCupEditionId && match.worldCupTieId && match.worldCupLeg === 2) {
        const edition = state.worldCup.editions.find(item => item.id === match.worldCupEditionId);
        const tie = edition ? findWorldCupTie(edition, match.worldCupTieId) : null;
        if (!edition || !tie || tie.firstLeg.homeGoals === null || tie.firstLeg.awayGoals === null) {
          throw new Error(`World Cup qualifying tie "${match.worldCupTieId}" has no completed first leg.`);
        }
        const aggregateTeam1 = tie.firstLeg.homeGoals + awayGoals;
        const aggregateTeam2 = tie.firstLeg.awayGoals + homeGoals;
        let winner = aggregateTeam1 > aggregateTeam2 ? tie.team1 : tie.team2;
        let shootout: ReturnType<typeof simulatePenaltyShootoutOnly> | null = null;
        if (aggregateTeam1 === aggregateTeam2) {
          shootout = simulatePenaltyShootoutOnly(
            { ID: 0, Team: tie.team1, Overall: state.nations[tie.team1].actualOverall } as unknown as Team,
            { ID: 0, Team: tie.team2, Overall: state.nations[tie.team2].actualOverall } as unknown as Team
          );
          winner = parseKOMatchWinner(shootout).Team;
        }
        worldCupTieResolution = { edition, tieId: tie.id, winner, shootout };
      }

      const importance = MATCH_IMPORTANCE[match.kind];
      const hasShootout = Boolean(
        (result.homeGoalInfo.penalties && result.awayGoalInfo.penalties) ||
        (playoffResolution?.shootout && homeGoals === awayGoals) ||
        (afconTieResolution?.shootout && homeGoals === awayGoals) ||
        (afcCupTieResolution?.shootout && homeGoals === awayGoals) ||
        (worldCupTieResolution?.shootout && homeGoals === awayGoals)
      );
      const homeOutcome: MatchOutcome = hasShootout
        ? playoffResolution?.shootout || afconTieResolution?.shootout || afcCupTieResolution?.shootout || worldCupTieResolution?.shootout
        ? (playoffResolution?.winner ?? afconTieResolution?.winner ?? afcCupTieResolution?.winner ?? worldCupTieResolution?.winner) === match.home ? "win" : "loss"
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
        (playoffResolution?.shootout || afconTieResolution?.shootout || afcCupTieResolution?.shootout || worldCupTieResolution?.shootout) && homeGoals === awayGoals
          ? [...((playoffResolution?.shootout ?? afconTieResolution?.shootout ?? afcCupTieResolution?.shootout ?? worldCupTieResolution?.shootout)?.awayGoalInfo.penalties ?? [])]
          : undefined
      );
      match.awayPenalties = result.awayGoalInfo.penalties ?? (
        (playoffResolution?.shootout || afconTieResolution?.shootout || afcCupTieResolution?.shootout || worldCupTieResolution?.shootout) && homeGoals === awayGoals
          ? [...((playoffResolution?.shootout ?? afconTieResolution?.shootout ?? afcCupTieResolution?.shootout ?? worldCupTieResolution?.shootout)?.homeGoalInfo.penalties ?? [])]
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
      if (worldCupTieResolution) {
        const tie = findWorldCupTie(worldCupTieResolution.edition, worldCupTieResolution.tieId);
        if (!tie) throw new Error(`Unknown World Cup qualifying tie "${worldCupTieResolution.tieId}".`);
        tie.winner = worldCupTieResolution.winner;
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
        if (!edition) throw new Error(`Unknown Asian Cup edition "${match.afcCupEditionId}".`);
        const winner = hasShootout ? parseKOMatchWinner(result).Team : homeGoals > awayGoals ? match.home : match.away;
        match.afcCupWinner = winner;
        setAfcCupKnockoutWinner(edition, match.afcCupKnockoutMatchId, winner);
      }
      if (match.ofcCupEditionId && match.ofcCupKnockoutMatchId) {
        const edition = state.ofcCup.editions.find(candidate => candidate.id === match.ofcCupEditionId);
        if (!edition) throw new Error(`Unknown OFC Cup edition "${match.ofcCupEditionId}".`);
        const winner = hasShootout ? parseKOMatchWinner(result).Team : homeGoals > awayGoals ? match.home : match.away;
        match.ofcCupWinner = winner;
        setOfcCupKnockoutWinner(edition, match.ofcCupKnockoutMatchId, winner);
      }
      if (match.euroStage === "playoff" || match.euroStage === "knockout") {
        const winner = hasShootout
          ? parseKOMatchWinner(result).Team
          : homeGoals > awayGoals ? match.home : match.away;
        match.euroWinner = winner;
        if (match.euroEditionId && match.euroKnockoutMatchId) {
          const edition = state.euro.editions.find(candidate => candidate.id === match.euroEditionId);
          if (!edition) throw new Error(`Unknown EURO edition "${match.euroEditionId}".`);
          setEuroKnockoutWinner(edition, match.euroKnockoutMatchId, winner);
        }
      }
      if (match.worldCupStage === "knockout" && match.worldCupEditionId && match.worldCupKnockoutMatchId) {
        const edition = getWorldCupEdition(state.worldCup, match.worldCupEditionId);
        const winner = hasShootout ? parseKOMatchWinner(result).Team : homeGoals > awayGoals ? match.home : match.away;
        match.worldCupWinner = winner;
        if (edition.tournament) recordWorldCupKnockoutWinner(edition.tournament, match.worldCupKnockoutMatchId, winner);
      } else if (match.worldCupPathMatch !== undefined) {
        const winner = hasShootout ? parseKOMatchWinner(result).Team : homeGoals > awayGoals ? match.home : match.away;
        match.worldCupWinner = winner;
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
    if (round.kind === "ofcCupQualifier" && round.ofcCupQualifierId) {
      const qualifier = getOfcCupQualifier(state.ofcCup, round.ofcCupQualifierId);
      qualifier.roundsPlayed++;
      if (qualifier.roundsPlayed === 10) {
        completeOfcCupQualifiers(
          state.ofcCup,
          qualifier.id,
          window.year,
          window.windowId,
          Object.fromEntries(computeRankings(state).map(row => [row.code, row.rank]))
        );
      }
    }
    if (round.kind === "euroQualifier" && round.euroStage === "qualifying" && round.euroQualifierId) {
      const qualifier = getEuroQualifyingEdition(state.euroQualifiers, round.euroQualifierId);
      qualifier.roundsPlayed++;
      if (qualifier.roundsPlayed === 10) {
        completeEuroMainQualifying(
          qualifier,
          state.nationsLeague.editions,
          Object.fromEntries(computeRankings(state).map(row => [row.code, row.rank]))
        );
      }
    }
    if (round.kind === "euroQualifier" && round.euroStage === "playoff" && round.euroQualifierId) {
      const qualifier = getEuroQualifyingEdition(state.euroQualifiers, round.euroQualifierId);
      const playoffsComplete = recordEuroPlayoffRound(qualifier, round.matches);
      if (!playoffsComplete && qualifier.playoffRoundsPlayed === 1) {
        window.rounds.push(getEuroPlayoffFinalRound(
          qualifier,
          window.year,
          window.windowId,
          window.afterMatchday
        ));
      } else if (playoffsComplete) {
        const tournamentWindow = getNextCompetitionWindow(window.year, window.windowId, (year, id) =>
          getEuroWindowType(year, id) === "EURO"
        );
        createEuroEdition(
          state.euro,
          qualifier,
          qualifier.playoffPaths.map(path => {
            const final = path.bracket.rounds[1]?.[0];
            if (!final?.winner) throw new Error(`EURO playoff Path ${path.name} has no winner.`);
            return final.winner;
          }),
          tournamentWindow,
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
        if (!edition) throw new Error(`Unknown Asian Cup edition "${match.afcCupEditionId}".`);
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
    if (round.kind === "ofcCup") {
      const match = round.matches[0];
      if (match?.ofcCupEditionId) {
        const edition = state.ofcCup.editions.find(candidate => candidate.id === match.ofcCupEditionId);
        if (!edition) throw new Error(`Unknown OFC Cup edition "${match.ofcCupEditionId}".`);
        let nextRound: InternationalRound | null = null;
        if (match.ofcCupStage === "group") {
          nextRound = startOfcCupSemiFinals(edition);
        } else if (match.ofcCupStage === "knockout") {
          const knockoutRoundIndex = edition.knockout?.findIndex(knockoutRound =>
            knockoutRound.matches.some(knockoutMatch => round.matches.includes(knockoutMatch.fixture))
          ) ?? -1;
          nextRound = advanceOfcCupKnockoutRound(edition, knockoutRoundIndex);
        }
        if (nextRound) window.rounds.push(nextRound);
      }
    }
    if (round.kind === "euro") {
      const match = round.matches[0];
      if (match?.euroEditionId) {
        const edition = state.euro.editions.find(candidate => candidate.id === match.euroEditionId);
        if (!edition) throw new Error(`Unknown EURO edition "${match.euroEditionId}".`);
        let nextRound: InternationalRound | null = null;
        if (match.euroStage === "group") {
          nextRound = startEuroRoundOf16(edition);
        } else if (match.euroStage === "knockout") {
          const knockoutRoundIndex = edition.knockout?.findIndex(knockoutRound =>
            knockoutRound.matches.some(knockoutMatch => round.matches.includes(knockoutMatch.fixture))
          ) ?? -1;
          nextRound = advanceEuroKnockoutRound(edition, knockoutRoundIndex);
        }
        if (nextRound) window.rounds.push(nextRound);
      }
    }
    if (round.kind === "worldCupQualifier" && round.worldCupEditionId && round.worldCupPhase) {
      const edition = getWorldCupEdition(state.worldCup, round.worldCupEditionId);
      edition.seedRanks = Object.fromEntries(computeRankings(state).map(row => [row.code, row.rank]));
      const phaseName = round.worldCupPhase;
      const region = phaseName === "ICPO"
        ? edition.intercontinental
        : Object.values(edition.regions).find(item => item.phases[phaseName]);
      const phase = region?.phases[phaseName];
      if (!phase) throw new Error(`Unknown World Cup qualifying phase "${phaseName}".`);

      if (phase.groups.length > 0) {
        phase.roundsPlayed++;
        const totalRounds = Math.max(...phase.groups.map(group => group.matches.length));
        if (phase.roundsPlayed >= totalRounds) {
          phase.completed = true;
          if (phaseName === "SAWCQ") completeSouthAmericaQualifying(edition);
          else if (phaseName === "CAFWCQ") completeAfricaQualifying(edition, window.year, window.windowId, window.afterMatchday);
          else if (phaseName === "CCWCQ2") completeConcacafSecondRound(edition);
          else if (phaseName === "CCWCQ3") completeConcacafThirdRound(edition);
          else if (phaseName === "AFCWCQ2") completeAsiaSecondRound(edition);
          else if (phaseName === "AFCWCQ3") completeAsiaThirdRound(edition);
          else if (phaseName === "OFCWCQ2") completeOceaniaSecondRound(edition, window.year, window.windowId, window.afterMatchday);
          else if (phaseName === "UEFAWCQM") {
            completeEuropeQualifying(edition, state.nationsLeague.editions);
          }
        }
      } else if (phase.ties.length > 0 && round.worldCupRound === 2) {
        if (phase.ties.some(tie => tie.winner === null)) {
          throw new Error(`World Cup qualifying ties in ${phaseName} have not all completed.`);
        }
        phase.completed = true;
        if (phaseName === "CCWCQ1") completeConcacafPreliminary(edition);
        else if (phaseName === "AFCWCQ1") completeAsiaPreliminary(edition);
        else if (phaseName === "CAFWCQP") completeAfricaPlayoff(edition);
        else if (phaseName === "OFCWCQ3") completeOceaniaThirdRound(edition);
      } else if (phase.paths.length > 0) {
        const pathsComplete = phaseName === "ICPO"
          ? recordIntercontinentalPlayoffRound(edition, round.matches)
          : recordWorldCupPathRound(phase, round.matches);
        if (pathsComplete) {
          if (phaseName === "OFCWCQ1") completeOceaniaPreliminary(edition);
          else if (phaseName === "OFCWCQ3") completeOceaniaThirdRound(edition);
          else if (phaseName === "CAFWCQP") completeAfricaPlayoff(edition);
          else if (phaseName === "UEFAWCQP") completeEuropePlayoff(edition);
        } else {
          const next = phaseName === "ICPO"
            ? getIntercontinentalPlayoffRounds(edition, window.year, window.windowId, window.afterMatchday)[0] ?? null
            : getWorldCupPathRound(phase, edition.id, phaseName, window.year, window.windowId, window.afterMatchday);
          if (next) window.rounds.push(next);
        }
      }
    }
    if (round.kind === "worldCup" && round.worldCupEditionId && round.worldCupStage) {
      const edition = getWorldCupEdition(state.worldCup, round.worldCupEditionId);
      if (round.worldCupStage === "group" && round.worldCupRound === 3 && edition.tournament) {
        const knockout = startWorldCupRoundOf32(edition.tournament);
        if (knockout) window.rounds.push(knockout);
      } else if (round.worldCupStage === "knockout" && edition.tournament) {
        const knockoutRoundIndex = edition.tournament.knockout?.findIndex(knockoutRound =>
          knockoutRound.matches.some(knockoutMatch => round.matches.includes(knockoutMatch.fixture))
        ) ?? -1;
        const next = advanceWorldCupKnockout(edition.tournament, knockoutRoundIndex);
        if (next) window.rounds.push(next);
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
  const upcomingOfcQualifier = findUpcomingWindow(window.year, window.windowId, (candidateYear, candidateDef) =>
    getOfcCupWindowType(candidateYear, candidateDef.id) === "OFCCUPQ"
  );
  if (upcomingOfcQualifier && upcomingOfcQualifier.offset === 1 &&
    !findOfcCupQualifier(state.ofcCup, upcomingOfcQualifier.year)) {
    const tournamentWindow = getNextCompetitionWindow(
      upcomingOfcQualifier.year,
      upcomingOfcQualifier.def.id,
      (year, id) => getOfcCupWindowType(year, id) === "OFCCUP"
    );
    createOfcCupQualifierEdition(
      state.ofcCup,
      upcomingOfcQualifier.year,
      tournamentWindow.year,
      Object.fromEntries(computeRankings(state).map(row => [row.code, row.rank]))
    );
  }
  const upcomingEuroQualifier = findUpcomingWindow(window.year, window.windowId, (candidateYear, candidateDef) =>
    getEuroWindowType(candidateYear, candidateDef.id) === "EUROQ"
  );
  if (upcomingEuroQualifier && upcomingEuroQualifier.offset === 1) {
    const tournamentWindow = getNextCompetitionWindow(
      upcomingEuroQualifier.year,
      upcomingEuroQualifier.def.id,
      (year, id) => getEuroWindowType(year, id) === "EURO"
    );
    if (!findEuroQualifyingEdition(state.euroQualifiers, tournamentWindow.year)) {
      const previousHosts = [...state.euro.editions]
        .sort((a, b) => b.year - a.year)[0]?.hosts ?? [];
      createEuroQualifyingEdition(
        state.euroQualifiers,
        tournamentWindow.year,
        Object.fromEntries(computeRankings(state).map(row => [row.code, row.rank])),
        {
          year: window.year,
          windowId: window.windowId,
          afterMatchday: window.afterMatchday
        },
        previousHosts
      );
    }
  }
  const upcomingWorldCupDrawTypes = ["UEFA", "CONCACAF", "CONMEBOL", "OFC", "AFC", "CAF"] as const;
  const worldCupQualifyingComplete = (edition: WorldCupEdition): boolean => {
    const requiredPhases = [
      edition.regions.CONMEBOL.phases.SAWCQ,
      edition.regions.CAF.phases.CAFWCQ,
      edition.regions.CAF.phases.CAFWCQP,
      edition.regions.CONCACAF.phases.CCWCQ1,
      edition.regions.CONCACAF.phases.CCWCQ2,
      edition.regions.CONCACAF.phases.CCWCQ3,
      edition.regions.AFC.phases.AFCWCQ1,
      edition.regions.AFC.phases.AFCWCQ2,
      edition.regions.AFC.phases.AFCWCQ3,
      edition.regions.OFC.phases.OFCWCQ1,
      edition.regions.OFC.phases.OFCWCQ2,
      edition.regions.OFC.phases.OFCWCQ3,
      edition.regions.UEFA.phases.UEFAWCQM,
      edition.regions.UEFA.phases.UEFAWCQP
    ];
    const intercontinental = edition.intercontinental.phases.ICPO;
    return requiredPhases.every(phase => phase?.completed) &&
      intercontinental?.completed === true &&
      intercontinental.playoffComplete;
  };
  for (const confederation of upcomingWorldCupDrawTypes) {
    const upcoming = findUpcomingWindow(window.year, window.windowId, (candidateYear, candidateDef) =>
      getWorldCupWindowType(confederation, candidateYear, candidateDef.id) !== null
    );
    if (!upcoming || upcoming.offset !== 1) continue;
    const upcomingType = getWorldCupWindowType(confederation, upcoming.year, upcoming.def.id);
    if (!upcomingType) continue;
    const tournamentYear = getWorldCupSeasonForWindow(upcoming.year, upcoming.def.id);
    const edition = ensureWorldCupEdition(
      state.worldCup,
      tournamentYear,
      Object.fromEntries(computeRankings(state).map(row => [row.code, row.rank]))
    );
    if (upcomingType === "SAWCQ" && !edition.regions.CONMEBOL.phases.SAWCQ) {
      createSouthAmericaQualifying(edition);
    } else if (upcomingType === "CAFWCQ" && !edition.regions.CAF.phases.CAFWCQ) {
      createAfricaQualifying(edition);
    } else if (upcomingType === "CCWCQ1" && !edition.regions.CONCACAF.phases.CCWCQ1) {
      createConcacafQualifying(edition, upcoming.year, upcoming.def.id, upcoming.def.afterMatchday);
    } else if (upcomingType === "AFCWCQ1" && !edition.regions.AFC.phases.AFCWCQ1) {
      createAsiaQualifying(edition, upcoming.year, upcoming.def.id, upcoming.def.afterMatchday);
    } else if (upcomingType === "OFCWCQ1" && !edition.regions.OFC.phases.OFCWCQ1) {
      createOceaniaQualifying(edition);
    } else if (upcomingType === "UEFAWCQM" && !edition.regions.UEFA.phases.UEFAWCQM) {
      createEuropeQualifying(edition);
    } else if (upcomingType === "ICPO" && !edition.intercontinental.phases.ICPO) {
      createIntercontinentalPlayoff(edition, upcoming.year, upcoming.def.id, upcoming.def.afterMatchday);
    } else if (upcomingType === "WC" && !edition.tournament) {
      if (!worldCupQualifyingComplete(edition)) continue;
      const uefaPlayoffWinners = edition.regions.UEFA.phases.UEFAWCQP?.qualifiers ?? [];
      const playoffSet = new Set(uefaPlayoffWinners);
      const direct = Object.values(edition.regions).flatMap(region =>
        region.qualified.filter(code => !playoffSet.has(code))
      );
      const tournamentTeams = [
        ...edition.hosts,
        ...direct,
        ...edition.intercontinental.qualified,
        ...uefaPlayoffWinners
      ];
      if (tournamentTeams.length !== 48 || new Set(tournamentTeams).size !== 48) {
        throw new Error(
          `World Cup qualification completed with ${tournamentTeams.length} entries (${new Set(tournamentTeams).size} unique); expected 48.`
        );
      }
      edition.tournament = createWorldCupTournament(
        upcoming.year,
        edition.hosts,
        direct,
        edition.intercontinental.qualified,
        uefaPlayoffWinners,
        Object.fromEntries(computeRankings(state).map(row => [row.code, row.rank]))
      );
    }
  }
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
  goalsFor: number | null;
  goalsAgainst: number | null;
  outcome: MatchOutcome | null;
  pointsChange: number | null;
  scheduled: boolean;
  kind: string;
  competitionLink?: string;
  stage?: string;
  penaltyShootout?: { goalsFor: number; goalsAgainst: number };
}

function getWorldCupPhaseLabel(phase?: string): string {
  return getInternationalDisplayName(phase ?? "").replace(/^World Cup /, "") || "Qualifying";
}

/** Played matches and scheduled fixtures for a nation, oldest first. */
export function getNationMatches(state: InternationalState, code: string, currentYear: number): NationMatchRow[] {
  const rows: NationMatchRow[] = [];
  for (const window of state.windows) {
    for (const round of window.rounds) {
      for (const match of round.matches) {
        if (match.home !== code && match.away !== code) continue;
        const scheduled = match.homeGoals === null || match.awayGoals === null;
        if (scheduled) continue;
        const isHome = match.home === code;
        const goalsFor = isHome ? match.homeGoals : match.awayGoals;
        const goalsAgainst = isHome ? match.awayGoals : match.homeGoals;
        const shootoutFor = isHome ? match.homePenalties : match.awayPenalties;
        const shootoutAgainst = isHome ? match.awayPenalties : match.homePenalties;
        const outcome = shootoutFor && shootoutAgainst
          ? shootoutFor.filter(kick => kick === "O").length > shootoutAgainst.filter(kick => kick === "O").length
            ? "win"
            : "loss"
          : goalsFor! > goalsAgainst! ? "win" : goalsFor! < goalsAgainst! ? "loss" : "draw";
        rows.push({
          year: window.year,
          windowId: window.windowId,
          windowLabel: getInternationalWindowLabel(window.windowId),
          opponent: isHome ? match.away : match.home,
          home: isHome,
          goalsFor,
          goalsAgainst,
          outcome,
          pointsChange: (isHome ? match.homeChange : match.awayChange) ?? 0,
          scheduled: false,
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
                              ? `Asian Cup Preliminary · Leg ${match.afcCupLeg ?? "—"}`
                              : `Asian Cup Qualifying · Matchday ${match.afcCupRound ?? "—"}`
                            : match.kind === "afcCupGroup"
                              ? `Asian Cup Group Stage · Matchday ${match.afcCupRound ?? "—"}`
                              : match.kind === "afcCupKnockout"
                                ? `Asian Cup ${match.afcCupKnockoutMatchId?.startsWith("R16") ? "Round of 16"
                                  : match.afcCupKnockoutMatchId?.startsWith("QF") ? "Quarter-finals"
                                    : match.afcCupKnockoutMatchId?.startsWith("SF") ? "Semi-finals"
                                      : match.afcCupKnockoutMatchId === "F" ? "Final" : "Knockout"}`
                                : match.kind === "ofcCupQualifier"
                                  ? `OFC Cup Qualifying · Matchday ${match.ofcCupRound ?? "—"}`
                                  : match.kind === "ofcCupGroup"
                                    ? `OFC Cup Group Stage · Matchday ${match.ofcCupRound ?? "—"}`
                                    : match.kind === "ofcCupKnockout"
                                      ? `OFC Cup ${match.ofcCupKnockoutMatchId?.startsWith("SF") ? "Semi-finals"
                                        : match.ofcCupKnockoutMatchId === "F" ? "Final" : "Knockout"}`
                                      : match.kind === "euroQualifier"
                                        ? match.euroStage === "playoff"
                                          ? `EURO Play-off · Path ${match.euroPath ?? "—"} · ${match.euroPathRound === 1 ? "Semi-final" : "Final"}`
                                          : `EURO Qualifying · Matchday ${match.euroRound ?? "—"}`
                                        : match.kind === "euroGroup"
                                          ? `EURO Group Stage · Matchday ${match.euroRound ?? "—"}`
                                          : match.kind === "euroKnockout"
                                            ? `EURO ${match.euroKnockoutMatchId?.startsWith("R16") ? "Round of 16"
                                              : match.euroKnockoutMatchId?.startsWith("QF") ? "Quarter-finals"
                                                : match.euroKnockoutMatchId?.startsWith("SF") ? "Semi-finals"
                                                  : match.euroKnockoutMatchId === "F" ? "Final" : "Knockout"}`
                                              : match.kind === "worldCupQualifier"
                                                ? `World Cup ${getWorldCupPhaseLabel(match.worldCupPhase ?? match.worldCupStage)}${
                                                  match.worldCupPath
                                                    ? ` · Path ${match.worldCupPath} · Round ${match.worldCupPathRound ?? "—"}`
                                                  : match.worldCupTieId
                                                    ? ` · Leg ${match.worldCupLeg ?? "—"}`
                                                    : ` · Matchday ${match.worldCupRound ?? "—"}`
                                                }`
                                                : match.kind === "worldCupGroup"
                                                  ? `World Cup Group Stage · Matchday ${match.worldCupRound ?? "—"}`
                                                  : match.kind === "worldCupKnockout"
                                                    ? `World Cup ${match.worldCupKnockoutMatchId?.startsWith("R32") ? "Round of 32"
                                                      : match.worldCupKnockoutMatchId?.startsWith("R16") ? "Round of 16"
                                                        : match.worldCupKnockoutMatchId?.startsWith("QF") ? "Quarter-finals"
                                                          : match.worldCupKnockoutMatchId?.startsWith("SF") ? "Semi-finals"
                                                            : match.worldCupKnockoutMatchId === "F" ? "Final" : "Knockout"}`
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
                            : match.kind === "ofcCupQualifier"
                              ? "/ofc-cup-qualifiers"
                              : match.kind === "ofcCupGroup" || match.kind === "ofcCupKnockout"
                                ? "/ofc-cup"
                                : match.kind === "euroQualifier"
                                  ? "/euro-qualifiers"
                                  : match.kind === "euroGroup" || match.kind === "euroKnockout"
                                    ? "/euro"
                                    : match.kind === "worldCupQualifier"
                                      ? match.worldCupPhase === "ICPO"
                                      || match.worldCupStage === "ICPO"
                                        ? "/world-cup-intercontinental-playoff"
                                        : `/world-cup-qualifiers/${getNationConfederation(code)}`
                                      : match.kind === "worldCupGroup" || match.kind === "worldCupKnockout"
                                        ? "/world-cup"
                                        : undefined
        });
      }
    }
  }

  const competitionSchedules: unknown[] = [
    state.windows,
    state.nationsLeague,
    state.goldCup,
    state.copaAmerica,
    state.afcon,
    state.afcCup,
    state.ofcCup,
    state.euroQualifiers,
    state.euro,
    state.worldCup
  ];
  const seenObjects = new WeakSet<object>();
  const scheduledMatches: InternationalMatch[] = [];
  const candidates = new Map<string, InternationalMatch>();
  const visit = (value: unknown, parentWindow?: WindowRecord): void => {
    if (!value || typeof value !== "object" || seenObjects.has(value)) return;
    seenObjects.add(value);
    if (Array.isArray(value)) {
      value.forEach(item => visit(item, parentWindow));
      return;
    }

    const record = value as Record<string, unknown>;
    const windowContext = Array.isArray(record.rounds) &&
      typeof record.year === "number" &&
      typeof record.windowId === "string"
      ? value as WindowRecord
      : parentWindow;
    if (isScheduledInternationalMatch(value)) {
      const match = {
        ...value,
        windowYear: value.windowYear ?? windowContext?.year,
        windowId: value.windowId ?? windowContext?.windowId,
        windowMatchday: value.windowMatchday ?? windowContext?.afterMatchday
      };
      const identity = JSON.stringify([
        match.kind, match.home, match.away,
        Object.entries(match)
          .filter(([key]) => !["windowYear", "windowId", "windowMatchday"].includes(key) &&
            /(?:Id|Stage|Phase|Round|Leg|Group|Path|MatchIndex|Match)$/.test(key))
          .sort(([a], [b]) => a.localeCompare(b)),
        match.kind === "friendly" ? [match.windowYear, match.windowId] : []
      ]);
      if (!candidates.has(identity)) candidates.set(identity, match);
    }
    Object.values(value).forEach(item => visit(item, windowContext));
  };
  competitionSchedules.forEach(value => visit(value));

  for (const match of candidates.values()) {
    if (match.home === code || match.away === code) {
      if (match.homeGoals === null || match.awayGoals === null) {
        if (match.kind === "euroQualifier" && match.euroStage === "qualifying") continue;
        if (match.windowYear !== undefined && match.windowId) scheduledMatches.push(match);
      }
    }
  }

  const euroQualifyingMatches = [...candidates.values()].filter(match =>
    match.kind === "euroQualifier" &&
    match.euroStage === "qualifying" &&
    (match.home === code || match.away === code) &&
    (match.homeGoals === null || match.awayGoals === null) &&
    match.windowYear !== undefined &&
    match.windowId
  );
  const euroQualifiers = new Map<string, InternationalMatch[]>();
  for (const match of euroQualifyingMatches) {
    const key = match.euroQualifierId ?? String(match.euroTournamentYear ?? match.windowYear);
    const fixtures = euroQualifiers.get(key) ?? [];
    fixtures.push(match);
    euroQualifiers.set(key, fixtures);
  }
  for (const fixtures of euroQualifiers.values()) {
    const anchor = fixtures[0];
    const anchorIndex = getInternationalWindowIndex(anchor.windowYear!, anchor.windowId!);
    const cycleStart = Math.floor(anchorIndex / INTERNATIONAL_CYCLE_WINDOW_COUNT) * INTERNATIONAL_CYCLE_WINDOW_COUNT;
    const slots = Array.from({ length: INTERNATIONAL_CYCLE_WINDOW_COUNT }, (_, offset) => cycleStart + offset)
      .map(getInternationalWindowLocation)
      .filter(location => getInternationalWindowType("UEFA", location.year, location.windowId) === "EUROQ");
    const totalRounds = Math.max(...fixtures.map(match => match.euroRound ?? 1));
    for (const match of fixtures) {
      const roundIndex = (match.euroRound ?? 1) - 1;
      const slot = slots.find(location => {
        const { start, count } = getDistributedInternationalRoundSchedule(
          "UEFA", "EUROQ", location.year, location.windowId, totalRounds
        );
        return roundIndex >= start && roundIndex < start + count;
      });
      if (!slot || slot.year < currentYear) continue;
      const windowMatchday = WINDOW_DEFS.find(window => window.id === slot.windowId)?.afterMatchday;
      if (windowMatchday === undefined) {
        throw new Error(`No matchday is configured for international window "${slot.windowId}".`);
      }
      scheduledMatches.push({
        ...match,
        windowYear: slot.year,
        windowId: slot.windowId,
        windowMatchday
      });
    }
  }

  const worldCupPhases: [string, keyof WorldCupEdition["regions"]][] = [
    ["SAWCQ", "CONMEBOL"],
    ["CAFWCQ", "CAF"],
    ["CCWCQ1", "CONCACAF"],
    ["CCWCQ2", "CONCACAF"],
    ["CCWCQ3", "CONCACAF"],
    ["AFCWCQ1", "AFC"],
    ["AFCWCQ2", "AFC"],
    ["AFCWCQ3", "AFC"],
    ["OFCWCQ1", "OFC"],
    ["OFCWCQ2", "OFC"],
    ["OFCWCQ3", "OFC"],
    ["UEFAWCQM", "UEFA"]
  ];
  for (const edition of state.worldCup.editions) {
    const campaignEnd = getInternationalWindowIndex(edition.year, "IW6");
    const campaignStart = campaignEnd - INTERNATIONAL_CYCLE_WINDOW_COUNT + 1;
    for (const [phaseName, confederation] of worldCupPhases) {
      const phase = edition.regions[confederation].phases[phaseName];
      if (!phase?.groups.length) continue;
      const totalRounds = Math.max(...phase.groups.map(group => group.matches.length));
      for (let index = campaignStart; index <= campaignEnd; index++) {
        const location = getInternationalWindowLocation(index);
        if (getWorldCupWindowType(confederation, location.year, location.windowId) !== phaseName) continue;
        const { start, count } = getDistributedInternationalRoundSchedule(
          confederation, phaseName, location.year, location.windowId, totalRounds
        );
        for (let roundIndex = start; roundIndex < start + count; roundIndex++) {
          for (const group of phase.groups) {
            for (const [matchIndex, fixture] of (group.matches[roundIndex] ?? []).entries()) {
              if (fixture.home !== code && fixture.away !== code) continue;
              if (fixture.homeGoals !== null || fixture.awayGoals !== null) continue;
              if (fixture.windowYear !== undefined && fixture.windowId) continue;
              if (location.year < currentYear) continue;
              const afterMatchday = WINDOW_DEFS.find(window => window.id === location.windowId)?.afterMatchday;
              if (afterMatchday === undefined) {
                throw new Error(`No matchday is configured for international window "${location.windowId}".`);
              }
              scheduledMatches.push({
                ...fixture,
                kind: "worldCupQualifier",
                windowYear: location.year,
                windowId: location.windowId,
                windowMatchday: afterMatchday,
                worldCupEditionId: edition.id,
                worldCupStage: phaseName,
                worldCupPhase: phaseName,
                worldCupRound: roundIndex + 1,
                worldCupGroup: group.name,
                worldCupMatchIndex: matchIndex
              });
            }
          }
        }
      }
    }

    if (edition.tournament) {
      const tournamentWindow = Array.from({ length: 6 }, (_, index) => `IW${index + 1}`)
        .find(windowId => worldCupPhases.some(([, confederation]) =>
          getWorldCupWindowType(confederation, edition.year, windowId) === "WC"
        ));
      if (!tournamentWindow) throw new Error(`No World Cup window is configured for ${edition.year}.`);
      const afterMatchday = WINDOW_DEFS.find(window => window.id === tournamentWindow)?.afterMatchday;
      if (afterMatchday === undefined) throw new Error(`No matchday is configured for "${tournamentWindow}".`);
      const tournamentMatches = [
        ...edition.tournament.groups.flatMap(group => group.matches.flat()),
        ...(edition.tournament.knockout?.flatMap(round => round.matches.map(match => match.fixture)) ?? [])
      ];
      for (const fixture of tournamentMatches) {
        if ((fixture.home !== code && fixture.away !== code) ||
            (fixture.homeGoals !== null && fixture.awayGoals !== null)) continue;
        if (fixture.windowYear !== undefined && fixture.windowId) continue;
        scheduledMatches.push({
          ...fixture,
          kind: fixture.worldCupKnockoutMatchId ? "worldCupKnockout" : "worldCupGroup",
          windowYear: edition.year,
          windowId: tournamentWindow,
          windowMatchday: afterMatchday,
          worldCupEditionId: edition.id
        });
      }
    }
  }

  const uniqueScheduledMatches = new Map<string, InternationalMatch>();
  for (const match of scheduledMatches) {
    const identity = JSON.stringify([
      match.kind, match.home, match.away, match.windowYear, match.windowId,
      match.worldCupEditionId, match.worldCupPhase, match.worldCupRound,
      match.euroQualifierId, match.euroStage, match.euroRound,
      match.nationsLeagueId, match.nationsLeagueRound,
      match.goldCupEditionId, match.goldCupRound,
      match.copaAmericaEditionId, match.copaAmericaRound,
      match.afconEditionId, match.afconRound,
      match.afcCupEditionId, match.afcCupRound,
      match.ofcCupEditionId, match.ofcCupRound
    ]);
    uniqueScheduledMatches.set(identity, match);
  }
  for (const match of uniqueScheduledMatches.values()) {
    if (match.home !== code && match.away !== code) continue;
    if (match.windowYear === undefined || !match.windowId || match.windowYear < currentYear) continue;
    const isHome = match.home === code;
    const stage = match.kind === "nationsLeague"
      ? `${match.nationsLeagueDivision ?? "Nations League"} · Matchday ${match.nationsLeagueRound ?? "—"}`
      : match.kind === "goldCupGroup"
        ? `Gold Cup Group Stage · Matchday ${match.goldCupRound ?? "—"}`
        : match.kind === "goldCupKnockout"
          ? `Gold Cup ${match.goldCupKnockoutMatchId ?? "Knockout"}`
          : match.kind === "goldCupPlayoff"
            ? `Gold Cup Playoff · Leg ${match.goldCupLeg ?? "—"}`
            : match.kind === "copaAmericaGroup"
              ? `Copa América Group Stage · Matchday ${match.copaAmericaRound ?? "—"}`
              : match.kind === "copaAmericaKnockout"
                ? `Copa América ${match.copaAmericaKnockoutMatchId ?? "Knockout"}`
                : match.kind === "afconQualifier"
                  ? `AFCON Qualifying · Matchday ${match.afconRound ?? match.afconLeg ?? "—"}`
                  : match.kind === "afconGroup"
                    ? `AFCON Group Stage · Matchday ${match.afconRound ?? "—"}`
                    : match.kind === "afconKnockout"
                      ? `AFCON ${match.afconKnockoutMatchId ?? "Knockout"}`
                      : match.kind === "afcCupQualifier"
                        ? `Asian Cup Qualifying · Matchday ${match.afcCupRound ?? match.afcCupLeg ?? "—"}`
                        : match.kind === "afcCupGroup"
                          ? `Asian Cup Group Stage · Matchday ${match.afcCupRound ?? "—"}`
                          : match.kind === "afcCupKnockout"
                            ? `Asian Cup ${match.afcCupKnockoutMatchId ?? "Knockout"}`
                            : match.kind === "ofcCupQualifier"
                              ? `OFC Cup Qualifying · Matchday ${match.ofcCupRound ?? "—"}`
                              : match.kind === "ofcCupGroup"
                                ? `OFC Cup Group Stage · Matchday ${match.ofcCupRound ?? "—"}`
                                : match.kind === "ofcCupKnockout"
                                  ? `OFC Cup ${match.ofcCupKnockoutMatchId ?? "Knockout"}`
                                  : match.kind === "euroQualifier"
                                    ? `EURO Qualifying · Matchday ${match.euroRound ?? match.euroPathRound ?? "—"}`
                                    : match.kind === "euroGroup"
                                      ? `EURO Group Stage · Matchday ${match.euroRound ?? "—"}`
                                      : match.kind === "euroKnockout"
                                        ? `EURO ${match.euroKnockoutMatchId ?? "Knockout"}`
                                        : match.kind === "worldCupQualifier"
                                          ? `World Cup ${getWorldCupPhaseLabel(match.worldCupPhase ?? match.worldCupStage)} · Matchday ${match.worldCupRound ?? match.worldCupLeg ?? "—"}`
                                          : match.kind === "worldCupGroup"
                                            ? `World Cup Group Stage · Matchday ${match.worldCupRound ?? "—"}`
                                            : match.kind === "worldCupKnockout"
                                              ? `World Cup ${match.worldCupKnockoutMatchId ?? "Knockout"}`
                                              : undefined;
    rows.push({
      year: match.windowYear!,
      windowId: match.windowId!,
      windowLabel: getInternationalWindowLabel(match.windowId),
      opponent: isHome ? match.away : match.home,
      home: isHome,
      goalsFor: null,
      goalsAgainst: null,
      outcome: null,
      pointsChange: null,
      scheduled: true,
      kind: match.kind,
      stage,
      competitionLink: match.kind === "nationsLeague"
        ? `/nations-league/${getNationConfederation(code)}`
        : match.kind.startsWith("goldCup")
          ? match.kind === "goldCupPlayoff" ? "/gold-cup-playoff" : "/gold-cup"
          : match.kind.startsWith("copaAmerica") ? "/copa-america"
            : match.kind.startsWith("afcon") ? match.kind === "afconQualifier" ? "/afcon-qualifiers" : "/afcon"
              : match.kind.startsWith("afcCup") ? match.kind === "afcCupQualifier" ? "/afc-cup-qualifiers" : "/afc-cup"
                : match.kind.startsWith("ofcCup") ? match.kind === "ofcCupQualifier" ? "/ofc-cup-qualifiers" : "/ofc-cup"
                  : match.kind.startsWith("euro") ? match.kind === "euroQualifier" ? "/euro-qualifiers" : "/euro"
                    : match.kind.startsWith("worldCup")
                      ? match.kind === "worldCupQualifier"
                        ? match.worldCupPhase === "ICPO" || match.worldCupStage === "ICPO"
                          ? "/world-cup-intercontinental-playoff"
                          : `/world-cup-qualifiers/${getNationConfederation(code)}`
                        : "/world-cup"
                      : undefined
    });
  }
  rows.sort((a, b) => a.year - b.year || a.windowId.localeCompare(b.windowId) || Number(a.scheduled) - Number(b.scheduled));
  return rows;
}

function isScheduledInternationalMatch(value: unknown): value is InternationalMatch {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<InternationalMatch>;
  return typeof candidate.home === "string" &&
    typeof candidate.away === "string" &&
    typeof candidate.kind === "string" &&
    (candidate.homeGoals === null || typeof candidate.homeGoals === "number") &&
    (candidate.awayGoals === null || typeof candidate.awayGoals === "number") &&
    (candidate.homeGoals === null || candidate.awayGoals === null) &&
    (candidate.homeChange === null || typeof candidate.homeChange === "number") &&
    (candidate.awayChange === null || typeof candidate.awayChange === "number");
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
