import europeanTeamPoolRaw from "./data/european_team_pool.json";
import europeanAllocationsRaw from "./data/european_allocations.json";
import europeanMatchdaysRaw from "./data/european_matchdays.json";
import { Team } from "./team";
import { scheduleBracket } from "./scheduler";
import { simulateMatch, parseKOMatchWinner, simulatePenaltyShootoutOnly } from "./matchEngine";
import { updateFormAfterMatch } from "./form";
import { getLeagueStandings } from "./league";
import { clubStarBonus } from "./squadStrength";
import type {
  Bracket, BracketMatch, FinalHistory, FixtureMatch, MatchResult, SeasonHistoryEntry, TableEntry
} from "./types";
import type { Season } from "./season";

export interface EuropeanPoolTeam {
  id: number;
  team: string;
  overall: number;
  countrycode: string;
}

export const europeanTeamPool = europeanTeamPoolRaw as Record<string, EuropeanPoolTeam[]>;
const europeanAllocations = europeanAllocationsRaw as unknown as Record<string, any>;
export const europeanMatchdays = europeanMatchdaysRaw as Record<string, Record<string, number>>;

export const COMPETITION_NAMES: Record<string, string> = {
  UCL: "Champions League",
  UEL: "Europa League",
  UECL: "Conference League"
};

export const COMPETITION_CODES = ["UCL", "UEL", "UECL"] as const;

export const LEAGUE_PHASE_KEYS = [
  "GS 1", "GS 2", "GS 3", "GS 4",
  "GS 5", "GS 6", "GS 7", "GS 8"
];

export const KNOCKOUT_PHASES = [
  { key: "KO R1", label: "Knockout Round" },
  { key: "RO16", label: "Round of 16" },
  { key: "QF", label: "Quarterfinal" },
  { key: "SF", label: "Semifinal" },
  { key: "F", label: "Final" }
];

export interface EuropeanKnockout {
  bracket: Bracket;
  currentRound: number;
  currentLeg: number;
  qualifiedTeams: Team[];
}

export interface EuropeanCompetition {
  code: string;
  name: string;
  teams: Team[];
  pots: Team[][];
  leagueSchedule: Record<number, FixtureMatch[]>;
  matchdays: Record<string, number>;
  table: Record<number, TableEntry>;
  lastCompletedLeagueMatchday: number | null;
  knockout: EuropeanKnockout | null;
  completed: boolean;
  history: FinalHistory[];
  seasonLabel?: string;
}

