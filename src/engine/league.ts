import { scheduleLeague } from "./scheduler";
import { simulateMatch } from "./matchEngine";
import { updateFormAfterMatch } from "./form";
import type { Team } from "./team";
import type { LeagueState, MatchResult, TableEntry } from "./types";

export function createLeagueState(teams: Team[], tier: number): LeagueState {
  const schedule = scheduleLeague(teams);
  const localMatchdays = Object.keys(schedule).map(Number);
  const totalMatchdays = localMatchdays.length;
  const startMatchday = 46 - totalMatchdays + 1;

  const table: Record<number, TableEntry> = Object.fromEntries(
    teams.map(team => [
      team.ID,
      {
        team,
        GP: 0,
        PTS: 0,
        W: 0,
        D: 0,
        L: 0,
        GD: 0,
        GF: 0,
        GA: 0
      }
    ])
  );

  return {
    tier,
    teams,
    schedule,
    table,
    startMatchday,
    endMatchday: 46,
    prediction: getLeaguePrediction(teams, tier)
  };
}

export function simulateLeagueMatchday(league: LeagueState, matchday: number): void {
  const localMatchday = matchday - league.startMatchday + 1;

  if (localMatchday < 1 || localMatchday > Object.keys(league.schedule).length) {
    return;
  }

  const matches = league.schedule[localMatchday];

  for (const match of matches) {
    const matchResult = simulateMatch(
      match.homeTeam,
      match.awayTeam,
      false,
      "LEAGUE"
    );

    match.result = matchResult;
    updateLeagueTable(league.table, matchResult);
    updateFormAfterMatch(matchResult);
  }
}

function updateLeagueTable(table: Record<number, TableEntry>, matchResult: MatchResult): void {
  const homeTeam = matchResult.homeGoalInfo.homeTeam;
  const awayTeam = matchResult.awayGoalInfo.awayTeam;

  const homeGoals = matchResult.homeGoalInfo.homeGoals;
  const awayGoals = matchResult.awayGoalInfo.awayGoals;

  const home = table[homeTeam.ID];
  const away = table[awayTeam.ID];

  home.GF += homeGoals;
  home.GA += awayGoals;
  away.GF += awayGoals;
  away.GA += homeGoals;

  home.GP += 1;
  away.GP += 1;

  if (homeGoals > awayGoals) {
    home.W += 1;
    away.L += 1;
  } else if (homeGoals < awayGoals) {
    home.L += 1;
    away.W += 1;
  } else {
    home.D += 1;
    away.D += 1;
  }

  home.GD = home.GF - home.GA;
  away.GD = away.GF - away.GA;

  home.PTS = 3 * home.W + home.D;
  away.PTS = 3 * away.W + away.D;
}

function getHistoricalPositionForPrediction(
  team: Team,
  currentTier: number,
  currentLeagueSize: number,
  seasonOffset: number
): number {
  const history = team.seasonHistory.at(-seasonOffset);

  if (!history) {
    return currentLeagueSize + 1;
  }

  if (history.tier < currentTier) {
    return 0;
  }

  if (history.tier > currentTier) {
    return currentLeagueSize + 1;
  }

  return history.position;
}

export function getPredictionAverage(team: Team, currentTier: number, currentLeagueSize: number): number {
  const positions = [1, 2, 3].map(seasonOffset =>
    getHistoricalPositionForPrediction(
      team,
      currentTier,
      currentLeagueSize,
      seasonOffset
    )
  );

  return positions.reduce((sum, position) => sum + position, 0) / positions.length;
}

export function getLeaguePrediction(teams: Team[], tier: number): number[] {
  const currentLeagueSize = teams.length;

  return [...teams]
    .sort((a, b) => {
      return (
        b.BaseOverall - a.BaseOverall ||
        getPredictionAverage(a, tier, currentLeagueSize) -
          getPredictionAverage(b, tier, currentLeagueSize) ||
        a.Team.localeCompare(b.Team)
      );
    })
    .map(team => team.ID);
}

export function getPredictedPosition(league: LeagueState, teamID: number): number | null {
  const index = league.prediction.indexOf(teamID);
  return index === -1 ? null : index + 1;
}

export function sortLeagueTable(table: Record<number, TableEntry>): TableEntry[] {
  return Object.values(table).sort((a, b) => {
    return (
      b.PTS - a.PTS ||
      b.GD - a.GD ||
      b.GF - a.GF ||
      a.team.Team.localeCompare(b.team.Team)
    );
  });
}

export function getLeagueStandings(league: LeagueState): TableEntry[] {
  return sortLeagueTable(league.table);
}
