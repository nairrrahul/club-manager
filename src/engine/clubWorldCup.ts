import continentalTeamsRaw from "./data/continental_teams.json";
import { getConfederation } from "./nations";
import { simulateMatch, parseKOMatchWinner } from "./matchEngine";
import { updateFormAfterMatch } from "./form";
import { Team } from "./team";
import type { EuropeanCompetition } from "./europeanCompetitions";
import type { Season } from "./season";
import type { FinalHistory, MatchResult, TableEntry } from "./types";
import type { ContinentalTournament } from "./continentalTournaments";

export const CLUB_WORLD_CUP_START_YEAR = 2028;
export const CLUB_WORLD_CUP_NAME = "Club World Cup";
export const CLUB_WORLD_CUP_CONFEDERATIONS = ["AFC", "CAF", "CONCACAF", "CONMEBOL", "OFC"] as const;

export interface ClubWorldCupTeam {
  id: number;
  team: string;
  overall: number;
  countrycode: string;
  facilityRating?: number;
  youthScouting?: number;
  youthExperience?: number;
}

export interface ClubWorldCupFixture {
  homeTeam: Team;
  awayTeam: Team;
  result: MatchResult | null;
}

export interface ClubWorldCupGroup {
  name: "A" | "B";
  teams: Team[];
  fixtures: ClubWorldCupFixture[][];
  table: TableEntry[];
}

export interface ClubWorldCupKnockoutMatch {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  result: MatchResult | null;
  winner: Team | null;
}

export interface ClubWorldCupRound {
  label: "Semi-finals" | "Final";
  matches: ClubWorldCupKnockoutMatch[];
}

export interface ClubWorldCup {
  year: number;
  seasonLabel: string;
  teams: Team[];
  pots: Team[][];
  groups: [ClubWorldCupGroup, ClubWorldCupGroup];
  knockout: ClubWorldCupRound[] | null;
  completed: boolean;
  winner: Team | null;
  runnerUp: Team | null;
}

export const continentalTeams = continentalTeamsRaw as Record<string, ClubWorldCupTeam[]>;
const continentalConfederationByID = new Map(
  Object.entries(continentalTeams).flatMap(([confederation, teams]) =>
    teams.map(team => [team.id, confederation] as const)
  )
);

function seasonLabel(year: number): string {
  return `${String(year).slice(-2)}-${String(year + 1).slice(-2)}`;
}

function getWinner(competition: EuropeanCompetition | undefined): Team | null {
  const bracket = competition?.knockout?.bracket;
  if (!competition?.completed || !bracket) return null;
  return bracket.rounds.at(-1)?.[0]?.winner ?? null;
}

function getHistoricalWinner(season: Season, code: string): Team | null {
  return season.history.at(-1)?.european[code]?.winner ?? null;
}

function cloneTeam(source: Team): Team {
  const team = new Team({
    ID: source.ID,
    Team: source.Team,
    Overall: source.Overall,
    BaseOverall: source.BaseOverall,
    Tier: source.Tier,
    facilityRating: source.facilityRating,
    youthScouting: source.scoutingRating,
    youthExperience: source.scoutingExperience
  });
  team.countrycode = source.countrycode;
  team.playerBonus = source.playerBonus ?? 0;
  team.seasonOverallChange = source.seasonOverallChange ?? 0;
  team.winStreak = source.winStreak ?? 0;
  team.lossStreak = source.lossStreak ?? 0;
  team.upsetWinStreak = source.upsetWinStreak ?? 0;
  team.upsetLossStreak = source.upsetLossStreak ?? 0;
  team.recomputeOverall();
  return team;
}

function chooseOne<T>(values: T[]): T {
  if (values.length === 0) throw new Error("The Club World Cup cannot draw a required confederation team.");
  return values[Math.floor(Math.random() * values.length)];
}

type CompletedContinentalTournament = ContinentalTournament & { winner: Team; runnerUp: Team };

function getContinentalTournament(
  season: Season,
  confederation: string
): CompletedContinentalTournament {
  const tournament = season.continentalTournaments?.[confederation];
  const winner = tournament?.winner;
  const runnerUp = tournament?.runnerUp;
  if (!tournament?.completed || !winner || !runnerUp) {
    throw new Error(
      `${confederation} continental tournament must be complete before the ${CLUB_WORLD_CUP_NAME} entrants are drawn.`
    );
  }
  return { ...tournament, winner, runnerUp };
}

function drawConfederationTeams(
  previousSeason: Season,
  excludedIDs: Set<number>
): { team: Team; confederation: string }[] {
  return CLUB_WORLD_CUP_CONFEDERATIONS.map(confederation => {
    const tournament = getContinentalTournament(previousSeason, confederation);
    if (excludedIDs.has(tournament.winner.ID)) {
      throw new Error(`${confederation}'s continental champion is already selected for the Club World Cup.`);
    }
    excludedIDs.add(tournament.winner.ID);
    return { team: tournament.winner, confederation };
  });
}