function shuffle<T>(values: T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function weightedPickIndex(teams: Team[]): number {
  const weights = teams.map(team => Math.max(1, Math.pow(Math.max(1, team.BaseOverall - 50), 3)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let random = Math.random() * total;

  for (let index = 0; index < teams.length; index++) {
    random -= weights[index];
    if (random < 0) return index;
  }

  return teams.length - 1;
}

function weightedRankTeams(teams: Team[], guaranteedNames: string[] = []): Team[] {
  const remaining = [...teams];
  const guaranteed: Team[] = [];

  for (const name of guaranteedNames) {
    const index = remaining.findIndex(team => team.Team === name);
    if (index === -1) continue;
    guaranteed.push(remaining.splice(index, 1)[0]);
  }

  const ranked = [...guaranteed];
  while (remaining.length > 0) {
    const index = weightedPickIndex(remaining);
    ranked.push(remaining.splice(index, 1)[0]);
  }

  return ranked;
}

function createEuropeanTeam(raw: EuropeanPoolTeam): Team {
  const team = new Team({
    ID: raw.id,
    Team: raw.team,
    Overall: raw.overall,
    BaseOverall: raw.overall,
    Tier: 0
  });

  team.countrycode = raw.countrycode;
  team.isEuropeanGuest = true;
  return team;
}

function getForeignPoolTeams(countryCode: string): Team[] {
  return (europeanTeamPool[countryCode] ?? []).map(createEuropeanTeam);
}

type Entrants = Record<"UCL" | "UEL" | "UECL", Team[]>;

function getEnglandQualifiedTeams(previousSeason: Season): Entrants {
  const league = previousSeason.leagueStates[1];
  const ranked = getLeagueStandings(league).map(entry => entry.team);

  const allocation = europeanAllocations.ENG;
  const uclEnd = allocation.UCL;
  const uelEnd = uclEnd + allocation.UEL;
  const ueclEnd = uelEnd + allocation.UECL;

  const ucl = ranked.slice(0, uclEnd);
  let uel = ranked.slice(uclEnd, uelEnd);
  let uecl = ranked.slice(uelEnd, ueclEnd);

  // The FA Cup winner is guaranteed a Europa League place. If they have not already
  // qualified through the league (UCL or UEL positions), they take a UEL place, the
  // lowest league-qualified UEL side drops to the Conference League, and the last
  // Conference League place (by league position) is lost.
  const finalMatch = previousSeason.cup.bracket.rounds[previousSeason.cup.bracket.rounds.length - 1][0];
  const cupWinner = finalMatch.winner;
  if (cupWinner && !ucl.includes(cupWinner) && !uel.includes(cupWinner)) {
    const dropped = uel.pop() as Team;
    uel.push(cupWinner);
    uecl = [dropped, ...uecl.filter(team => team !== cupWinner)].slice(0, allocation.UECL);
  }

  const result: Entrants = { UCL: ucl, UEL: uel, UECL: uecl };

  for (const team of [...ucl, ...uel, ...uecl]) {
    team.countrycode = "ENG";
    team.isEuropeanGuest = false;
  }

  return result;
}

function allocateForeignCountry(countryCode: string): Entrants {
  const teams = getForeignPoolTeams(countryCode);
  const allocation = europeanAllocations[countryCode];
  if (!allocation) return { UCL: [], UEL: [], UECL: [] };

  const guaranteed: string[] = europeanAllocations.guaranteedUCL?.[countryCode] ?? [];
  const ranked = weightedRankTeams(teams, guaranteed);

  const uclEnd = allocation.UCL;
  const uelEnd = uclEnd + allocation.UEL;
  const ueclEnd = uelEnd + allocation.UECL;

  return {
    UCL: ranked.slice(0, uclEnd),
    UEL: ranked.slice(uclEnd, uelEnd),
    UECL: ranked.slice(uelEnd, ueclEnd)
  };
}

const COMPETITION_RANK: Record<keyof Entrants, number> = { UCL: 0, UEL: 1, UECL: 2 };
const OTHER_GROUPS = new Set(["OTHER", "OTHER_UECL"]);

interface PoolLookupEntry {
  raw: EuropeanPoolTeam;
}

function findPoolTeam(teamID: number): PoolLookupEntry | null {
  for (const teams of Object.values(europeanTeamPool)) {
    const raw = teams.find(team => team.id === teamID);
    if (raw) return { raw };
  }
  return null;
}

function findCompetitionOf(entrants: Entrants, teamID: number): keyof Entrants | null {
  for (const code of Object.keys(entrants) as (keyof Entrants)[]) {
    if (entrants[code].some(team => team.ID === teamID)) return code;
  }
  return null;
}

/** Last season's European champions: [competition won, the team's ID]. */
function getPreviousEuropeanWinners(previousSeason: Season): { won: keyof Entrants; teamID: number }[] {
  const winners: { won: keyof Entrants; teamID: number }[] = [];
  for (const code of ["UCL", "UEL", "UECL"] as const) {
    const competition = previousSeason.europeanCompetitions?.[code];
    const bracket = competition?.knockout?.bracket;
    if (!competition || !competition.completed || !bracket) continue;
    const winner = bracket.rounds[bracket.rounds.length - 1][0].winner;
    if (winner) winners.push({ won: code, teamID: winner.ID });
  }
  return winners;
}

/**
 * European champions are guaranteed a place next season:
 *   UCL winner -> UCL, UEL winner -> UCL, UECL winner -> UEL.
 * The normal selection runs first. A champion already in their guaranteed competition (or a
 * higher one) is left alone. Otherwise the champion takes a place in the guaranteed
 * competition and an "OTHER"-category team is swapped out; if the champion was drawn into a
 * lower competition, the swapped-out team takes the champion's vacated place there.
 */
function applyEuropeanChampionQualification(
  previousSeason: Season,
  entrants: Entrants,
  groupOf: Map<number, string>
): void {
  const targets: Record<keyof Entrants, keyof Entrants> = { UCL: "UCL", UEL: "UCL", UECL: "UEL" };
  const winners = getPreviousEuropeanWinners(previousSeason);
  const protectedIDs = new Set(winners.map(winner => winner.teamID));
  const guaranteedNames: string[] = Object.values(europeanAllocations.guaranteedUCL ?? {}).flat() as string[];

  for (const winner of winners) {
    const target = targets[winner.won];
    const current = findCompetitionOf(entrants, winner.teamID);
    if (current !== null && COMPETITION_RANK[current] <= COMPETITION_RANK[target]) continue;

    // Resolve the champion as a live Team object.
    let champion: Team | null = null;
    if (current !== null) {
      champion = entrants[current].find(team => team.ID === winner.teamID) as Team;
    } else {
      champion = getTeamFromSeasonByID(previousSeason, winner.teamID);
      if (!champion) {
        const pool = findPoolTeam(winner.teamID);
        if (pool) {
          champion = createEuropeanTeam(pool.raw);
          groupOf.set(champion.ID, "OTHER");
        }
      }
      if (champion && champion.countrycode === undefined) champion.countrycode = "ENG";
    }
    if (!champion) continue;

    // Pick the team to swap out of the target competition: an "OTHER" team.
    const candidates = entrants[target].filter(team =>
      !protectedIDs.has(team.ID) && OTHER_GROUPS.has(groupOf.get(team.ID) ?? "")
    );
    let victim: Team | undefined = candidates[Math.floor(Math.random() * candidates.length)];
    if (!victim) {
      // Fallback (should not occur with the current allocations): the weakest non-English,
      // non-guaranteed, non-champion team in the target competition.
      victim = [...entrants[target]]
        .filter(team =>
          !protectedIDs.has(team.ID) && team.isEuropeanGuest && !guaranteedNames.includes(team.Team)
        )
        .sort((a, b) => a.BaseOverall - b.BaseOverall)[0];
    }
    if (!victim) throw new Error(`Unable to find a team to swap out of the ${target} for the champion.`);

    entrants[target] = entrants[target].filter(team => team.ID !== victim!.ID);
    entrants[target].push(champion);
    if (current !== null) {
      entrants[current] = entrants[current].filter(team => team.ID !== champion!.ID);
      entrants[current].push(victim);
    }
    if (champion.isEuropeanGuest === undefined) champion.isEuropeanGuest = false;
  }
}

function getTeamFromSeasonByID(season: Season, teamID: number): Team | null {
  for (const league of Object.values(season.leagueStates)) {
    const team = league.teams.find(candidate => candidate.ID === teamID);
    if (team) {
      team.countrycode = "ENG";
      team.isEuropeanGuest = false;
      return team;
    }
  }
  return null;
}

function buildEuropeanEntrants(previousSeason: Season): Entrants {
  const entrants: Entrants = {
    UCL: [],
    UEL: [],
    UECL: []
  };
  // Which selection group (country / "OTHER" / "OTHER_UECL") each entrant came from.
  const groupOf = new Map<number, string>();

  // The FA Cup winner swap is applied domestically inside getEnglandQualifiedTeams.
  const england = getEnglandQualifiedTeams(previousSeason);
  for (const competition of Object.keys(entrants) as (keyof Entrants)[]) {
    entrants[competition].push(...england[competition]);
    england[competition].forEach(team => groupOf.set(team.ID, "ENG"));
  }

  for (const countryCode of Object.keys(europeanTeamPool)) {
    const allocation = allocateForeignCountry(countryCode);
    for (const competition of Object.keys(entrants) as (keyof Entrants)[]) {
      entrants[competition].push(...allocation[competition]);
      allocation[competition].forEach(team => groupOf.set(team.ID, countryCode));
    }
  }

  // Then guarantee last season's European champions their places.
  applyEuropeanChampionQualification(previousSeason, entrants, groupOf);

  for (const competition of Object.keys(entrants) as (keyof Entrants)[]) {
    if (entrants[competition].length !== 36) {
      throw new Error(`${COMPETITION_NAMES[competition]} requires 36 entrants but received ${entrants[competition].length}.`);
    }
    const ids = new Set(entrants[competition].map(team => team.ID));
    if (ids.size !== 36) throw new Error(`${COMPETITION_NAMES[competition]} has duplicate entrants.`);
  }

  return entrants;
}

function createPots(teams: Team[]): Team[][] {
  const ranked = [...teams].sort((a, b) =>
    b.BaseOverall - a.BaseOverall || a.Team.localeCompare(b.Team)
  );

  return Array.from({ length: 4 }, (_, index) =>
    shuffle(ranked.slice(index * 9, index * 9 + 9))
  );
}

function buildSwissGraph(pots: Team[][]): Map<number, Set<number>> {
  const adjacency = new Map<number, Set<number>>();
  const addEdge = (teamA: Team, teamB: Team) => {
    if (!adjacency.has(teamA.ID)) adjacency.set(teamA.ID, new Set());
    if (!adjacency.has(teamB.ID)) adjacency.set(teamB.ID, new Set());
    adjacency.get(teamA.ID)!.add(teamB.ID);
    adjacency.get(teamB.ID)!.add(teamA.ID);
  };

  // Each team gets two opponents from its own pot via a 9-team cycle.
  for (const pot of pots) {
    const offset = Math.floor(Math.random() * pot.length);
    const ordered = [...pot.slice(offset), ...pot.slice(0, offset)];
    for (let index = 0; index < ordered.length; index++) {
      addEdge(ordered[index], ordered[(index + 1) % ordered.length]);
    }
  }

  // Each team gets two opponents from every other pot. The two cyclic shifts
  // create a 2-regular bipartite graph between each pair of pots.
  for (let firstPot = 0; firstPot < pots.length; firstPot++) {
    for (let secondPot = firstPot + 1; secondPot < pots.length; secondPot++) {
      const first = shuffle(pots[firstPot]);
      const second = shuffle(pots[secondPot]);
      for (let index = 0; index < first.length; index++) {
        addEdge(first[index], second[index]);
        addEdge(first[index], second[(index + 1) % second.length]);
      }
    }
  }

  return adjacency;
}

function findPerfectMatching(adjacency: Map<number, Set<number>>): [number, number][] | null {
  const unmatched = new Set(adjacency.keys());
  const matching: [number, number][] = [];
  let attempts = 0;

  function search(): boolean {
    if (unmatched.size === 0) return true;
    if (++attempts > 250000) return false;

    let selected: number | null = null;
    let selectedNeighbors: number[] | null = null;

    for (const id of unmatched) {
      const neighbors = [...(adjacency.get(id) ?? [])]
        .filter(candidate => unmatched.has(candidate));
      if (selected === null || neighbors.length < (selectedNeighbors as number[]).length) {
        selected = id;
        selectedNeighbors = neighbors;
      }
    }

    if (!(selectedNeighbors as number[]).length) return false;

    const neighborsList = selectedNeighbors as number[];
    const selectedID = selected as number;

    neighborsList.sort(() => Math.random() - 0.5);
    neighborsList.sort((a, b) => {
      const degreeA = [...(adjacency.get(a) ?? [])].filter(id => unmatched.has(id)).length;
      const degreeB = [...(adjacency.get(b) ?? [])].filter(id => unmatched.has(id)).length;
      return degreeA - degreeB;
    });

    for (const neighbor of neighborsList) {
      unmatched.delete(selectedID);
      unmatched.delete(neighbor);
      matching.push([selectedID, neighbor]);

      if (search()) return true;

      matching.pop();
      unmatched.add(selectedID);
      unmatched.add(neighbor);
    }

    return false;
  }

  return search() ? matching : null;
}

interface Pairing {
  homeID: number;
  awayID: number;
  index: number;
}

function factorizeSwissGraph(adjacency: Map<number, Set<number>>): Pairing[][] | null {
  const remaining = new Map(
    [...adjacency.entries()].map(([id, neighbors]) => [id, new Set(neighbors)])
  );
  const matchdays: Pairing[][] = [];

  for (let round = 0; round < 8; round++) {
    const matching = findPerfectMatching(remaining);
    if (!matching) return null;

    const matches = matching.map(([homeID, awayID], index) => ({
      homeID,
      awayID,
      index
    }));

    for (const [first, second] of matching) {
      remaining.get(first)!.delete(second);
      remaining.get(second)!.delete(first);
    }

    matchdays.push(matches);
  }

  return matchdays;
}

function scheduleLeaguePhase(teams: Team[]): { schedule: Record<number, FixtureMatch[]>; pots: Team[][] } {
  const pots = createPots(teams);
  const teamByID = new Map(teams.map(team => [team.ID, team]));

  for (let attempt = 0; attempt < 100; attempt++) {
    const graph = buildSwissGraph(pots);
    const factorized = factorizeSwissGraph(graph);
    if (!factorized) continue;

    const schedule: Record<number, FixtureMatch[]> = {};
    const targetMatchdays = LEAGUE_PHASE_KEYS.map(key => europeanMatchdays.UCL[key]);

    for (let round = 0; round < factorized.length; round++) {
      schedule[targetMatchdays[round]] = factorized[round].map((pairing, index) => {
        const first = teamByID.get(pairing.homeID) as Team;
        const second = teamByID.get(pairing.awayID) as Team;
        const homeFirst = (round + index) % 2 === 0;
        return {
          homeTeam: homeFirst ? first : second,
          awayTeam: homeFirst ? second : first,
          result: null
        };
      });
    }

    return { schedule, pots };
  }

  throw new Error("Unable to construct an 8-matchday Swiss league-phase schedule.");
}

function createTable(teams: Team[]): Record<number, TableEntry> {
  return Object.fromEntries(teams.map(team => [team.ID, {
    team,
    GP: 0,
    PTS: 0,
    W: 0,
    D: 0,
    L: 0,
    GD: 0,
    GF: 0,
    GA: 0
  }]));
}

function updateTable(table: Record<number, TableEntry>, result: MatchResult): void {
  const home = table[result.homeGoalInfo.homeTeam.ID];
  const away = table[result.awayGoalInfo.awayTeam.ID];
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
    away.L++;
  } else if (homeGoals < awayGoals) {
    home.L++;
    away.W++;
  } else {
    home.D++;
    away.D++;
  }

  home.PTS = home.W * 3 + home.D;
  away.PTS = away.W * 3 + away.D;
  home.GD = home.GF - home.GA;
  away.GD = away.GF - away.GA;
}

export function getStandings(competition: EuropeanCompetition): TableEntry[] {
  return Object.values(competition.table).sort((a, b) =>
    b.PTS - a.PTS ||
    b.GD - a.GD ||
    b.GF - a.GF ||
    b.team.BaseOverall - a.team.BaseOverall ||
    a.team.Team.localeCompare(b.team.Team)
  );
}

export function getCurrentPhase(competition: EuropeanCompetition): string {
  if (competition.completed) return "COMPLETE";
  if (competition.knockout) {
    const round = KNOCKOUT_PHASES[competition.knockout.bracket.activeRound];
    return round?.label ?? "Knockout";
  }
  return "LEAGUE PHASE";
}

function simulateLeagueMatchday(competition: EuropeanCompetition, matchday: number): void {
  const matches = competition.leagueSchedule[matchday];
  if (!matches) return;

  for (const match of matches) {
    const result = simulateMatch(match.homeTeam, match.awayTeam, false, "EUROPE");
    match.result = result;
    updateTable(competition.table, result);
    updateFormAfterMatch(result);
  }

  competition.lastCompletedLeagueMatchday = matchday;
}

function getRoundKeyForIndex(index: number): string {
  return KNOCKOUT_PHASES[index].key;
}

export function getRoundMatchdays(competition: EuropeanCompetition, roundIndex: number): number[] {
  const key = getRoundKeyForIndex(roundIndex);
  if (key === "F") return [competition.matchdays.F];
  return [competition.matchdays[`${key} 1`], competition.matchdays[`${key} 2`]];
}

function setupKnockout(competition: EuropeanCompetition): void {
  const standings = getStandings(competition);
  const qualified = standings.slice(0, 24).map(entry => entry.team);
  const bracket = scheduleBracket(qualified, 2);

  competition.knockout = {
    bracket,
    currentRound: 0,
    currentLeg: 1,
    qualifiedTeams: qualified
  };
}

export function getAggregateGoals(match: BracketMatch): { team1: number; team2: number } {
  return (match.legs ?? []).reduce((sum, leg) => ({
    team1: sum.team1 + leg.result.homeGoalInfo.homeGoals,
    team2: sum.team2 + leg.result.awayGoalInfo.awayGoals
  }), { team1: 0, team2: 0 });
}

function resolveTie(match: BracketMatch, team1: Team, team2: Team): Team {
  const aggregate = getAggregateGoals(match);
  if (aggregate.team1 > aggregate.team2) return team1;
  if (aggregate.team2 > aggregate.team1) return team2;

  // Level on aggregate: decided by a penalty shootout (no extra match is played).
  const shootout = simulatePenaltyShootoutOnly(team1, team2);
  match.tiebreak = shootout;
  return parseKOMatchWinner(shootout);
}

function prepareNextRound(bracket: Bracket, round: BracketMatch[]): void {
  if (round.length === 0) return;
  const nextRound = bracket.rounds[bracket.activeRound + 1];
  if (!nextRound) return;

  for (let index = 0; index < round.length; index++) {
    const nextMatch = nextRound[Math.floor(index / 2)];
    const winner = round[index].winner;
    const slot = { team: winner };
    if (index % 2 === 0) nextMatch.player1 = slot;
    else nextMatch.player2 = slot;
  }
}

function simulateKnockoutLeg(competition: EuropeanCompetition, matchday: number): void {
  const knockout = competition.knockout as EuropeanKnockout;
  const bracket = knockout.bracket;
  const round = bracket.rounds[knockout.currentRound];
  const isFinal = knockout.currentRound === bracket.rounds.length - 1;
  const leg = isFinal ? 1 : knockout.currentLeg;

  for (const match of round) {
    const team1 = match.player1?.team ?? null;
    const team2 = match.player2?.team ?? null;

    if (team1 === null && team2 === null) continue;

    if (team1 === null || team2 === null) {
      match.winner = team1 ?? team2;
      continue;
    }

    if (!match.legs) match.legs = [];

    const result = simulateMatch(team1, team2, isFinal, "EUROPE");
    match.legs.push({ matchday, result });

    if (isFinal) {
      match.result = result;
      match.winner = parseKOMatchWinner(result);
      updateFormAfterMatch(result, match.winner);
      continue;
    }

    updateFormAfterMatch(result);

    if (leg === 2) {
      match.winner = resolveTie(match, team1, team2);
    }
  }

  if (isFinal) {
    competition.completed = true;
    return;
  }

  if (knockout.currentLeg === 1) {
    knockout.currentLeg = 2;
    return;
  }

  prepareNextRound(bracket, round);
  bracket.activeRound++;
  knockout.currentRound++;
  knockout.currentLeg = 1;
}

function createCompetition(code: string, teams: Team[], history: FinalHistory[]): EuropeanCompetition {
  const leaguePhase = scheduleLeaguePhase(teams);
  const matchdays = europeanMatchdays[code];

  const leagueSchedule: Record<number, FixtureMatch[]> = {};
  const sourceMatchdays = Object.keys(leaguePhase.schedule);
  const targetMatchdays = LEAGUE_PHASE_KEYS.map(key => matchdays[key]);
  for (let index = 0; index < targetMatchdays.length; index++) {
    leagueSchedule[targetMatchdays[index]] = leaguePhase.schedule[Number(sourceMatchdays[index])];
  }

  return {
    code,
    name: COMPETITION_NAMES[code],
    teams,
    pots: leaguePhase.pots,
    leagueSchedule,
    matchdays,
    table: createTable(teams),
    lastCompletedLeagueMatchday: null,
    knockout: null,
    completed: false,
    history: [...history]
  };
}

export function createEuropeanCompetitions(
  previousSeason: Season,
  priorHistory: SeasonHistoryEntry[] = []
): Record<string, EuropeanCompetition> | null {
  if (previousSeason.year < 2026) return null;

  const entrants = buildEuropeanEntrants(previousSeason);
  // Foreign entrants are created fresh each season: apply the overall bonus from players they have signed.
  for (const teams of Object.values(entrants)) {
    for (const team of teams) {
      if (!team.isEuropeanGuest) continue;
      team.playerBonus = clubStarBonus(previousSeason.freeAgents.clubPlayers, team.ID, team.BaseOverall);
      team.recomputeOverall();
    }
  }
  const result: Record<string, EuropeanCompetition> = {};

  for (const code of Object.keys(COMPETITION_NAMES)) {
    const history = priorHistory
      .map(entry => entry.european?.[code])
      .filter(Boolean) as FinalHistory[];
    result[code] = createCompetition(code, entrants[code as keyof Entrants], history);
  }

  return result;
}

function keyForMatchday(competition: EuropeanCompetition, matchday: number): string | null {
  return LEAGUE_PHASE_KEYS.find(key => competition.matchdays[key] === matchday) ?? null;
}

function getKnockoutIndexForMatchday(competition: EuropeanCompetition, matchday: number): number | null {
  if (competition.matchdays.F === matchday) return 4;
  for (let index = 0; index < 4; index++) {
    const key = KNOCKOUT_PHASES[index].key;
    if (competition.matchdays[`${key} 1`] === matchday || competition.matchdays[`${key} 2`] === matchday) {
      return index;
    }
  }
  return null;
}

export function simulateEuropeanMatchday(
  competitions: Record<string, EuropeanCompetition> | null,
  matchday: number
): void {
  if (!competitions) return;

  for (const competition of Object.values(competitions)) {
    const matchdays = Object.values(competition.matchdays);
    if (!matchdays.includes(matchday)) continue;

    if (LEAGUE_PHASE_KEYS.some(key => competition.matchdays[key] === matchday)) {
      simulateLeagueMatchday(competition, matchday);
      if (keyForMatchday(competition, matchday) === "GS 8") {
        setupKnockout(competition);
      }
      continue;
    }

    const knockoutIndex = getKnockoutIndexForMatchday(competition, matchday);
    if (knockoutIndex === null || !competition.knockout) continue;

    simulateKnockoutLeg(competition, matchday);
  }
}

function getFinalHistory(competition: EuropeanCompetition): FinalHistory | null {
  const bracket = competition.knockout?.bracket;
  if (!bracket || !competition.completed) return null;

  const finalMatch = (bracket.rounds.at(-1) as BracketMatch[])[0];
  const semifinalRound = bracket.rounds.at(-2) ?? [];
  const semifinalists = semifinalRound.flatMap(match => [
    match.player1?.team ?? null,
    match.player2?.team ?? null
  ]).filter(Boolean) as Team[];

  const winner = finalMatch.winner;
  const runnerUp = ([finalMatch.player1?.team, finalMatch.player2?.team] as (Team | null | undefined)[])
    .find(team => team && team.ID !== winner?.ID) ?? null;
  const finalResult = finalMatch.result;

  return {
    competition: competition.code,
    season: competition.seasonLabel,
    winner,
    runnerUp,
    semifinalists,
    finalScore: finalResult ? {
      homeTeam: finalResult.homeGoalInfo.homeTeam,
      homeGoals: finalResult.homeGoalInfo.homeGoals,
      awayTeam: finalResult.awayGoalInfo.awayTeam,
      awayGoals: finalResult.awayGoalInfo.awayGoals,
      homePenalties: finalResult.homeGoalInfo.penalties,
      awayPenalties: finalResult.awayGoalInfo.penalties
    } : null
  };
}

export function finalizeEuropeanHistory(
  competitions: Record<string, EuropeanCompetition> | null
): Record<string, FinalHistory> {
  if (!competitions) return {};
  const history: Record<string, FinalHistory> = {};
  for (const [code, competition] of Object.entries(competitions)) {
    const current = getFinalHistory(competition);
    if (current) {
      competition.history.push(current);
      history[code] = current;
    }
  }
  return history;
}

export function getEuropeanSeasonHistory(
  competitions: Record<string, EuropeanCompetition> | null
): Record<string, FinalHistory> {
  const history: Record<string, FinalHistory> = {};
  if (!competitions) return history;
  for (const [code, competition] of Object.entries(competitions)) {
    if (competition.completed) {
      const finalHistory = getFinalHistory(competition);
      if (finalHistory) history[code] = finalHistory;
    }
  }
  return history;
}
