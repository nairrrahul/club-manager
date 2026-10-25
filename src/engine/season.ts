import rawTeamsJson from "./data/teams.json";
import {
  createLeagueState,
  simulateLeagueMatchday,
  getLeagueStandings,
  getPredictedPosition
} from "./league";
import {
  createCupState,
  simulateCupRound,
  getCupRoundMatchday,
  isCupComplete,
  getCupFinish
} from "./cup";
import { applyPromotionRelegation, simulatePromotionPlayoffs } from "./promotionRelegation";
import { createTeams } from "./team";
import type { RawTeam, Team } from "./team";
import { applySquadGrowth } from "./playerGrowth";
import {
  ensureMinimumSeniorSquad, calculateTeamOverall, resetStartingXIToAuto
} from "./playerSquad";
import { processReturnedMissions, getNextScoutReturnMatchday, expireAllScoutingMissions } from "./youthScouting";
import {
  createEuropeanCompetitions,
  simulateEuropeanMatchday,
  finalizeEuropeanHistory,
  getEuropeanSeasonHistory
} from "./europeanCompetitions";
import type { EuropeanCompetition } from "./europeanCompetitions";
import { SEASON_START_YEAR, SEASON_END_MATCHDAY } from "./constants";
import {
  createFreeAgentState, generateFreeAgents, developFreeAgentWorld, processFreeAgentSigning,
  sendUnsignedScoutsToFreeAgents, generateClubRegens
} from "./freeAgents";
import {
  createInternationalState, startWindowIfDue, autoSimulateWindowIfDue, hasPendingWindow
} from "./international";
import type { InternationalState } from "./international";
import { createClubWorldCup, simulateClubWorldCup } from "./clubWorldCup";
import type { ClubWorldCup } from "./clubWorldCup";
import {
  createContinentalTournaments, CONTINENTAL_TOURNAMENT_MATCHDAY, simulateContinentalTournaments
} from "./continentalTournaments";
import type { ContinentalTournament } from "./continentalTournaments";
import { refreshAllClubOveralls } from "./squadStrength";
import { snapshotSeason } from "./snapshots";
import { nextPlayerID } from "./playerIds";
import { retireScheduledPlayers, schedulePlayerRetirements } from "./retirement";
import type { SeasonArchive } from "./snapshots";
import type {
  CupState, FinalHistory, FreeAgentState, LeagueState, Notice, OverallChange, PlayoffResult,
  SeasonHistoryEntry, TeamStatus
} from "./types";

const rawTeams = rawTeamsJson as RawTeam[];

export interface Season {
  year: number;
  season: string;
  matchday: number;
  leagueStates: Record<string, LeagueState>;
  cup: CupState;
  history: SeasonHistoryEntry[];
  promotionPlayoffs: Record<string, PlayoffResult> | null;
  seasonOverallChanges: OverallChange[] | null;
  nextTierByTeam: Record<number, number> | null;
  managerTeam: Team | null;
  europeanCompetitions: Record<string, EuropeanCompetition> | null;
  /** Web UI addition: full snapshots of every completed season. */
  archives: SeasonArchive[];
  /** Web UI addition: events the terminal game printed during simulation. */
  notices: Notice[];
  /** Web UI addition: free agents and the players other clubs have signed from them. */
  freeAgents: FreeAgentState;
  /** Web UI addition: national teams, rankings, international windows. */
  international: InternationalState;
  clubWorldCup: ClubWorldCup | null;
  explicitClubWorldCup: boolean;
  continentalTournaments: Record<string, ContinentalTournament>;
}

function separateByTier(teams: Team[]): Record<string, Team[]> {
  return teams.reduce((tiers: Record<string, Team[]>, team) => {
    if (!tiers[team.Tier]) {
      tiers[team.Tier] = [];
    }

    tiers[team.Tier].push(team);
    return tiers;
  }, {});
}

function getOrderedTeamsList(teamsByTier: Record<string, Team[]>): Team[] {
  const res: Team[] = [];

  for (const key of Object.keys(teamsByTier).sort((a, b) => Number(a) - Number(b))) {
    res.push(...teamsByTier[key]);
  }

  return res;
}

