import { getLeagueStandings } from "./league";
import { getCupRoundMatchday } from "./cup";
import {
  COMPETITION_NAMES, KNOCKOUT_PHASES, getAggregateGoals, getCurrentPhase, getRoundMatchdays, getStandings
} from "./europeanCompetitions";
import { LEAGUE_NAMES, CUP_NAME, SEASON_END_MATCHDAY, seasonDisplay } from "./constants";
import { tier_information } from "./promotionRelegation";
import type { Team } from "./team";
import type { BracketMatch, MatchResult } from "./types";
import type { Season } from "./season";
import { CLUB_WORLD_CUP_NAME } from "./clubWorldCup";
import type { ClubWorldCup } from "./clubWorldCup";
import { CONTINENTAL_TOURNAMENT_MATCHDAY } from "./continentalTournaments";
import type { ContinentalTournament } from "./continentalTournaments";
import type { GoldCupEdition, GoldCupPlayoffEdition } from "./goldCup";
import type { CopaAmericaEdition } from "./copaAmerica";
import type { InternationalMatch } from "./international";

// ---------------------------------------------------------------------------
// Plain-data snapshot types. Snapshots never reference live engine objects, so a
// season archived years ago keeps showing exactly what happened at the time.
// ---------------------------------------------------------------------------

export interface TeamRef {
  id: number;
  name: string;
  countrycode?: string | null;
}

export interface ScoreSnap {
  h: number;
  a: number;
  /** Penalty shootout goals (home / away), only when decided on penalties. */
  ph?: number;
  pa?: number;
}

export interface MatchSnap {
  home: TeamRef;
  away: TeamRef;
  score: ScoreSnap | null;
}

export interface LeagueRow {
  pos: number;
  team: TeamRef;
  GP: number;
  W: number;
  D: number;
  L: number;
  GF: number;
  GA: number;
  GD: number;
  PTS: number;
  status: "PROMOTED" | "RELEGATED" | "STAYED" | null;
}

export interface PlayoffSnap {
  semiOne: MatchSnap;
  semiTwo: MatchSnap;
  final: MatchSnap;
  winner: TeamRef;
}

export interface LeagueMatchdaySnap {
  matchday: number;
  local: number;
  matches: MatchSnap[];
}

export interface PlayoffFixtureSnap {
  home: TeamRef;
  away: TeamRef;
}

export interface LeagueSnap {
  tier: number;
  name: string;
  rows: LeagueRow[];
  /** Pre-season predicted finishing order (index 0 = predicted champions). */
  prediction: TeamRef[];
  /** Semi-final pairings, available once the regular season is over (tiers 2-5). */
  playoffFixtures: { semiOne: PlayoffFixtureSnap; semiTwo: PlayoffFixtureSnap } | null;
  fixtures: LeagueMatchdaySnap[];
  playoffs: PlayoffSnap | null;
  complete: boolean;
}

export interface CupMatchSnap {
  id: string;
  home: TeamRef | null;
  away: TeamRef | null;
  score: ScoreSnap | null;
  winner: TeamRef | null;
  bye: boolean;
  legs?: [ScoreSnap | null, ScoreSnap | null];
  aggregate?: { h: number; a: number } | null;
  tiebreak?: ScoreSnap | null;
}

export interface CupRoundSnap {
  round: number;
  label: string;
  matchday: number;
  matches: CupMatchSnap[];
}

export interface CupSnap {
  rounds: CupRoundSnap[];
  complete: boolean;
  winner: TeamRef | null;
  runnerUp: TeamRef | null;
}

export interface EuroRow {
  pos: number;
  team: TeamRef;
  countrycode: string;
  overall: number;
  GP: number;
  W: number;
  D: number;
  L: number;
  GF: number;
  GA: number;
  GD: number;
  PTS: number;
}

export interface EuroTieSnap {
  id: string;
  home: TeamRef | null;
  away: TeamRef | null;
  bye: boolean;
  legs: { matchday: number; score: ScoreSnap }[];
  aggregate: { h: number; a: number } | null;
  tiebreak: ScoreSnap | null;
  winner: TeamRef | null;
}

export interface EuroRoundSnap {
  key: string;
  label: string;
  matchdays: number[];
  ties: EuroTieSnap[];
}

export interface EuroSnap {
  code: string;
  name: string;
  seasonLabel: string;
  phase: string;
  complete: boolean;
  table: EuroRow[];
  pots: TeamRef[][];
  fixtures: LeagueMatchdaySnap[];
  knockout: EuroRoundSnap[] | null;
  winner: TeamRef | null;
  runnerUp: TeamRef | null;
}