function drawAdditionalConfederationTeam(
  previousSeason: Season,
  entries: { team: Team; confederation: string }[],
  excludedIDs: Set<number>
): { team: Team; confederation: string } {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const confederation = getTeamConfederation(entry.team);
    counts.set(confederation, (counts.get(confederation) ?? 0) + 1);
  }
  const availableConfederations = CLUB_WORLD_CUP_CONFEDERATIONS.filter(
    confederation => (counts.get(confederation) ?? 0) < 2 &&
      !excludedIDs.has(getContinentalTournament(previousSeason, confederation).runnerUp.ID)
  );
  const confederation = chooseOne([...availableConfederations]);
  const runnerUp = getContinentalTournament(previousSeason, confederation).runnerUp;
  excludedIDs.add(runnerUp.ID);
  return { team: runnerUp, confederation };
}

function getTeamConfederation(team: Team): string {
  return continentalConfederationByID.get(team.ID) ?? getConfederation(team.countrycode ?? "") ?? "UEFA";
}

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function drawGroups(teams: Team[]): { pots: Team[][]; groups: [ClubWorldCupGroup, ClubWorldCupGroup] } {
  const ranked = [...teams].sort((a, b) => b.Overall - a.Overall || a.Team.localeCompare(b.Team));
  const pots = [ranked.slice(0, 4), ranked.slice(4)];
  const groups: Team[][] = [[], []];
  const confederations: Set<string>[] = [new Set(), new Set()];

  const drawnPots = pots.map(shuffled);
  const placeTeam = (potIndex: number, teamIndex: number): boolean => {
    if (potIndex === drawnPots.length) return groups.every(group => group.length === 4);
    if (teamIndex === drawnPots[potIndex].length) return placeTeam(potIndex + 1, 0);
    const team = drawnPots[potIndex][teamIndex];
    const confederation = getTeamConfederation(team);
    for (const groupIndex of shuffled([0, 1])) {
      const group = groups[groupIndex];
      if (group.filter(candidate => pots[potIndex].includes(candidate)).length >= 2) continue;
      if (confederations[groupIndex].has(confederation)) continue;
      group.push(team);
      confederations[groupIndex].add(confederation);
      if (placeTeam(potIndex, teamIndex + 1)) return true;
      group.pop();
      confederations[groupIndex].delete(confederation);
    }
    return false;
  };

  if (!placeTeam(0, 0)) {
    throw new Error("Unable to draw Club World Cup groups without repeating a confederation.");
  }

  return {
    pots,
    groups: [
      createGroup("A", groups[0]),
      createGroup("B", groups[1])
    ]
  };
}

function createGroup(name: "A" | "B", teams: Team[]): ClubWorldCupGroup {
  const pairings = [
    [[0, 1], [2, 3]],
    [[0, 2], [3, 1]],
    [[0, 3], [1, 2]]
  ];
  const fixtures = pairings.map(round => round.map(([home, away]) => ({
    homeTeam: teams[home],
    awayTeam: teams[away],
    result: null
  })));
  return { name, teams, fixtures, table: teams.map(team => ({
    team, GP: 0, PTS: 0, W: 0, D: 0, L: 0, GD: 0, GF: 0, GA: 0
  })) };
}

function buildTable(group: ClubWorldCupGroup): TableEntry[] {
  const table = new Map(group.teams.map(team => [team.ID, {
    team, GP: 0, PTS: 0, W: 0, D: 0, L: 0, GD: 0, GF: 0, GA: 0
  } satisfies TableEntry]));
  for (const fixture of group.fixtures.flat()) {
    const result = fixture.result;
    if (!result) continue;
    const home = table.get(fixture.homeTeam.ID);
    const away = table.get(fixture.awayTeam.ID);
    if (!home || !away) throw new Error("A Club World Cup group fixture references a team outside its group.");
    const homeGoals = result.homeGoalInfo.homeGoals;
    const awayGoals = result.awayGoalInfo.awayGoals;
    home.GP++;
    away.GP++;
    home.GF += homeGoals;
    home.GA += awayGoals;
    away.GF += awayGoals;
    away.GA += homeGoals;
    if (homeGoals > awayGoals) {
      home.W++;
      home.PTS += 3;
      away.L++;
    } else if (homeGoals < awayGoals) {
      away.W++;
      away.PTS += 3;
      home.L++;
    } else {
      home.D++;
      away.D++;
      home.PTS++;
      away.PTS++;
    }
  }
  const rows = [...table.values()];
  for (const row of rows) row.GD = row.GF - row.GA;
  return rows.sort((a, b) =>
    b.PTS - a.PTS || b.GD - a.GD || b.GF - a.GF || b.team.Overall - a.team.Overall || a.team.Team.localeCompare(b.team.Team)
  );
}

function playKnockoutMatch(id: string, homeTeam: Team, awayTeam: Team): ClubWorldCupKnockoutMatch {
  const result = simulateMatch(homeTeam, awayTeam, true, "CWC");
  const winner = parseKOMatchWinner(result);
  updateFormAfterMatch(result, winner);
  return { id, homeTeam, awayTeam, result, winner };
}

