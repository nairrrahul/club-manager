import continentalTeamsRaw from "./data/continental_teams.json";
import { Team } from "./team";
import { scheduleBracket } from "./scheduler";
import { simulateMatch, simulatePenaltyShootoutOnly, parseKOMatchWinner } from "./matchEngine";
import { getAggregateGoals } from "./europeanCompetitions";
import { updateFormAfterMatch } from "./form";
import type { Bracket, BracketMatch, MatchResult } from "./types";

export const CONTINENTAL_TOURNAMENT_START_YEAR = 2027;
export const CONTINENTAL_TOURNAMENT_MATCHDAY = 31;
export const CONTINENTAL_CONFEDERATIONS = ["AFC", "CAF", "CONCACAF", "CONMEBOL", "OFC"] as const;

interface RawContinentalTeam {
  id: number;
  team: string;
  overall: number;
  countrycode: string;
  facilityRating?: number;
  youthScouting?: number;
  youthExperience?: number;
}

export interface ContinentalTournament {
  year: number;
  seasonLabel: string;
  confederation: string;
  teams: Team[];
  bracket: Bracket;
  completed: boolean;
  winner: Team | null;
  runnerUp: Team | null;
}

const continentalTeams = continentalTeamsRaw as Record<string, RawContinentalTeam[]>;

function seasonLabel(year: number): string {
  return `${String(year).slice(-2)}-${String(year + 1).slice(-2)}`;
}

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function createTeam(raw: RawContinentalTeam): Team {
  const team = new Team({
    ID: raw.id,
    Team: raw.team,
    Overall: raw.overall,
    BaseOverall: raw.overall,
    Tier: 0,
    facilityRating: raw.facilityRating,
    youthScouting: raw.youthScouting,
    youthExperience: raw.youthExperience
  });
  team.countrycode = raw.countrycode;
  return team;
}

function simulateTie(match: BracketMatch, team1: Team, team2: Team, matchday: number): void {
  const firstLeg = simulateMatch(team1, team2, false, "CONTINENTAL");
  const secondLeg = simulateMatch(team2, team1, false, "CONTINENTAL");
  match.legs = [
    { matchday, result: firstLeg },
    { matchday, result: secondLeg }
  ];
  updateFormAfterMatch(firstLeg);
  updateFormAfterMatch(secondLeg);

  const aggregate = getAggregateGoals(match);
  if (aggregate.team1 > aggregate.team2) {
    match.winner = team1;
  } else if (aggregate.team2 > aggregate.team1) {
    match.winner = team2;
  } else {
    match.tiebreak = simulatePenaltyShootoutOnly(team1, team2);
    match.winner = parseKOMatchWinner(match.tiebreak);
  }
}

function advanceRound(bracket: Bracket, round: BracketMatch[]): void {
  const nextRound = bracket.rounds[bracket.activeRound + 1];
  if (!nextRound) return;
  for (let index = 0; index < round.length; index++) {
    const nextMatch = nextRound[Math.floor(index / 2)];
    const slot = { team: round[index].winner };
    if (index % 2 === 0) nextMatch.player1 = slot;
    else nextMatch.player2 = slot;
  }
  bracket.activeRound++;
}

function playFinal(match: BracketMatch, homeTeam: Team, awayTeam: Team): void {
  const result = simulateMatch(homeTeam, awayTeam, true, "CONTINENTAL");
  match.result = result;
  match.winner = parseKOMatchWinner(result);
  updateFormAfterMatch(result, match.winner);
}

function createTournament(year: number, confederation: string, rawTeams: RawContinentalTeam[]): ContinentalTournament {
  if (rawTeams.length < 2) {
    throw new Error(`${confederation} must have at least two clubs for its continental tournament.`);
  }
  const teams = rawTeams.map(createTeam);
  return {
    year,
    seasonLabel: seasonLabel(year),
    confederation,
    teams,
    bracket: scheduleBracket(shuffled(teams), 0),
    completed: false,
    winner: null,
    runnerUp: null
  };
}

export function createContinentalTournaments(year: number): Record<string, ContinentalTournament> {
  if (year < CONTINENTAL_TOURNAMENT_START_YEAR) return {};
  return Object.fromEntries(CONTINENTAL_CONFEDERATIONS.map(confederation => [
    confederation,
    createTournament(year, confederation, continentalTeams[confederation] ?? [])
  ]));
}

export function simulateContinentalTournaments(
  tournaments: Record<string, ContinentalTournament>,
  matchday: number
): boolean {
  if (matchday < CONTINENTAL_TOURNAMENT_MATCHDAY) return false;
  let simulated = false;
  for (const tournament of Object.values(tournaments)) {
    if (tournament.completed) continue;
    const { bracket } = tournament;
    for (let roundIndex = bracket.activeRound; roundIndex < bracket.rounds.length; roundIndex++) {
      const roundMatchday = CONTINENTAL_TOURNAMENT_MATCHDAY + roundIndex;
      if (roundMatchday > matchday) break;
      const round = bracket.rounds[roundIndex];
      const isFinal = roundIndex === bracket.rounds.length - 1;
      for (const match of round) {
        const team1 = match.player1?.team ?? null;
        const team2 = match.player2?.team ?? null;
        if (!team1 || !team2) {
          match.winner = team1 ?? team2;
          continue;
        }
        if (isFinal) playFinal(match, team1, team2);
        else simulateTie(match, team1, team2, roundMatchday);
      }
      simulated = true;
      if (isFinal) {
        const final = round[0];
        const finalists = [final.player1?.team, final.player2?.team].filter((team): team is Team => Boolean(team));
        tournament.winner = final.winner;
        tournament.runnerUp = finalists.find(team => team.ID !== tournament.winner?.ID) ?? null;
        if (!tournament.winner || !tournament.runnerUp) {
          throw new Error(`${tournament.confederation} tournament did not produce a winner and runner-up.`);
        }
        tournament.completed = true;
        break;
      }
      advanceRound(bracket, round);
    }
  }
  return simulated;
}