export interface ClubWorldCupMatchSnap {
  home: TeamRef;
  away: TeamRef;
  score: ScoreSnap | null;
  winner: TeamRef | null;
}

export interface ClubWorldCupGroupSnap {
  name: string;
  table: { pos: number; team: TeamRef & { countrycode: string | null }; GP: number; W: number; D: number; L: number; GF: number; GA: number; GD: number; PTS: number }[];
  fixtures: { round: number; matches: ClubWorldCupMatchSnap[] }[];
}

export interface ClubWorldCupSnap {
  year: number;
  label: string;
  complete: boolean;
  groups: ClubWorldCupGroupSnap[];
  knockout: { label: string; matches: ClubWorldCupMatchSnap[] }[] | null;
  winner: TeamRef | null;
  runnerUp: TeamRef | null;
}

export interface ContinentalTournamentMatchSnap {
  id: string;
  home: TeamRef | null;
  away: TeamRef | null;
  legs: [ScoreSnap | null, ScoreSnap | null] | null;
  legMatchdays: [number, number] | null;
  result: ScoreSnap | null;
  aggregate: { h: number; a: number } | null;
  tiebreak: ScoreSnap | null;
  winner: TeamRef | null;
  bye: boolean;
}

export interface ContinentalTournamentSnap {
  year: number;
  label: string;
  confederation: string;
  complete: boolean;
  rounds: { label: string; matchday: number; matches: ContinentalTournamentMatchSnap[] }[];
  winner: TeamRef | null;
  runnerUp: TeamRef | null;
}

export interface SeasonArchive {
  year: number;
  label: string;
  /** True once matchday 46 has been played. */
  seasonComplete: boolean;
  leagues: Record<number, LeagueSnap>;
  cup: CupSnap;
  european: Record<string, EuroSnap> | null;
  clubWorldCup?: ClubWorldCupSnap | null;
  continentalTournaments?: Record<string, ContinentalTournamentSnap>;
  goldCup?: GoldCupEdition | null;
  goldCupPlayoff?: GoldCupPlayoffEdition | null;
  copaAmerica?: CopaAmericaEdition | null;
}

// ---------------------------------------------------------------------------

const ref = (team: Team): TeamRef => ({ id: team.ID, name: team.Team });

function scoreOf(result: MatchResult | null | undefined): ScoreSnap | null {
  if (!result) return null;
  const homePens = result.homeGoalInfo.penalties;
  const awayPens = result.awayGoalInfo.penalties;
  const score: ScoreSnap = {
    h: result.homeGoalInfo.homeGoals,
    a: result.awayGoalInfo.awayGoals
  };
  if (homePens && awayPens) {
    score.ph = homePens.filter(p => p === "O").length;
    score.pa = awayPens.filter(p => p === "O").length;
  }
  return score;
}

function snapshotClubWorldCupMatch(
  home: Team,
  away: Team,
  result: MatchResult | null,
  winner: Team | null = null
): ClubWorldCupMatchSnap {
  return { home: ref(home), away: ref(away), score: scoreOf(result), winner: winner ? ref(winner) : null };
}

function snapshotClubWorldCup(cup: ClubWorldCup | null): ClubWorldCupSnap | null {
  if (!cup) return null;
  return {
    year: cup.year,
    label: cup.seasonLabel,
    complete: cup.completed,
    groups: cup.groups.map(group => ({
      name: group.name,
      table: group.table.map((row, index) => ({
        pos: index + 1,
        team: { ...ref(row.team), countrycode: row.team.countrycode ?? "ENG" },
        GP: row.GP,
        W: row.W,
        D: row.D,
        L: row.L,
        GF: row.GF,
        GA: row.GA,
        GD: row.GD,
        PTS: row.PTS
      })),
      fixtures: group.fixtures.map((round, index) => ({
        round: index + 1,
        matches: round.map(fixture => snapshotClubWorldCupMatch(
          fixture.homeTeam, fixture.awayTeam, fixture.result
        ))
      }))
    })),
    knockout: cup.knockout?.map(round => ({
      label: round.label,
      matches: round.matches.map(match => snapshotClubWorldCupMatch(
        match.homeTeam, match.awayTeam, match.result, match.winner
      ))
    })) ?? null,
    winner: cup.winner ? ref(cup.winner) : null,
    runnerUp: cup.runnerUp ? ref(cup.runnerUp) : null
  };
}

