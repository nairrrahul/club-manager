import initialAllocationsRaw from "./data/nations_league.json";
import teamWindowsRaw from "./data/team_windows.csv?raw";
import { SEASON_START_YEAR } from "./constants";
import { getConfederation } from "./nations";
import { scheduleLeague } from "./scheduler";
import { shuffledCopy } from "./utils";
import type { InternationalMatch } from "./international";
import { Team } from "./team";

type NationsLeagueCompetition = "NL1" | "NL2";
type WindowType = "FR" | NationsLeagueCompetition | "GCPO" | "GC" | "COPA";

interface InitialDivision {
  numUp: number;
  numDown: number;
  [pot: string]: number | string[];
}

export function getGoldCupWindowType(year: number, windowId: string): "GCPO" | "GC" | null {
  const type = typeAt("CONCACAF", globalWindowIndex(year, windowId));
  if (type.startsWith("GCPO")) return "GCPO";
  if (type.startsWith("GC")) return "GC";
  return null;
}

interface NationsLeagueInitialAllocations {
  [confederation: string]: Record<string, InitialDivision>;
}

export interface NationsLeagueGroup {
  name: string;
  teams: string[];
}

export interface NationsLeagueStanding {
  code: string;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface NationsLeagueDivisionHistoryRow {
  code: string;
  aggregateRank: number;
  divisions: Record<string, string>;
}

export interface NationsLeagueEdition {
  id: string;
  confederation: string;
  competition: NationsLeagueCompetition;
  cycle: number;
  startWindowIndex: number;
  year: number;
  status: "scheduled" | "active" | "complete";
  divisions: Record<string, NationsLeagueGroup[]>;
  matches: InternationalMatch[];
  promoted: Record<string, string[]>;
  relegated: Record<string, string[]>;
}

export interface NationsLeagueState {
  divisions: Record<string, Record<string, string[]>>;
  pots: Record<string, Record<string, Record<string, string[]>>>;
  editions: NationsLeagueEdition[];
}

const initialAllocations = initialAllocationsRaw as NationsLeagueInitialAllocations;
const WINDOW_COUNT_PER_YEAR = 6;
const CYCLE_WINDOW_COUNT = 24;

function parseTeamWindows(csv: string): Map<string, WindowType[]> {
  const rows = csv.trim().split(/\r?\n/).map(line => line.split(",").map(cell => cell.trim()));
  const parsed = new Map<string, WindowType[]>();
  for (const [rowIndex, [confederation, ...values]] of rows.entries()) {
    if (!confederation || values.length !== CYCLE_WINDOW_COUNT) {
      throw new Error(`team_windows.csv row ${rowIndex + 1} must contain a confederation and 24 window types.`);
    }
    const types = values.map(value => {
      if (value !== "FR" && value !== "NL1" && value !== "NL2" &&
        !/^GCPO[12]?$/.test(value) && !/^GC[12]?$/.test(value) && value !== "COPA") {
        throw new Error(`Unknown team_windows.csv window type "${value}" for ${confederation}.`);
      }
      if (value.startsWith("GCPO")) return "GCPO";
      if (value.startsWith("GC")) return "GC";
      return value as WindowType;
    });
    parsed.set(confederation, types);
  }
  for (const confederation of Object.keys(initialAllocations)) {
    if (!parsed.has(confederation)) {
      throw new Error(`team_windows.csv is missing the ${confederation} row.`);
    }
  }
  return parsed;
}

const teamWindows = parseTeamWindows(teamWindowsRaw);

function windowNumber(windowId: string): number {
  const match = /^IW([1-6])$/.exec(windowId);
  if (!match) throw new Error(`Unknown international window ID "${windowId}".`);
  return Number(match[1]) - 1;
}

function globalWindowIndex(year: number, windowId: string): number {
  return (year - SEASON_START_YEAR) * WINDOW_COUNT_PER_YEAR + windowNumber(windowId);
}

function windowLocation(index: number): { year: number; windowId: string } {
  const yearOffset = Math.floor(index / WINDOW_COUNT_PER_YEAR);
  const window = ((index % WINDOW_COUNT_PER_YEAR) + WINDOW_COUNT_PER_YEAR) % WINDOW_COUNT_PER_YEAR;
  return { year: SEASON_START_YEAR + yearOffset, windowId: `IW${window + 1}` };
}

function typeAt(confederation: string, index: number): WindowType {
  const types = teamWindows.get(confederation);
  if (!types) throw new Error(`No team-window schedule is configured for ${confederation}.`);
  const cycleIndex = ((index % CYCLE_WINDOW_COUNT) + CYCLE_WINDOW_COUNT) % CYCLE_WINDOW_COUNT;
  return types[cycleIndex];
}

function competitionWindowCount(confederation: string, startWindowIndex: number, competition: NationsLeagueCompetition): number {
  let count = 0;
  while (count < CYCLE_WINDOW_COUNT && typeAt(confederation, startWindowIndex + count) === competition) count++;
  if (count === 0) throw new Error(`No international windows are assigned to ${competition} for ${confederation}.`);
  return count;
}

export function getInternationalWindowType(confederation: string, year: number, windowId: string): WindowType {
  return typeAt(confederation, globalWindowIndex(year, windowId));
}

function initialPots(division: InitialDivision): Record<string, string[]> {
  return Object.fromEntries(Object.entries(division)
    .filter(([key, value]) => /^\d+$/.test(key) && Array.isArray(value))
    .map(([key, value]) => [key, [...value as string[]]]));
}

export function createNationsLeagueState(): NationsLeagueState {
  const divisions: NationsLeagueState["divisions"] = {};
  const pots: NationsLeagueState["pots"] = {};
  for (const [confederation, confederationDivisions] of Object.entries(initialAllocations)) {
    divisions[confederation] = {};
    pots[confederation] = {};
    for (const [division, allocation] of Object.entries(confederationDivisions)) {
      pots[confederation][division] = initialPots(allocation);
      divisions[confederation][division] = Object.values(pots[confederation][division]).flat();
    }
  }
  return { divisions, pots, editions: [] };
}

function buildGroups(pots: Record<string, string[]>): NationsLeagueGroup[] {
  const potEntries = Object.entries(pots).sort(([a], [b]) => Number(a) - Number(b));
  const groupCount = Math.max(...potEntries.map(([, teams]) => teams.length));
  if (groupCount < 1) throw new Error("A Nations League division must contain at least one group.");
  const groups = Array.from({ length: groupCount }, (_, index) => ({
    name: String(index + 1),
    teams: [] as string[]
  }));
  for (const [, potTeams] of potEntries) {
    const drawnTeams = shuffledCopy(potTeams);
    drawnTeams.forEach((team, index) => groups[index].teams.push(team));
  }
  return groups;
}

function createTeamStandIns(codes: string[]): Team[] {
  return codes.map((code, index) => new Team({
    ID: index + 1,
    Team: code,
    Overall: 0,
    Tier: 0
  }));
}

function createEdition(
  state: NationsLeagueState,
  confederation: string,
  competition: NationsLeagueCompetition,
  startWindowIndex: number
): NationsLeagueEdition {
  const divisionGroups: Record<string, NationsLeagueGroup[]> = {};
  const matches: InternationalMatch[] = [];
  const currentDivisions = state.divisions[confederation];
  const currentPots = state.pots[confederation];
  const competitionWindowCountForEdition = competitionWindowCount(confederation, startWindowIndex, competition);
  if (!currentDivisions || !currentPots) {
    throw new Error(`Nations League divisions are not initialized for ${confederation}.`);
  }

  for (const division of Object.keys(currentDivisions).sort()) {
    const groups = buildGroups(currentPots[division]);
    divisionGroups[division] = groups;
    for (const group of groups) {
      const teams = createTeamStandIns(group.teams);
      const schedule = scheduleLeague(teams);
      const rounds = Object.entries(schedule).sort(([a], [b]) => Number(a) - Number(b));
      rounds.forEach(([roundValue, fixtures]) => {
        const round = Number(roundValue);
        const windowSlot = Math.min(
          competitionWindowCountForEdition - 1,
          Math.floor((round - 1) * competitionWindowCountForEdition / rounds.length)
        );
        const location = windowLocation(startWindowIndex + windowSlot);
        for (const fixture of fixtures) {
          matches.push({
            home: fixture.homeTeam.Team,
            away: fixture.awayTeam.Team,
            kind: "nationsLeague",
            homeGoals: null,
            awayGoals: null,
            homeChange: null,
            awayChange: null,
            nationsLeagueId: `${confederation}-${competition}-${Math.floor(startWindowIndex / CYCLE_WINDOW_COUNT)}`,
            nationsLeagueConfederation: confederation,
            nationsLeagueDivision: division,
            nationsLeagueGroup: group.name,
            nationsLeagueRound: round,
            windowYear: location.year,
            windowId: location.windowId
          });
        }
      });
    }
  }

  const cycle = Math.floor(startWindowIndex / CYCLE_WINDOW_COUNT);
  return {
    id: `${confederation}-${competition}-${cycle}`,
    confederation,
    competition,
    cycle,
    startWindowIndex,
    year: windowLocation(startWindowIndex).year,
    status: "scheduled",
    divisions: divisionGroups,
    matches,
    promoted: {},
    relegated: {}
  };
}

function isFirstCompetitionWindow(confederation: string, index: number): boolean {
  const type = typeAt(confederation, index);
  return (type === "NL1" || type === "NL2") && typeAt(confederation, index - 1) !== type;
}

/** Draws the groups in the international window immediately before a new edition starts. */
export function prepareNationsLeagueDraws(state: NationsLeagueState, year: number, windowId: string): void {
  const drawWindowIndex = globalWindowIndex(year, windowId);
  const startWindowIndex = drawWindowIndex + 1;
  for (const confederation of Object.keys(initialAllocations)) {
    if (!isFirstCompetitionWindow(confederation, startWindowIndex)) continue;
    const competition = typeAt(confederation, startWindowIndex);
    if (competition !== "NL1" && competition !== "NL2") continue;
    const cycle = Math.floor(startWindowIndex / CYCLE_WINDOW_COUNT);
    const id = `${confederation}-${competition}-${cycle}`;
    if (state.editions.some(edition => edition.id === id)) continue;
    state.editions.push(createEdition(state, confederation, competition, startWindowIndex));
  }
}

export function getNationsLeagueRoundsForWindow(
  state: NationsLeagueState,
  confederation: string,
  year: number,
  windowId: string
): { edition: NationsLeagueEdition; rounds: { label: string; matches: InternationalMatch[] }[] } | null {
  const index = globalWindowIndex(year, windowId);
  const competition = typeAt(confederation, index);
  if (competition !== "NL1" && competition !== "NL2") return null;
  const edition = [...state.editions].reverse().find(candidate =>
    candidate.confederation === confederation &&
    candidate.competition === competition &&
    candidate.matches.some(match => match.windowYear === year && match.windowId === windowId)
  );
  const currentEdition = edition ?? (
    isFirstCompetitionWindow(confederation, index)
      ? createEdition(state, confederation, competition, index)
      : null
  );
  if (!currentEdition) {
    throw new Error(`The ${confederation} Nations League draw was not prepared before ${windowId} ${year}.`);
  }
  if (!edition) state.editions.push(currentEdition);
  currentEdition.status = "active";
  const matches = currentEdition.matches.filter(match => match.windowYear === year && match.windowId === windowId);
  const roundNumbers = [...new Set(matches.map(match => match.nationsLeagueRound ?? 0))].sort((a, b) => a - b);
  return {
    edition: currentEdition,
    rounds: roundNumbers.map(round => ({
      label: `Nations League · Matchday ${round}`,
      matches: matches.filter(match => match.nationsLeagueRound === round)
    }))
  };
}

function calculateGroupStandings(edition: NationsLeagueEdition, division: string, group: NationsLeagueGroup): NationsLeagueStanding[] {
  const byCode = new Map(group.teams.map(code => [code, {
    code, position: 0, played: 0, won: 0, drawn: 0, lost: 0,
    goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0
  } satisfies NationsLeagueStanding]));

  for (const match of edition.matches) {
    if (
      match.nationsLeagueDivision !== division ||
      match.nationsLeagueGroup !== group.name ||
      match.homeGoals === null ||
      match.awayGoals === null
    ) continue;
    const home = byCode.get(match.home);
    const away = byCode.get(match.away);
    if (!home || !away) throw new Error(`Invalid ${edition.confederation} Nations League fixture in ${division} group ${group.name}.`);
    home.played++;
    away.played++;
    home.goalsFor += match.homeGoals;
    home.goalsAgainst += match.awayGoals;
    away.goalsFor += match.awayGoals;
    away.goalsAgainst += match.homeGoals;
    if (match.homeGoals > match.awayGoals) {
      home.won++;
      away.lost++;
      home.points += 3;
    } else if (match.homeGoals < match.awayGoals) {
      away.won++;
      home.lost++;
      away.points += 3;
    } else {
      home.drawn++;
      away.drawn++;
      home.points++;
      away.points++;
    }
  }
  const rows = [...byCode.values()].map(row => ({
    ...row,
    goalDifference: row.goalsFor - row.goalsAgainst
  })).sort((a, b) =>
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    a.code.localeCompare(b.code)
  );
  rows.forEach((row, index) => { row.position = index + 1; });
  return rows;
}

export function getNationsLeagueStandings(
  edition: NationsLeagueEdition,
  division: string,
  group: NationsLeagueGroup
): NationsLeagueStanding[] {
  return calculateGroupStandings(edition, division, group);
}

export function rankDivisionTeams(edition: NationsLeagueEdition, division: string): { code: string; groupPosition: number; standing: NationsLeagueStanding }[] {
  const groups = edition.divisions[division] ?? [];
  const rankedByPosition = groups.flatMap(group =>
    calculateGroupStandings(edition, division, group).map(standing => ({
      code: standing.code,
      groupPosition: standing.position,
      standing
    }))
  );
  return rankedByPosition.sort((a, b) =>
    a.groupPosition - b.groupPosition ||
    b.standing.points - a.standing.points ||
    b.standing.goalDifference - a.standing.goalDifference ||
    b.standing.goalsFor - a.standing.goalsFor ||
    a.code.localeCompare(b.code)
  );
}

export function getNationsLeagueDivisionHistory(
  editions: NationsLeagueEdition[]
): { editions: NationsLeagueEdition[]; rows: NationsLeagueDivisionHistoryRow[] } {
  const completed = editions
    .filter(edition => edition.status === "complete")
    .sort((a, b) => a.startWindowIndex - b.startWindowIndex);
  const latest = completed.at(-1);
  if (!latest) return { editions: completed, rows: [] };

  const aggregateOrder = Object.keys(latest.divisions).sort();
  const rows: NationsLeagueDivisionHistoryRow[] = [];
  for (const division of aggregateOrder) {
    for (const row of rankDivisionTeams(latest, division)) {
      rows.push({
        code: row.code,
        aggregateRank: rows.length + 1,
        divisions: Object.fromEntries(completed.flatMap(edition =>
          Object.entries(edition.divisions)
            .filter(([, groups]) => groups.some(group => group.teams.includes(row.code)))
            .map(([editionDivision]) => [edition.id, editionDivision])
        ))
      });
    }
  }
  return { editions: completed, rows };
}

/** Applies group placement, promotion and relegation after all group fixtures are complete. */
export function finalizeNationsLeagueEdition(state: NationsLeagueState, edition: NationsLeagueEdition): void {
  const divisionOrder = Object.keys(initialAllocations[edition.confederation]).sort();
  const rankings: Record<string, ReturnType<typeof rankDivisionTeams>> = {};
  const configs = initialAllocations[edition.confederation];
  for (const division of divisionOrder) {
    rankings[division] = rankDivisionTeams(edition, division);
    const config = configs[division];
    edition.promoted[division] = rankings[division].slice(0, config.numUp).map(row => row.code);
    edition.relegated[division] = config.numDown > 0
      ? rankings[division].slice(-config.numDown).map(row => row.code)
      : [];
  }

  const nextDivisions: Record<string, string[]> = {};
  const nextPots: Record<string, Record<string, string[]>> = {};
  for (let divisionIndex = 0; divisionIndex < divisionOrder.length; divisionIndex++) {
    const division = divisionOrder[divisionIndex];
    const currentTeams = state.divisions[edition.confederation][division];
    const outgoing = new Set([...edition.promoted[division], ...edition.relegated[division]]);
    const promotedFromBelow = divisionIndex < divisionOrder.length - 1
      ? edition.promoted[divisionOrder[divisionIndex + 1]]
      : [];
    const relegatedFromAbove = divisionIndex > 0
      ? edition.relegated[divisionOrder[divisionIndex - 1]]
      : [];
    const promoted = new Set(promotedFromBelow);
    const teams = [
      ...currentTeams.filter(code => !outgoing.has(code)),
      ...promotedFromBelow,
      ...relegatedFromAbove
    ];
    nextDivisions[division] = teams;

    const potCount = Math.max(...Object.keys(initialPots(configs[division])).map(Number));
    const targetGroupCount = Math.max(...Object.values(initialPots(configs[division])).map(teams => teams.length));
    const potMembers = Array.from({ length: potCount }, () => [] as string[]);
    const demotedFromAbove = new Set(relegatedFromAbove);
    const relegatedFromAboveRanked = divisionIndex > 0
      ? rankings[divisionOrder[divisionIndex - 1]]
          .filter(row => demotedFromAbove.has(row.code))
          .map(row => row.code)
      : [];
    const placement = new Map(rankings[division].map(row => [row.code, row.groupPosition]));
    for (const code of teams) {
      let potNumber: number;
      if (demotedFromAbove.has(code)) {
        const incomingPosition = relegatedFromAboveRanked.indexOf(code);
        potNumber = Math.min(potCount, Math.floor(incomingPosition / targetGroupCount) + 1);
      }
      else if (promoted.has(code)) potNumber = potCount;
      else if (
        divisionIndex === divisionOrder.length - 1 &&
        relegatedFromAboveRanked.length > targetGroupCount
      ) potNumber = potCount;
      else potNumber = Math.min(potCount, placement.get(code) ?? potCount);
      potMembers[potNumber - 1].push(code);
    }
    nextPots[division] = Object.fromEntries(potMembers.map((members, index) => [
      String(index + 1), shuffledCopy(members)
    ]));
  }
  state.divisions[edition.confederation] = nextDivisions;
  state.pots[edition.confederation] = nextPots;
  edition.status = "complete";
}

/** Completes any edition whose group fixtures have all been played. */
export function completeNationsLeagueEditions(state: NationsLeagueState): void {
  for (const edition of state.editions) {
    if (edition.status === "complete") continue;
    if (edition.matches.length > 0 && edition.matches.every(match => match.homeGoals !== null && match.awayGoals !== null)) {
      finalizeNationsLeagueEdition(state, edition);
    }
  }
}

export function getNationsLeagueConfederations(): string[] {
  return Object.keys(initialAllocations);
}

export function isNationsLeagueConfederation(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(initialAllocations, code);
}

export function getNationConfederation(code: string): string {
  const confederation = getConfederation(code);
  if (!confederation) throw new Error(`No confederation is configured for nation ${code}.`);
  return confederation;
}
