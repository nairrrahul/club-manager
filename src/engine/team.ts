import type { Player, ScoutingMission, TeamSeasonRecord } from "./types";

export interface RawTeam {
  ID: number;
  Team: string;
  Overall: number;
  Tier: number;
  BaseOverall?: number;
}

export class Team {
  ID: number;
  Team: string;
  BaseOverall: number;
  Overall: number;
  Tier: number;
  formation: string;
  seasonHistory: TeamSeasonRecord[];

  // Manager-mode team data (placeholders for all teams, as in the terminal game).
  facilityRating: number;
  scoutingRating: number;
  scoutingExperience: number;
  seniorSquad: Player[] | null;
  youthAcademySquad: Player[] | null;
  maxSeniorSquadSize: number;
  maxYouthAcademySquadSize: number;
  squadOverall: number | null;

  scoutingMissions?: ScoutingMission[];
  scoutedPlayers?: Player[];
  lastScoutSendMatchday?: number;
  lastSeasonEmergencyPlayers?: Player[];

  // Web UI addition: starting XI selection state (slot order follows the formation requirements).
  xiMode: "auto" | "manual";
  startingXI: (string | null)[];

  // European guests.
  countrycode?: string;
  isEuropeanGuest?: boolean;

  /**
   * Overall added by exceptional players the club has signed (non-managed clubs only; 0 for the
   * managed club, whose overall comes from its starting XI). Saves from before this field = 0.
   */
  playerBonus!: number;

  winStreak!: number;
  lossStreak!: number;
  upsetWinStreak!: number;
  upsetLossStreak!: number;
  seasonOverallChange!: number;

  constructor({ ID, Team: name, Overall, Tier, BaseOverall = Overall }: RawTeam) {
    this.ID = ID;
    this.Team = name;
    this.BaseOverall = BaseOverall;
    this.Overall = Overall;
    this.Tier = Tier;
    this.formation = "4-4-2";
    this.seasonHistory = [];

    this.facilityRating = 3;
    this.scoutingRating = 3;
    this.scoutingExperience = 3;
    this.seniorSquad = null;
    this.youthAcademySquad = null;
    this.maxSeniorSquadSize = 40;
    this.maxYouthAcademySquadSize = 15;
    this.squadOverall = null;

    this.xiMode = "auto";
    this.startingXI = [];
    this.playerBonus = 0;

    this.resetSeasonForm();
  }

  /** In-season overall: base + player-based bonus + form, rounded to a whole number. */
  recomputeOverall(): void {
    this.Overall = Math.round(this.BaseOverall + (this.playerBonus ?? 0) + (this.seasonOverallChange ?? 0));
  }

  resetSeasonForm(): void {
    this.winStreak = 0;
    this.lossStreak = 0;
    this.upsetWinStreak = 0;
    this.upsetLossStreak = 0;
    this.seasonOverallChange = 0;
    this.recomputeOverall();
  }

  applyFluctuation(delta: number): void {
    const nextChange = Math.max(-2, Math.min(3, this.seasonOverallChange + delta));
    this.seasonOverallChange = nextChange;
    this.recomputeOverall();
  }

  applySeasonOverallChange(delta: number): void {
    this.BaseOverall += delta;
    this.recomputeOverall();
  }
}

export function createTeams(rawTeams: RawTeam[]): Team[] {
  return rawTeams.map(team => new Team(team));
}