function continentalRoundLabel(tournament: ContinentalTournament, roundIndex: number): string {
  const round = tournament.bracket.rounds[roundIndex];
  if (roundIndex === tournament.bracket.rounds.length - 1) return "Final";
  if (roundIndex === 0 && tournament.teams.length < tournament.bracket.size) return "Preliminary round";
  if (round.length === 2) return "Semi-finals";
  if (round.length === 4) return "Quarter-finals";
  if (round.length === 8) return "Round of 16";
  if (round.length === 16) return "Round of 32";
  return `Round ${roundIndex + 1}`;
}

function snapshotContinentalMatch(match: BracketMatch): ContinentalTournamentMatchSnap {
  const home = match.player1?.team ?? null;
  const away = match.player2?.team ?? null;
  const aggregate = match.legs?.length === 2 ? getAggregateGoals(match) : null;
  return {
    id: match.id,
    home: home ? { ...ref(home), countrycode: home.countrycode ?? null } : null,
    away: away ? { ...ref(away), countrycode: away.countrycode ?? null } : null,
    legs: match.legs?.length === 2
      ? [scoreOf(match.legs[0].result), scoreOf(match.legs[1].result)]
      : null,
    legMatchdays: match.legs?.length === 2
      ? [match.legs[0].matchday, match.legs[1].matchday]
      : null,
    result: aggregate
      ? { h: aggregate.team1, a: aggregate.team2 }
      : scoreOf(match.result),
    aggregate: aggregate ? { h: aggregate.team1, a: aggregate.team2 } : null,
    tiebreak: scoreOf(match.tiebreak),
    winner: match.winner ? ref(match.winner) : null,
    bye: (home === null) !== (away === null)
  };
}

function snapshotContinentalTournaments(
  tournaments: Record<string, ContinentalTournament>
): Record<string, ContinentalTournamentSnap> {
  return Object.fromEntries(Object.entries(tournaments).map(([confederation, tournament]) => [
    confederation,
    {
      year: tournament.year,
      label: tournament.seasonLabel,
      confederation,
      complete: tournament.completed,
      rounds: tournament.bracket.rounds.map((round, index) => ({
        label: continentalRoundLabel(tournament, index),
        matchday: CONTINENTAL_TOURNAMENT_MATCHDAY + index,
        matches: round.map(snapshotContinentalMatch)
      })),
      winner: tournament.winner ? ref(tournament.winner) : null,
      runnerUp: tournament.runnerUp ? ref(tournament.runnerUp) : null
    }
  ]));
}

function matchSnap(result: MatchResult): MatchSnap {
  return {
    home: ref(result.homeGoalInfo.homeTeam),
    away: ref(result.awayGoalInfo.awayTeam),
    score: scoreOf(result)
  };
}

function snapshotLeague(season: Season, tier: string): LeagueSnap {
  const league = season.leagueStates[tier];
  const standings = getLeagueStandings(league);

  const rows: LeagueRow[] = standings.map((entry, index) => {
    let status: LeagueRow["status"] = null;
    const nextTier = season.nextTierByTeam?.[entry.team.ID];
    if (nextTier !== undefined) {
      status = nextTier < league.tier ? "PROMOTED" : nextTier > league.tier ? "RELEGATED" : "STAYED";
    }
    return {
      pos: index + 1,
      team: ref(entry.team),
      GP: entry.GP, W: entry.W, D: entry.D, L: entry.L,
      GF: entry.GF, GA: entry.GA, GD: entry.GD, PTS: entry.PTS,
      status
    };
  });

  const fixtures: LeagueMatchdaySnap[] = Object.keys(league.schedule)
    .map(Number)
    .sort((a, b) => a - b)
    .map(local => ({
      local,
      matchday: league.startMatchday + local - 1,
      matches: league.schedule[local].map(match => ({
        home: ref(match.homeTeam),
        away: ref(match.awayTeam),
        score: scoreOf(match.result)
      }))
    }));

  const playoff = season.promotionPlayoffs?.[tier] ?? null;

  const teamByID = new Map(league.teams.map(team => [team.ID, team]));
  const prediction = league.prediction
    .map(id => teamByID.get(id))
    .filter((team): team is Team => team !== undefined)
    .map(ref);

  // Semi-final pairings follow the engine: top play-off seed v lowest, and the middle two.
  let playoffFixtures: LeagueSnap["playoffFixtures"] = null;
  const playoffPositions = tier_information[tier]?.PLAYOFF;
  if (league.tier > 1 && playoffPositions && season.matchday >= SEASON_END_MATCHDAY) {
    const seeds = standings
      .slice(playoffPositions[0] - 1, playoffPositions[playoffPositions.length - 1])
      .map(entry => ref(entry.team));
    if (seeds.length === 4) {
      playoffFixtures = {
        semiOne: { home: seeds[0], away: seeds[3] },
        semiTwo: { home: seeds[1], away: seeds[2] }
      };
    }
  }

  return {
    tier: league.tier,
    name: LEAGUE_NAMES[league.tier] ?? `Tier ${league.tier}`,
    rows,
    prediction,
    playoffFixtures,
    fixtures,
    playoffs: playoff
      ? {
          semiOne: matchSnap(playoff.semiOne),
          semiTwo: matchSnap(playoff.semiTwo),
          final: matchSnap(playoff.final),
          winner: ref(playoff.playoffWinner)
        }
      : null,
    complete: season.matchday >= SEASON_END_MATCHDAY
  };
}