function previousWinner(previousSeason: Season, championsLeagueWinner: Team | null): Team | null {
  const previousClubWorldCupWinner = previousSeason.clubWorldCup?.completed
    ? previousSeason.clubWorldCup.winner
    : null;
  const europaWinner = getWinner(previousSeason.europeanCompetitions?.UEL) ?? getHistoricalWinner(previousSeason, "UEL");
  if (previousClubWorldCupWinner && previousClubWorldCupWinner.ID !== championsLeagueWinner?.ID) {
    return previousClubWorldCupWinner;
  }
  if (europaWinner && europaWinner.ID !== championsLeagueWinner?.ID) return europaWinner;
  return previousClubWorldCupWinner ?? europaWinner;
}

export function createClubWorldCup(previousSeason: Season, year = previousSeason.year + 1): ClubWorldCup | null {
  if (year < CLUB_WORLD_CUP_START_YEAR) return null;

  const championsLeagueWinner = getWinner(previousSeason.europeanCompetitions?.UCL) ??
    getHistoricalWinner(previousSeason, "UCL");
  const pastWinner = previousWinner(previousSeason, championsLeagueWinner);

  if (!championsLeagueWinner || !pastWinner) {
    throw new Error(`Club World Cup entrants for ${seasonLabel(year)} require the prior season's Champions League and Europa League winners.`);
  }

  const excludedIDs = new Set([championsLeagueWinner.ID]);
  const baseTeams = drawConfederationTeams(previousSeason, excludedIDs);
  const randomPick = baseTeams.find(entry => entry.team.ID === pastWinner.ID);
  if (randomPick) {
    randomPick.team = getContinentalTournament(previousSeason, randomPick.confederation).runnerUp;
    excludedIDs.add(randomPick.team.ID);
  }

  excludedIDs.add(pastWinner.ID);
  baseTeams.push(drawAdditionalConfederationTeam(previousSeason, baseTeams, excludedIDs));
  const entrants = [
    cloneTeam(championsLeagueWinner),
    ...baseTeams.map(entry => entry.team),
    cloneTeam(pastWinner)
  ];
  if (entrants.length !== 8 || new Set(entrants.map(team => team.ID)).size !== 8) {
    throw new Error(`Club World Cup entrants for ${seasonLabel(year)} are not eight distinct teams.`);
  }
  const { pots, groups } = drawGroups(entrants);
  return {
    year,
    seasonLabel: seasonLabel(year),
    teams: entrants,
    pots,
    groups,
    knockout: null,
    completed: false,
    winner: null,
    runnerUp: null
  };
}

export function getClubWorldCupWinner(season: Season): Team | null {
  return season.clubWorldCup?.completed ? season.clubWorldCup.winner : null;
}

export function simulateClubWorldCup(season: Season): boolean {
  const cup = season.clubWorldCup;
  if (!cup || cup.completed || season.matchday < 21) return false;

  for (const group of cup.groups) {
    for (const round of group.fixtures) {
      for (const fixture of round) {
        const result = simulateMatch(fixture.homeTeam, fixture.awayTeam, false, "CWC");
        fixture.result = result;
        updateFormAfterMatch(result);
      }
    }
    group.table = buildTable(group);
  }

  const [groupA, groupB] = cup.groups;
  const semiFinals = [
    playKnockoutMatch("SF-1", groupA.table[0].team, groupB.table[1].team),
    playKnockoutMatch("SF-2", groupB.table[0].team, groupA.table[1].team)
  ];
  const final = playKnockoutMatch("F-1", semiFinals[0].winner as Team, semiFinals[1].winner as Team);
  cup.knockout = [
    { label: "Semi-finals", matches: semiFinals },
    { label: "Final", matches: [final] }
  ];
  cup.winner = final.winner;
  cup.runnerUp = final.winner?.ID === semiFinals[0].winner?.ID
    ? semiFinals[1].winner
    : semiFinals[0].winner;
  cup.completed = true;
  return true;
}

export function getClubWorldCupHistory(season: Season): FinalHistory | null {
  const cup = season.clubWorldCup;
  if (!cup?.completed || !cup.knockout) return null;
  const final = cup.knockout.at(-1)?.matches[0];
  const semifinalists = cup.knockout[0].matches.flatMap(match => [match.homeTeam, match.awayTeam]);
  const result = final?.result;
  return {
    competition: CLUB_WORLD_CUP_NAME,
    season: cup.seasonLabel,
    winner: cup.winner,
    runnerUp: cup.runnerUp,
    semifinalists,
    finalScore: result ? {
      homeTeam: result.homeGoalInfo.homeTeam,
      homeGoals: result.homeGoalInfo.homeGoals,
      awayTeam: result.awayGoalInfo.awayTeam,
      awayGoals: result.awayGoalInfo.awayGoals,
      homePenalties: result.homeGoalInfo.penalties,
      awayPenalties: result.awayGoalInfo.penalties
    } : null
  };
}
