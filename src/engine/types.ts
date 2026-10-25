import type { Team } from "./team";

export type Position =
  | "GK" | "RB" | "CB" | "LB" | "CDM" | "CM" | "CAM"
  | "RM" | "LM" | "RW" | "LW" | "ST";

export type PlayerType = "NORMAL" | "LATE BLOOMER" | "PRODIGY" | "BURNOUT";

export interface PeakRange {
  start: number;
  end: number;
}

/** One row of a player's year-by-year overall progression (state at the start of a season). */
export interface ProgressionEntry {
  year: number;
  age: number;
  overall: number;
  potential: number;
}

export interface PotentialRange {
  lower: number;
  upper: number;
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  primaryNationality: string;
  secondaryNationality: string | null;
  age: number;
  overall: number;
  potential: number;
  potentialRange?: PotentialRange;
  contractExpiry: number | null;
  position: Position;
  isScouted: boolean;
  playerType: PlayerType | null;
  peakRange: PeakRange | null;
  /** Web UI addition: year-by-year overall history. */
  progression: ProgressionEntry[];
  /** Web UI addition: every club (or free agency) the player has belonged to, in order. */
  history: PlayerStint[];
  /** Web UI addition: caps for the player's primary-nationality national team (missing in old saves = 0). */
  caps: number;
  /** Web UI addition: on the user's shortlist (never true for managed-club players; missing in old saves = false). */
  isShortlisted: boolean;
  /** Season in which the player is scheduled to retire at season end, or the season they retired. */
  retirementYear?: number | null;
  /** Retired players are retained for direct lookup, but excluded from active player listings. */
  isRetired?: boolean;
}

/**
 * A period with one club (teamID = null means "Free Agents"). The end is null while ongoing.
 * Matchday 0 means the start of the season.
 */
export interface PlayerStint {
  teamID: number | null;
  teamName: string;
  startYear: number;
  startMatchday: number;
  endYear: number | null;
  endMatchday: number | null;
}

export interface ScoutingMission {
  id: string;
  countryCode: string;
  sentMatchday: number;
  returnMatchday: number;
  candidates: Player[];
  returned: boolean;
}

export interface MatchResult {
  homeGoalInfo: {
    homeTeam: Team;
    homeGoals: number;
    penalties: string[] | null;
  };
  awayGoalInfo: {
    awayTeam: Team;
    awayGoals: number;
    penalties: string[] | null;
  };
}

export interface FixtureMatch {
  homeTeam: Team;
  awayTeam: Team;
  result?: MatchResult | null;
}

export type LeagueSchedule = Record<number, FixtureMatch[]>;

export interface TableEntry {
  team: Team;
  GP: number;
  PTS: number;
  W: number;
  D: number;
  L: number;
  GD: number;
  GF: number;
  GA: number;
}

export interface LeagueState {
  tier: number;
  teams: Team[];
  schedule: LeagueSchedule;
  table: Record<number, TableEntry>;
  startMatchday: number;
  endMatchday: number;
  prediction: number[];
}

export interface BracketSlot {
  seed?: number;
  team: Team | null;
}

export interface BracketLeg {
  matchday: number;
  result: MatchResult;
}

export interface BracketMatch {
  id: string;
  round: number;
  player1: BracketSlot | null;
  player2: BracketSlot | null;
  winner: Team | null;
  sources: string[];
  result?: MatchResult;
  legs?: BracketLeg[];
  /** Penalty shootout deciding a two-legged tie that finished level on aggregate. */
  tiebreak?: MatchResult;
}

export interface Bracket {
  size: number;
  activeRound: number;
  rounds: BracketMatch[][];
}

export interface CupState {
  bracket: Bracket;
  roundMatchdays: Record<string, number>;
  completed: boolean;
}

export interface CupFinish {
  round: number;
  label: string;
}

export type TeamStatus = "PROMOTED" | "RELEGATED" | "STAYED";

export interface TeamSeasonRecord {
  year: number;
  season: string;
  tier: number;
  league: string;
  position: number;
  status: TeamStatus;
  cupFinish: CupFinish | null;
}

export interface PlayoffResult {
  semiOne: MatchResult;
  semiTwo: MatchResult;
  final: MatchResult;
  playoffWinner: Team;
}

export interface OverallChange {
  team: Team;
  tier: number;
  oldOverall: number;
  newOverall: number;
  change: number;
  reasons: string[];
}

export interface FinalScore {
  homeTeam: Team;
  homeGoals: number;
  awayTeam: Team;
  awayGoals: number;
  homePenalties: string[] | null;
  awayPenalties: string[] | null;
}

export interface FinalHistory {
  competition?: string;
  season?: string;
  winner: Team | null;
  runnerUp: Team | null;
  semifinalists: Team[];
  finalScore: FinalScore | null;
}

export interface SeasonHistoryEntry {
  year: number;
  season: string;
  leagues: Record<string, Team[]>;
  cup: FinalHistory;
  european: Record<string, FinalHistory>;
  overallChanges: OverallChange[];
}

/** Notices produced by the engine while simulating (the terminal printed these). */
export type Notice =
  | { kind: "scout-return"; missionId: string; countryCode: string; candidateCount: number; matchday: number };

// ---------------------------------------------------------------------------
// Free agents
// ---------------------------------------------------------------------------

/** A player without a club. */
export interface FreeAgentEntry {
  player: Player;
  /** Season (start year) in which the player became a free agent. */
  addedYear: number;
  /** Name of the club that released the player; null for generated free agents. */
  releasedBy: string | null;
  /** The managed club may not sign this player before this season (start year). */
  resignBlockedUntilYear: number | null;
}

/** A player a club signed from the free-agent pool. */
export interface ClubPlayerEntry {
  player: Player;
  teamID: number;
  signedYear: number;
  signedMatchday: number;
  source: "free-agent" | "regen" | "god-mode";
}

export interface FreeAgentState {
  available: FreeAgentEntry[];
  /** Players signed by clubs other than the managed club, keyed by team ID. */
  clubPlayers: Record<number, ClubPlayerEntry[]>;
  /** Players who retired at a previous season rollover. */
  retiredPlayers: Player[];
  /** Counter used to generate unique free-agent player IDs. */
  nextSeq: number;
  /** When true, unsigned youth-scouting candidates become free agents instead of being discarded. */
  autoSendUnsignedScouts: boolean;
}