function cupRoundLabel(roundNumber: number, totalRounds: number): string {
  if (roundNumber === totalRounds) return "Final";
  if (roundNumber === totalRounds - 1) return "Semi-final";
  if (roundNumber === totalRounds - 2) return "Quarter-final";
  return `Round ${roundNumber}`;
}

function snapshotCup(season: Season): CupSnap {
  const rounds = season.cup.bracket.rounds;
  const rounds_: CupRoundSnap[] = rounds.map((round, roundIndex) => ({
    round: roundIndex + 1,
    label: cupRoundLabel(roundIndex + 1, rounds.length),
    matchday: getCupRoundMatchday(roundIndex + 1),
    matches: round.map(match => {
      const home = match.player1?.team ?? null;
      const away = match.player2?.team ?? null;
      return {
        id: match.id,
        home: home ? { ...ref(home), countrycode: home.countrycode ?? "ENG" } : null,
        away: away ? { ...ref(away), countrycode: away.countrycode ?? "ENG" } : null,
        score: scoreOf(match.result),
        winner: match.winner ? ref(match.winner) : null,
        bye: (home === null) !== (away === null)
      };
    })
  }));

  const finalMatch = rounds[rounds.length - 1][0];
  const winner = finalMatch.winner;
  const runnerUp = winner
    ? ([finalMatch.player1?.team, finalMatch.player2?.team] as (Team | null | undefined)[])
        .find(team => team && team.ID !== winner.ID) ?? null
    : null;

  return {
    rounds: rounds_,
    complete: winner !== null,
    winner: winner ? ref(winner) : null,
    runnerUp: runnerUp ? ref(runnerUp) : null
  };
}

function snapshotEuropean(season: Season): Record<string, EuroSnap> | null {
  if (!season.europeanCompetitions) return null;
  const result: Record<string, EuroSnap> = {};

  for (const [code, competition] of Object.entries(season.europeanCompetitions)) {
    const table: EuroRow[] = getStandings(competition).map((entry, index) => ({
      pos: index + 1,
      team: ref(entry.team),
      countrycode: entry.team.countrycode ?? "-",
      overall: entry.team.BaseOverall,
      GP: entry.GP, W: entry.W, D: entry.D, L: entry.L,
      GF: entry.GF, GA: entry.GA, GD: entry.GD, PTS: entry.PTS
    }));

    const fixtures: LeagueMatchdaySnap[] = Object.keys(competition.leagueSchedule)
      .map(Number)
      .sort((a, b) => a - b)
      .map((matchday, index) => ({
        matchday,
        local: index + 1,
        matches: competition.leagueSchedule[matchday].map(match => ({
          home: ref(match.homeTeam),
          away: ref(match.awayTeam),
          score: scoreOf(match.result)
        }))
      }));

    let knockout: EuroRoundSnap[] | null = null;
    let winner: TeamRef | null = null;
    let runnerUp: TeamRef | null = null;

    if (competition.knockout) {
      const bracket = competition.knockout.bracket;
      knockout = bracket.rounds.map((round, roundIndex) => ({
        key: KNOCKOUT_PHASES[roundIndex].key,
        label: KNOCKOUT_PHASES[roundIndex].label,
        matchdays: getRoundMatchdays(competition, roundIndex),
        ties: round.map(match => {
          const home = match.player1?.team ?? null;
          const away = match.player2?.team ?? null;
          const legs = (match.legs ?? []).map(leg => ({
            matchday: leg.matchday,
            score: scoreOf(leg.result) as ScoreSnap
          }));
          const aggregate = legs.length > 0 && legs.length === 2
            ? (() => { const agg = getAggregateGoals(match); return { h: agg.team1, a: agg.team2 }; })()
            : null;
          return {
            id: match.id,
            home: home ? { ...ref(home), countrycode: home.countrycode ?? "ENG" } : null,
            away: away ? { ...ref(away), countrycode: away.countrycode ?? "ENG" } : null,
            bye: (home === null) !== (away === null),
            legs,
            aggregate,
            tiebreak: match.tiebreak ? scoreOf(match.tiebreak) : null,
            winner: match.winner ? ref(match.winner) : null
          };
        })
      }));

      const finalMatch = bracket.rounds[bracket.rounds.length - 1][0];
      if (finalMatch.winner) {
        winner = ref(finalMatch.winner);
        const loser = ([finalMatch.player1?.team, finalMatch.player2?.team] as (Team | null | undefined)[])
          .find(team => team && team.ID !== finalMatch.winner!.ID) ?? null;
        runnerUp = loser ? ref(loser) : null;
      }
    }

    result[code] = {
      code,
      name: COMPETITION_NAMES[code] ?? competition.name,
      seasonLabel: competition.seasonLabel ?? seasonDisplay(season.year),
      phase: getCurrentPhase(competition),
      complete: competition.completed,
      table,
      pots: competition.pots.map(pot => pot.map(ref)),
      fixtures,
      knockout,
      winner,
      runnerUp
    };
  }

  return result;
}