function getSeasonLabel(startYear: number): string {
  return `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
}

function getNextTierByTeam(nextTeamsByTier: Record<string, Team[]>): Record<number, number> {
  const result: Record<number, number> = {};

  for (const [tier, teams] of Object.entries(nextTeamsByTier)) {
    for (const team of teams) {
      result[team.ID] = Number(tier);
    }
  }

  return result;
}

export function getTeamFromSeason(season: Season, teamID: number): Team | null {
  for (const league of Object.values(season.leagueStates)) {
    const team = league.teams.find(candidate => candidate.ID === teamID);
    if (team) {
      return team;
    }
  }

  return null;
}

export function createSeason(
  teamsByTier: Record<string, Team[]>,
  history: SeasonHistoryEntry[] = [],
  startYear: number = SEASON_START_YEAR,
  archives: SeasonArchive[] = [],
  freeAgents: FreeAgentState = createFreeAgentState(),
  international: InternationalState = createInternationalState()
): Season {
  const leagueStates: Record<string, LeagueState> = {};

  for (const team of getOrderedTeamsList(teamsByTier)) {
    team.resetSeasonForm();
  }

  for (const tier of Object.keys(teamsByTier).sort((a, b) => Number(a) - Number(b))) {
    leagueStates[tier] = createLeagueState(
      teamsByTier[tier],
      Number(tier)
    );
  }

  const cup = createCupState(
    getOrderedTeamsList(teamsByTier)
  );

  return {
    year: startYear,
    season: getSeasonLabel(startYear),
    matchday: 0,
    leagueStates,
    cup,
    history,
    promotionPlayoffs: null,
    seasonOverallChanges: null,
    nextTierByTeam: null,
    managerTeam: null,
    europeanCompetitions: null,
    archives,
    notices: [],
    freeAgents,
    international,
    clubWorldCup: null,
    explicitClubWorldCup: false,
    continentalTournaments: createContinentalTournaments(startYear)
  };
}

export function createInitialSeason(): Season {
  const initialTeams = createTeams(rawTeams);
  const season = createSeason(separateByTier(initialTeams));
  generateFreeAgents(season);
  return season;
}

export function isSeasonComplete(season: Season): boolean {
  return season.matchday >= SEASON_END_MATCHDAY;
}

export function simulateMatchday(season: Season): Season {
  if (isSeasonComplete(season)) {
    return season;
  }

  season.matchday++;

  for (const league of Object.values(season.leagueStates)) {
    simulateLeagueMatchday(league, season.matchday);
  }

  const cupRound = Object.keys(season.cup.roundMatchdays)
    .map(Number)
    .find(round => getCupRoundMatchday(round) === season.matchday);

  if (cupRound !== undefined && !isCupComplete(season.cup)) {
    simulateCupRound(season.cup);
  }

  simulateEuropeanMatchday(season.europeanCompetitions, season.matchday);

  if (season.managerTeam) {
    const returned = processReturnedMissions(
      season.managerTeam,
      season.matchday,
      unsigned => sendUnsignedScoutsToFreeAgents(season, unsigned)
    );
    for (const mission of returned) {
      season.notices.push({
        kind: "scout-return",
        missionId: mission.id,
        countryCode: mission.countryCode,
        candidateCount: mission.candidates.length,
        matchday: season.matchday
      });
    }
  }

  // Other clubs may sign free agents at any point in the season.
  processFreeAgentSigning(season);

  // An international window opens after certain matchdays (call-ups made, fixtures drawn).
  startWindowIfDue(season);
  autoSimulateClubWorldCupIfDue(season);
  autoSimulateContinentalTournamentsIfDue(season);

  return season;
}

function autoSimulateClubWorldCupIfDue(season: Season): void {
  if (
    season.clubWorldCup &&
    !season.clubWorldCup.completed &&
    season.matchday >= 21 &&
    !season.explicitClubWorldCup
  ) {
    simulateClubWorldCup(season);
  }
}

function autoSimulateContinentalTournamentsIfDue(season: Season): void {
  if (season.matchday >= CONTINENTAL_TOURNAMENT_MATCHDAY) {
    simulateContinentalTournaments(season.continentalTournaments, season.matchday);
  }
}

export function simulateMatchdays(season: Season, count: number): Season {
  const remaining = Math.max(0, SEASON_END_MATCHDAY - season.matchday);
  let matchdaysToSimulate = Math.min(count, remaining);

  const returnMatchday = getNextScoutReturnMatchday(season.managerTeam);
  if (returnMatchday !== null && returnMatchday > season.matchday) {
    matchdaysToSimulate = Math.min(matchdaysToSimulate, returnMatchday - season.matchday);
  }

  // A window that is due (e.g. after loading a save) is opened first.
  startWindowIfDue(season);

  for (let i = 0; i < matchdaysToSimulate; i++) {
    if (season.clubWorldCup && !season.clubWorldCup.completed && season.matchday >= 21) {
      if (season.explicitClubWorldCup) break;
      simulateClubWorldCup(season);
    }
    if (hasPendingWindow(season)) {
      // With explicit windows the user must simulate the window before the next matchday.
      if (season.international.explicitWindows) break;
      autoSimulateWindowIfDue(season);
    }
    if (isSeasonComplete(season)) break;
    simulateMatchday(season);
  }

  return season;
}

export function simulateSeasonToCompletion(season: Season): Season {
  simulateMatchdays(season, SEASON_END_MATCHDAY - season.matchday);

  if (!isSeasonComplete(season)) {
    return season;
  }

  if (!season.promotionPlayoffs) {
    season.promotionPlayoffs = simulatePromotionPlayoffs(season.leagueStates);
  }

  // The post-season international window opens once the season has concluded.
  autoSimulateWindowIfDue(season);

  return season;
}

export function hasPromotionPlayoffs(season: Season): boolean {
  return season.promotionPlayoffs !== null;
}

export function prepareSeasonTransition(season: Season): Record<string, Team[]> {
  if (!isSeasonComplete(season)) {
    throw new Error(
      `The current season is only at matchday ${season.matchday}.`
    );
  }

  if (!season.promotionPlayoffs) {
    season.promotionPlayoffs = simulatePromotionPlayoffs(season.leagueStates);
  }

  const teamsByTier: Record<string, Team[]> = {};

  for (const [tier, league] of Object.entries(season.leagueStates)) {
    teamsByTier[tier] = league.teams;
  }

  const nextTeamsByTier = applyPromotionRelegation(
    season.leagueStates,
    teamsByTier,
    season.promotionPlayoffs
  );

  season.nextTierByTeam = getNextTierByTeam(nextTeamsByTier);

  return nextTeamsByTier;
}

export function applySeasonOverallChanges(season: Season): OverallChange[] {
  if (season.seasonOverallChanges !== null) {
    return season.seasonOverallChanges;
  }

  const changes: OverallChange[] = [];

  for (const [tier, league] of Object.entries(season.leagueStates)) {
    const standings = getLeagueStandings(league);

    for (let index = 0; index < standings.length; index++) {
      const entry = standings[index];
      const team = entry.team;
      const actualPosition = index + 1;
      const predictedPosition = getPredictedPosition(league, team.ID);
      let change = 0;
      const reasons: string[] = [];

      if (season.managerTeam?.ID === team.ID) {
        continue;
      }

      const randNum = Math.floor(Math.random() * 10000) + 1;

      if (team.BaseOverall < 75 && randNum < 5) {
        change += 5;
        reasons.push("Tycoon Takeover");
        applyOwnershipRatingChange(team, "tycoon");
      } else if (team.BaseOverall < 80 && randNum >= 5 && randNum < 100) {
        change += 2;
        reasons.push("New, Steady Ownership Group");
        applyOwnershipRatingChange(team, "steady");
      } else if (team.BaseOverall < 80 && randNum >= 100 && randNum < 200) {
        change -= 1;
        reasons.push("New, Bad Ownership Group");
        applyOwnershipRatingChange(team, "bad");
      }

      if (Number(tier) === 1 && entry.PTS > 100) {
        change += 1;
        reasons.push("Premier League: over 100 points");
      }

      if (Number(tier) > 1 && entry.PTS > 110) {
        change += 1;
        reasons.push("Football League & NL: over 110 points");
      }

      if (predictedPosition !== null) {
        if (actualPosition <= predictedPosition - 5) {
          const positionChange = Math.trunc((predictedPosition - actualPosition) / 5);
          change += positionChange;
          reasons.push(`finished ${predictedPosition - actualPosition} places above prediction`);
        } else if (actualPosition >= predictedPosition + 5) {
          const positionChange = Math.trunc((actualPosition - predictedPosition) / 5);
          change -= positionChange;
          reasons.push(`finished ${actualPosition - predictedPosition} places below prediction`);
        }
      }

      const nextTier = season.nextTierByTeam?.[team.ID] ?? Number(tier);
      const previousHistory = team.seasonHistory.at(-1) ?? null;
      const currentPromoted = nextTier < Number(tier);
      const currentRelegated = nextTier > Number(tier);

      if (
        Number(tier) === 1 &&
        previousHistory?.status === "PROMOTED" &&
        !currentRelegated &&
        Math.random() < 0.70
      ) {
        change += 1;
        reasons.push("Premier League survival bonus");
      }

      if (currentPromoted && previousHistory?.status === "PROMOTED") {
        change += 1;
        reasons.push("back to back promotions");
      }

      if (currentRelegated && previousHistory?.status === "RELEGATED") {
        change -= 1;
        reasons.push("back to back relegations");
      }

      if (change !== 0) {
        const oldBaseOverall = team.BaseOverall;
        team.applySeasonOverallChange(change);

        changes.push({
          team,
          tier: Number(tier),
          oldOverall: oldBaseOverall,
          newOverall: team.BaseOverall,
          change,
          reasons
        });
      } else {
        team.Overall = team.BaseOverall;
      }
    }
  }

  season.seasonOverallChanges = changes;
  return changes;
}

type OwnershipChange = "tycoon" | "steady" | "bad";

function applyOwnershipRatingChange(team: Team, ownership: OwnershipChange): void {
  const ratings: (keyof Pick<Team, "facilityRating" | "scoutingRating" | "scoutingExperience">)[] = [
    "facilityRating", "scoutingRating", "scoutingExperience"
  ];

  if (ownership === "tycoon") {
    const roll = Math.random();
    const increase = roll < 0.3 ? 2 : roll < 0.9 ? 1 : 0;
    for (const rating of ratings) {
      team[rating] = Math.max(1, Math.min(5, team[rating] + increase));
    }
    return;
  }

  const chance = ownership === "steady" ? 0.6 : 0.5;
  if (Math.random() >= chance) return;

  for (let index = 0; index < 2; index++) {
    const selected = index + Math.floor(Math.random() * (ratings.length - index));
    [ratings[index], ratings[selected]] = [ratings[selected], ratings[index]];
  }
  const adjustment = ownership === "steady" ? 1 : -1;
  for (const rating of ratings.slice(0, 2)) {
    team[rating] = Math.max(1, Math.min(5, team[rating] + adjustment));
  }
}

function getTeamSeasonStatus(currentTier: number, nextTier: number): TeamStatus {
  if (nextTier < currentTier) {
    return "PROMOTED";
  }

  if (nextTier > currentTier) {
    return "RELEGATED";
  }

  return "STAYED";
}

export function recordTeamSeasonHistory(season: Season): void {
  if (!season.nextTierByTeam) {
    throw new Error("Season transition must be prepared before recording team history.");
  }

  for (const [tier, league] of Object.entries(season.leagueStates)) {
    const currentTier = Number(tier);
    const standings = getLeagueStandings(league);

    for (let index = 0; index < standings.length; index++) {
      const team = standings[index].team;
      const nextTier = season.nextTierByTeam[team.ID];
      const cupFinish = getCupFinish(season.cup, team.ID);

      team.seasonHistory.push({
        year: season.year,
        season: season.season,
        tier: currentTier,
        league: `Tier ${currentTier}`,
        position: index + 1,
        status: getTeamSeasonStatus(currentTier, nextTier),
        cupFinish
      });
    }
  }
}

function getCupHistory(season: Season): FinalHistory {
  const bracket = season.cup.bracket;
  const finalRound = bracket.rounds[bracket.rounds.length - 1];
  const finalMatch = finalRound[0];
  const semifinalRound = bracket.rounds.length >= 2
    ? bracket.rounds[bracket.rounds.length - 2]
    : null;

  const semifinalists = semifinalRound
    ? semifinalRound.flatMap(match => [
        match.player1?.team ?? null,
        match.player2?.team ?? null
      ]).filter(Boolean) as Team[]
    : [];

  const finalResult = finalMatch.result;

  return {
    winner: finalMatch.winner ?? null,
    runnerUp: finalMatch.winner
      ? ([finalMatch.player1?.team, finalMatch.player2?.team] as (Team | null | undefined)[])
          .find(team => team && team.ID !== (finalMatch.winner as Team).ID) ?? null
      : null,
    semifinalists,
    finalScore: finalResult
      ? {
          homeTeam: finalResult.homeGoalInfo.homeTeam,
          homeGoals: finalResult.homeGoalInfo.homeGoals,
          awayTeam: finalResult.awayGoalInfo.awayTeam,
          awayGoals: finalResult.awayGoalInfo.awayGoals,
          homePenalties: finalResult.homeGoalInfo.penalties,
          awayPenalties: finalResult.awayGoalInfo.penalties
        }
      : null
  };
}

export function recordSeasonHistory(season: Season): SeasonHistoryEntry {
  const leagueHistory: Record<string, Team[]> = {};

  for (const [tier, league] of Object.entries(season.leagueStates)) {
    const standings = getLeagueStandings(league);

    leagueHistory[tier] = standings.slice(0, 3).map(entry => entry.team);
  }

  const cupHistory = getCupHistory(season);

  return {
    year: season.year,
    season: season.season,
    leagues: leagueHistory,
    cup: cupHistory,
    european: getEuropeanSeasonHistory(season.europeanCompetitions),
    overallChanges: season.seasonOverallChanges ?? []
  };
}

export function advanceToNextSeason(season: Season, managerTeam: Team | null = null): Season {
  autoSimulateClubWorldCupIfDue(season);
  autoSimulateContinentalTournamentsIfDue(season);
  const nextTeamsByTier = prepareSeasonTransition(season);

  // Web UI addition: archive the full, completed season (fixtures, tables, brackets)
  // before anything about the teams changes.
  const archives = [...season.archives, snapshotSeason(season)];

  season.managerTeam = managerTeam;

  // Seasonal result-based overall changes do not apply to the managed team.
  applySeasonOverallChanges(season);

  const nextYear = season.year + 1;
  retireScheduledPlayers(season);

  if (managerTeam) {
    // Returned scouting reports expire with the season if they were not signed.
    expireAllScoutingMissions(managerTeam, unsigned => sendUnsignedScoutsToFreeAgents(season, unsigned));
    applySquadGrowth(managerTeam, nextYear);
    const addedPlayers = ensureMinimumSeniorSquad(
      managerTeam,
      nextYear,
      prefix => nextPlayerID(season, prefix, nextYear)
    );
    // Web UI: the starting XI is auto-selected at the start of every season.
    resetStartingXIToAuto(managerTeam);
    calculateTeamOverall(managerTeam);
    managerTeam.lastSeasonEmergencyPlayers = addedPlayers;
  }

  // Free agents (and players signed by other clubs) age and develop; new free agents arrive.
  developFreeAgentWorld(season, nextYear);
  generateFreeAgents(season, nextYear);
  generateClubRegens(season, nextYear);
  // Clubs' player-based overall bonus follows their players' development and the new base overalls.
  refreshAllClubOveralls(season);

  finalizeEuropeanHistory(season.europeanCompetitions);
  recordTeamSeasonHistory(season);

  const history = [
    ...season.history,
    recordSeasonHistory(season)
  ];

  const nextSeason = createSeason(nextTeamsByTier, history, nextYear, archives, season.freeAgents, season.international);
  nextSeason.managerTeam = managerTeam;
  nextSeason.explicitClubWorldCup = season.explicitClubWorldCup;
  nextSeason.europeanCompetitions = createEuropeanCompetitions(season, history);
  nextSeason.clubWorldCup = createClubWorldCup(season, nextYear);
  if (nextSeason.europeanCompetitions) {
    for (const competition of Object.values(nextSeason.europeanCompetitions)) {
      competition.seasonLabel = nextSeason.season;
    }
  }
  refreshAllClubOveralls(nextSeason);
  schedulePlayerRetirements(nextSeason);
  // Keep the previous season's overall-change report available for the new-season summary.
  nextSeason.notices = [];
  return nextSeason;
}
