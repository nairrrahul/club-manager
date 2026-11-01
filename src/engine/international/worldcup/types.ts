import type { Bracket } from "../../types";
import type { InternationalCompetitionGroup } from "../internationalCompetitionsUtils";
import type { InternationalMatch } from "../international";

export type WorldCupConfederation = "UEFA" | "CONCACAF" | "CONMEBOL" | "OFC" | "AFC" | "CAF" | "ICPO";

export interface WorldCupTie {
  id: string;
  team1: string;
  team2: string;
  firstLeg: InternationalMatch;
  secondLeg: InternationalMatch;
  winner: string | null;
}

export interface WorldCupPath {
  name: string;
  teams: string[];
  bracket: Bracket<string>;
  results: Record<string, { homeGoals: number; awayGoals: number; homePenalties?: string[]; awayPenalties?: string[] }>;
}

export interface WorldCupPhase {
  groups: InternationalCompetitionGroup[];
  roundsPlayed: number;
  completed: boolean;
  qualifiers: string[];
  playoffTeams: string[];
  bottomSeeds: string[];
  ties: WorldCupTie[];
  paths: WorldCupPath[];
  playoffRoundsPlayed: number;
  playoffComplete: boolean;
}

export interface WorldCupRegionalQualifying {
  confederation: WorldCupConfederation;
  teams: string[];
  phases: Record<string, WorldCupPhase>;
  qualified: string[];
  intercontinental: string[];
  playoffQualifiers: string[];
  playoffBottomSeeds: string[];
}

export interface WorldCupTournament {
  id: string;
  year: number;
  hosts: string[];
  teams: string[];
  pots: string[][];
  seedRanks: Record<string, number>;
  groups: InternationalCompetitionGroup[];
  knockout: {
    label: "Round of 32" | "Round of 16" | "Quarter-finals" | "Semi-finals" | "Final";
    matches: { id: string; home: string; away: string; fixture: InternationalMatch; winner: string | null }[];
  }[] | null;
  completed: boolean;
  winner: string | null;
  runnerUp: string | null;
  semifinalists: string[];
  playoffTeams: string[];
}

export interface WorldCupEdition {
  id: string;
  year: number;
  hosts: string[];
  blockedConfederations: WorldCupConfederation[];
  seedRanks: Record<string, number>;
  regions: Record<Exclude<WorldCupConfederation, "ICPO">, WorldCupRegionalQualifying>;
  intercontinental: WorldCupRegionalQualifying;
  tournament: WorldCupTournament | null;
}

export interface WorldCupState {
  editions: WorldCupEdition[];
}