export function snapshotSeason(season: Season): SeasonArchive {
  const leagues: Record<number, LeagueSnap> = {};
  for (const tier of Object.keys(season.leagueStates)) {
    leagues[Number(tier)] = snapshotLeague(season, tier);
  }

  return {
    year: season.year,
    label: seasonDisplay(season.year),
    seasonComplete: season.matchday >= SEASON_END_MATCHDAY,
    leagues,
    cup: snapshotCup(season),
    european: snapshotEuropean(season),
    clubWorldCup: snapshotClubWorldCup(season.clubWorldCup),
    continentalTournaments: snapshotContinentalTournaments(season.continentalTournaments),
    goldCup: snapshotGoldCup(season.international.goldCup.editions.find(edition => edition.year === season.year) ?? null),
    goldCupPlayoff: snapshotGoldCupPlayoff(
      season.international.goldCup.playoffEditions.find(edition => edition.year === season.year) ?? null
    ),
    copaAmerica: snapshotCopaAmerica(
      season.international.copaAmerica.editions.find(edition => edition.year === season.year) ?? null
    )
  };
}

function snapshotInternationalMatch(match: InternationalMatch): InternationalMatch {
  return {
    ...match,
    homePenalties: match.homePenalties ? [...match.homePenalties] : undefined,
    awayPenalties: match.awayPenalties ? [...match.awayPenalties] : undefined
  };
}

function snapshotGoldCup(edition: GoldCupEdition | null): GoldCupEdition | null {
  if (!edition) return null;
  return {
    ...edition,
    hosts: [...edition.hosts],
    teams: [...edition.teams],
    pots: edition.pots.map(pot => [...pot]),
    seedRanks: { ...edition.seedRanks },
    groups: edition.groups.map(group => ({
      ...group,
      teams: [...group.teams],
      matches: group.matches.map(round => round.map(snapshotInternationalMatch))
    })),
    knockout: edition.knockout?.map(round => ({
      ...round,
      matches: round.matches.map(match => ({
        ...match,
        fixture: snapshotInternationalMatch(match.fixture)
      }))
    })) ?? null,
    semifinalists: [...edition.semifinalists]
  };
}

function snapshotCopaAmerica(edition: CopaAmericaEdition | null): CopaAmericaEdition | null {
  return snapshotGoldCup(edition);
}

function snapshotGoldCupPlayoff(edition: GoldCupPlayoffEdition | null): GoldCupPlayoffEdition | null {
  if (!edition) return null;
  return {
    ...edition,
    directQualifiers: [...edition.directQualifiers],
    entrants: [...edition.entrants],
    qualifiers: [...edition.qualifiers],
    ties: edition.ties.map(tie => ({
      ...tie,
      firstLeg: snapshotInternationalMatch(tie.firstLeg),
      secondLeg: snapshotInternationalMatch(tie.secondLeg),
      penalties: tie.penalties ? { home: [...tie.penalties.home], away: [...tie.penalties.away] } : null
    }))
  };
}

// ---------------------------------------------------------------------------
// Team fixtures (works on any snapshot — current or archived)
// ---------------------------------------------------------------------------

export interface TeamFixture {
  matchday: number;
  /** League tier number, or a competition code such as "CUP", "UCL", or "CWC". */
  competitionCode: string;
  competition: string;
  /** Route of the competition's page (league, FA Cup, European competition). */
  link: string;
  stage: string;
  opponent: TeamRef;
  home: boolean;
  /** Result from this team's perspective (null = not played yet). */
  result: {
    gf: number;
    ga: number;
    outcome: "W" | "D" | "L";
    pso?: { gf: number; ga: number };
  } | null;
  /** Aggregate note for second legs / ties, e.g. "Agg 3-2". */
  note?: string;
}

const COMPETITION_ORDER: Record<string, number> = { LEAGUE: 0, CUP: 1, UCL: 2, UEL: 3, UECL: 4, CWC: 5, CONTINENTAL: 6 };

function toResult(
  score: ScoreSnap | null,
  isHome: boolean,
  winnerID?: number | null,
  teamID?: number
): TeamFixture["result"] {
  if (!score) return null;
  const gf = isHome ? score.h : score.a;
  const ga = isHome ? score.a : score.h;
  let outcome: "W" | "D" | "L" = gf > ga ? "W" : gf < ga ? "L" : "D";
  let pso: { gf: number; ga: number } | undefined;
  if (score.ph !== undefined && score.pa !== undefined) {
    pso = isHome ? { gf: score.ph, ga: score.pa } : { gf: score.pa, ga: score.ph };
    // A knockout match decided on penalties is a W/L for form/fixture purposes.
    outcome = pso.gf > pso.ga ? "W" : "L";
  } else if (winnerID !== undefined && winnerID !== null && teamID !== undefined && gf === ga) {
    outcome = winnerID === teamID ? "W" : "L";
  }
  return { gf, ga, outcome, pso };
}

/** True when a tie's tiebreak was a straight penalty shootout (0-0 plus penalties). */
export function isPenaltiesOnly(tiebreak: ScoreSnap): boolean {
  return tiebreak.h === 0 && tiebreak.a === 0 && tiebreak.ph !== undefined && tiebreak.pa !== undefined;
}

export function buildTeamFixtures(arch: SeasonArchive, teamID: number): TeamFixture[] {
  const fixtures: TeamFixture[] = [];

  for (const league of Object.values(arch.leagues)) {
    for (const day of league.fixtures) {
      for (const match of day.matches) {
        if (match.home.id !== teamID && match.away.id !== teamID) continue;
        const isHome = match.home.id === teamID;
        fixtures.push({
          matchday: day.matchday,
          competitionCode: "LEAGUE",
          competition: league.name,
          link: `/league/${league.tier}`,
          stage: `Matchday ${day.local}`,
          opponent: isHome ? match.away : match.home,
          home: isHome,
          result: toResult(match.score, isHome)
        });
      }
    }

    if (league.playoffs) {
      const playoffMatches: [string, MatchSnap][] = [
        ["Play-off semi-final", league.playoffs.semiOne],
        ["Play-off semi-final", league.playoffs.semiTwo],
        ["Play-off final", league.playoffs.final]
      ];
      for (const [stage, match] of playoffMatches) {
        if (match.home.id !== teamID && match.away.id !== teamID) continue;
        const isHome = match.home.id === teamID;
        fixtures.push({
          matchday: SEASON_END_MATCHDAY + (stage === "Play-off final" ? 2 : 1),
          competitionCode: "LEAGUE",
          competition: `${league.name} Play-offs`,
          link: `/league/${league.tier}`,
          stage,
          opponent: isHome ? match.away : match.home,
          home: isHome,
          result: toResult(match.score, isHome)
        });
      }
    }
  }

  for (const round of arch.cup.rounds) {
    for (const match of round.matches) {
      if (!match.home || !match.away) continue;
      if (match.home.id !== teamID && match.away.id !== teamID) continue;
      const isHome = match.home.id === teamID;
      fixtures.push({
        matchday: round.matchday,
        competitionCode: "CUP",
        competition: CUP_NAME,
        link: "/cup",
        stage: round.label,
        opponent: isHome ? match.away : match.home,
        home: isHome,
        result: toResult(match.score, isHome, match.winner?.id ?? null, teamID)
      });
    }
  }

  for (const [code, comp] of Object.entries(arch.european ?? {})) {
    for (const day of comp.fixtures) {
      for (const match of day.matches) {
        if (match.home.id !== teamID && match.away.id !== teamID) continue;
        const isHome = match.home.id === teamID;
        fixtures.push({
          matchday: day.matchday,
          competitionCode: code,
          competition: comp.name,
          link: `/europe/${code}`,
          stage: `League phase ${day.local}`,
          opponent: isHome ? match.away : match.home,
          home: isHome,
          result: toResult(match.score, isHome)
        });
      }
    }

    for (const round of comp.knockout ?? []) {
      for (const tie of round.ties) {
        if (!tie.home || !tie.away) continue;
        if (tie.home.id !== teamID && tie.away.id !== teamID) continue;
        const isHome = tie.home.id === teamID;
        const isFinal = round.key === "F";

        round.matchdays.forEach((matchday, legIndex) => {
          const leg = tie.legs[legIndex];
          const lastLeg = legIndex === round.matchdays.length - 1;
          let note: string | undefined;
          if (!isFinal && lastLeg && leg && tie.aggregate) {
            const mine = isHome ? tie.aggregate.h : tie.aggregate.a;
            const theirs = isHome ? tie.aggregate.a : tie.aggregate.h;
            note = `Agg ${mine}-${theirs}`;
            if (tie.tiebreak) {
              const tb = tie.tiebreak;
              const mine = isHome ? tb.ph : tb.pa;
              const theirs = isHome ? tb.pa : tb.ph;
              if (isPenaltiesOnly(tb)) {
                note += ` · penalties ${mine}-${theirs}`;
              } else {
                // Older saves: the tie was decided by an extra match.
                note += tb.ph !== undefined && tb.pa !== undefined
                  ? ` · tiebreak ${isHome ? tb.h : tb.a}-${isHome ? tb.a : tb.h} (${mine}-${theirs} PSO)`
                  : ` · tiebreak ${isHome ? tb.h : tb.a}-${isHome ? tb.a : tb.h}`;
              }
            }
          }
          fixtures.push({
            matchday,
            competitionCode: code,
            competition: comp.name,
            link: `/europe/${code}`,
            stage: isFinal
              ? "Final"
              : `${round.label} (leg ${legIndex + 1})`,
            opponent: isHome ? tie.away! : tie.home!,
            home: isHome,
            result: leg ? toResult(leg.score, isHome, isFinal ? tie.winner?.id ?? null : null, teamID) : null,
            note
          });
        });
      }
    }
  }

  for (const group of arch.clubWorldCup?.groups ?? []) {
    for (const round of group.fixtures) {
      for (const match of round.matches) {
        if (match.home.id !== teamID && match.away.id !== teamID) continue;
        const isHome = match.home.id === teamID;
        fixtures.push({
          matchday: 21,
          competitionCode: "CWC",
          competition: CLUB_WORLD_CUP_NAME,
          link: "/club-world-cup",
          stage: `Group ${group.name} · Matchday ${round.round}`,
          opponent: isHome ? match.away : match.home,
          home: isHome,
          result: toResult(match.score, isHome)
        });
      }
    }
  }
  for (const round of arch.clubWorldCup?.knockout ?? []) {
    for (const match of round.matches) {
      if (match.home.id !== teamID && match.away.id !== teamID) continue;
      const isHome = match.home.id === teamID;
      fixtures.push({
        matchday: 21,
        competitionCode: "CWC",
        competition: CLUB_WORLD_CUP_NAME,
        link: "/club-world-cup",
        stage: round.label,
        opponent: isHome ? match.away : match.home,
        home: isHome,
        result: toResult(match.score, isHome, match.winner?.id ?? null, teamID)
      });
    }
  }

  for (const tournament of Object.values(arch.continentalTournaments ?? {})) {
    for (const round of tournament.rounds) {
      for (const match of round.matches) {
        if (!match.home || !match.away || (match.home.id !== teamID && match.away.id !== teamID)) continue;
        if (match.legs && match.legMatchdays) {
          const isBracketHome = match.home.id === teamID;
          const opponent = isBracketHome ? match.away : match.home;
          match.legs.forEach((score, legIndex) => {
            if (!score) return;
            const firstLeg = legIndex === 0;
            const isHome = firstLeg ? isBracketHome : !isBracketHome;
            const lastLeg = legIndex === 1;
            let note: string | undefined;
            if (lastLeg && match.aggregate) {
              const goalsFor = isBracketHome ? match.aggregate.h : match.aggregate.a;
              const goalsAgainst = isBracketHome ? match.aggregate.a : match.aggregate.h;
              note = `Agg ${goalsFor}-${goalsAgainst}`;
              if (match.tiebreak) {
                const penaltiesFor = isBracketHome ? match.tiebreak.ph : match.tiebreak.pa;
                const penaltiesAgainst = isBracketHome ? match.tiebreak.pa : match.tiebreak.ph;
                note += ` · penalties ${penaltiesFor}-${penaltiesAgainst}`;
              }
            }
            let result = toResult(score, isHome);
            if (lastLeg && match.winner) {
              const won = match.winner.id === teamID;
              result = {
                gf: result?.gf ?? 0,
                ga: result?.ga ?? 0,
                outcome: won ? "W" : "L",
                pso: match.tiebreak?.ph !== undefined && match.tiebreak.pa !== undefined
                  ? {
                      gf: isBracketHome ? match.tiebreak.ph : match.tiebreak.pa,
                      ga: isBracketHome ? match.tiebreak.pa : match.tiebreak.ph
                    }
                  : undefined
              };
            }
            fixtures.push({
              matchday: match.legMatchdays![legIndex],
              competitionCode: "CONTINENTAL",
              competition: `${tournament.confederation} Championship`,
              link: "/club-world-cup/continental",
              stage: `${round.label} (leg ${legIndex + 1})`,
              opponent,
              home: isHome,
              result,
              note
            });
          });
        } else if (match.result) {
          const isHome = match.home.id === teamID;
          fixtures.push({
            matchday: round.matchday,
            competitionCode: "CONTINENTAL",
            competition: `${tournament.confederation} Championship`,
            link: "/club-world-cup/continental",
            stage: round.label,
            opponent: isHome ? match.away : match.home,
            home: isHome,
            result: toResult(match.result, isHome, match.winner?.id ?? null, teamID)
          });
        }
      }
    }
  }

  return fixtures.sort((a, b) =>
    a.matchday - b.matchday ||
    (COMPETITION_ORDER[a.competitionCode === "LEAGUE" || /^\d+$/.test(a.competitionCode) ? "LEAGUE" : a.competitionCode] ?? 9) -
      (COMPETITION_ORDER[b.competitionCode === "LEAGUE" || /^\d+$/.test(b.competitionCode) ? "LEAGUE" : b.competitionCode] ?? 9) ||
    a.competition.localeCompare(b.competition)
  );
}

// ---------------------------------------------------------------------------
// Trophies
// ---------------------------------------------------------------------------

export interface Trophy {
  year: number;
  season: string;
  /** "LEAGUE" | "CUP" | "UCL" | "UEL" | "UECL" */
  kind: string;
  name: string;
}

export function buildTrophies(archives: SeasonArchive[], teamID: number): Trophy[] {
  const trophies: Trophy[] = [];

  for (const arch of archives) {
    for (const league of Object.values(arch.leagues)) {
      if (league.complete && league.rows[0]?.team.id === teamID) {
        trophies.push({ year: arch.year, season: arch.label, kind: "LEAGUE", name: `${league.name} Champions` });
      }
    }
    if (arch.cup.complete && arch.cup.winner?.id === teamID) {
      trophies.push({ year: arch.year, season: arch.label, kind: "CUP", name: `${CUP_NAME} Winners` });
    }
    for (const [code, comp] of Object.entries(arch.european ?? {})) {
      if (comp.complete && comp.winner?.id === teamID) {
        trophies.push({ year: arch.year, season: arch.label, kind: code, name: `${comp.name} Winners` });
      }
    }
    if (arch.clubWorldCup?.complete && arch.clubWorldCup.winner?.id === teamID) {
      trophies.push({
        year: arch.year,
        season: arch.label,
        kind: "CWC",
        name: `${CLUB_WORLD_CUP_NAME} Winners`
      });
    }
    for (const [confederation, tournament] of Object.entries(arch.continentalTournaments ?? {})) {
      if (tournament.complete && tournament.winner?.id === teamID) {
        trophies.push({
          year: arch.year,
          season: arch.label,
          kind: "CONTINENTAL",
          name: `${confederation} Championship Winners`
        });
      }
    }
  }

  return trophies.sort((a, b) => b.year - a.year);
}
