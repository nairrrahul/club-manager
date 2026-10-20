import tierPlayerInfoRaw from "./data/tier_player_info.json";
import tierPlayerAgesRaw from "./data/tier_player_ages.json";
import confederationPlayerInfoRaw from "./data/confederation_player_info.json";
import nationInfoRaw from "./data/name_info/nation_info.json";
import { generatePlayerName, getRandomNationCode } from "./nameGenerator";
import { FORMATIONS, POSITION_ORDER, canPlayPosition, getFormationRequirements } from "./formation";
import type { Team } from "./team";
import { openStint } from "./playerHistory";
import type { PeakRange, Player, PlayerType, Position } from "./types";

const tierPlayerInfo = tierPlayerInfoRaw as Record<string, Record<string, number>>;
const tierPlayerAges = tierPlayerAgesRaw as Record<string, Record<string, number>>;
const confederationPlayerInfo = confederationPlayerInfoRaw as Record<string, Record<string, number>>;
const nationInfo = nationInfoRaw as unknown as Record<string, { confederationID: string; threeLetterCode: string }>;

const YOUTH_SQUAD_SIZE = 15;
const SENIOR_SQUAD_SIZE = 40;
const CONTRACT_EXPIRY = 2030;
const NATIONALITY_CODE_ALIASES: Record<string, string> = { DRC: "COD" };
const ENGLAND_CODE = "ENG";
const GB_CODES = ["NIR", "SCO", "WAL"];

const AGE_GROWTH: Record<number, number> = {
  16: 0.78, 17: 0.83, 18: 0.88, 19: 0.92, 20: 0.95,
  21: 0.97, 22: 0.99, 23: 1.00, 24: 1.00, 25: 1.00,
  26: 1.00, 27: 0.99, 28: 0.98, 29: 0.97, 30: 0.95,
  31: 0.93, 32: 0.91, 33: 0.89, 34: 0.87, 35: 0.85
};

const POSITION_DISTRIBUTION: Position[] = [
  "GK", "GK", "GK",
  "RB", "RB",
  "CB", "CB", "CB", "CB",
  "LB", "LB",
  "CDM", "CDM",
  "CM", "CM",
  "CAM", "CAM",
  "RM", "RM",
  "LM", "LM",
  "RW", "LW", "ST", "ST"
];

function weightedRandom<T>(entries: [T, number][]): T | null {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return null;

  let random = Math.random() * total;
  for (const [value, weight] of entries) {
    if (random < weight) return value;
    random -= weight;
  }
  return entries.at(-1)?.[0] ?? null;
}

function randomNormal(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function getCodesByConfederation(confederation: string): string[] {
  return Object.values(nationInfo)
    .filter(info => info.confederationID === confederation)
    .map(info => info.threeLetterCode);
}

function getConfederationNationality(confederation: string): string {
  const distribution = confederationPlayerInfo[confederation];
  const selected = weightedRandom(Object.entries(distribution));
  if (!selected) throw new Error(`Unable to select a nationality from ${confederation}.`);

  if (selected.toLowerCase() !== "other") {
    return NATIONALITY_CODE_ALIASES[selected.toUpperCase()] ?? selected.toUpperCase();
  }

  const listed = new Set(
    Object.keys(distribution)
      .filter(code => code.toLowerCase() !== "other")
      .map(code => NATIONALITY_CODE_ALIASES[code.toUpperCase()] ?? code.toUpperCase())
  );

  if (confederation === "UEFA") {
    listed.add("ENG");
    GB_CODES.forEach(code => listed.add(code));
  }

  const available = getCodesByConfederation(confederation).filter(code => !listed.has(code));
  return available[Math.floor(Math.random() * available.length)];
}

function generateNationality(tier: number): string {
  const distribution = tierPlayerInfo[String(tier)];
  const group = weightedRandom(Object.entries(distribution));

  if (group === "ENG") return ENGLAND_CODE;
  if (group === "GB") return GB_CODES[Math.floor(Math.random() * GB_CODES.length)];
  return getConfederationNationality(group as string);
}

function generateAge(tier: number): number {
  return Number(weightedRandom(Object.entries(tierPlayerAges[String(tier)])));
}

function getAgeMultiplier(age: number): number {
  return AGE_GROWTH[age] ?? (age < 16 ? 0.72 : 0.82);
}

function generatePotential(teamOverall: number): number {
  return Math.max(50, Math.min(99, Math.round(teamOverall + 10 + randomNormal() * 4.5)));
}

function generateInitialOverall(potential: number, age: number): number {
  return Math.max(1, Math.min(potential, Math.round(potential * getAgeMultiplier(age))));
}

function shuffle<T>(values: T[]): T[] {
  return [...values].sort(() => Math.random() - 0.5);
}

function createPlayer(
  team: Team,
  id: string,
  position: Position,
  age: number = generateAge(team.Tier),
  primaryNationality: string = generateNationality(team.Tier),
  isScouted = false,
  potential: number | null = null,
  overall: number | null = null,
  playerType: PlayerType | null = null,
  peakRange: PeakRange | null = null
): Player {
  const generated = generatePlayerName(primaryNationality);
  const finalPotential = potential ?? generatePotential(team.BaseOverall);
  const finalOverall = overall ?? generateInitialOverall(finalPotential, age);

  return {
    id,
    firstName: generated.firstName,
    lastName: generated.lastName,
    primaryNationality: generated.primaryNationality,
    secondaryNationality: generated.secondaryNationality,
    age,
    overall: Math.round(finalOverall),
    potential: Math.round(finalPotential),
    contractExpiry: CONTRACT_EXPIRY,
    position,
    isScouted,
    playerType,
    peakRange,
    progression: [],
    history: [],
    caps: 0,
    isShortlisted: false
  };
}

/**
 * A generated free agent: random nationality, age 17-26, potential 60-75, and an overall
 * derived from potential and age exactly like the initial squad players.
 */
export function createFreeAgentPlayer(id: string, year: number): Player {
  const nationality = getRandomNationCode();
  const generated = generatePlayerName(nationality);
  const age = 17 + Math.floor(Math.random() * 10);
  const potential = 60 + Math.floor(Math.random() * 16);
  const overall = generateInitialOverall(potential, age);
  const position = POSITION_DISTRIBUTION[Math.floor(Math.random() * POSITION_DISTRIBUTION.length)];

  const player: Player = {
    id,
    firstName: generated.firstName,
    lastName: generated.lastName,
    primaryNationality: generated.primaryNationality,
    secondaryNationality: generated.secondaryNationality,
    age,
    overall: Math.round(overall),
    potential,
    contractExpiry: null,
    position,
    isScouted: false,
    playerType: null,
    peakRange: null,
    progression: [],
    history: [],
    caps: 0,
    isShortlisted: false
  };
  recordInitialProgression(player, year);
  openStint(player, null, year, 0);
  return player;
}

function recordInitialProgression(player: Player, year: number): void {
  player.progression = [{
    year,
    age: player.age,
    overall: player.overall,
    potential: player.potential
  }];
}

// ---------------------------------------------------------------------------
// Starting XI selection
// ---------------------------------------------------------------------------

/** Slot indices ordered most-restrictive-position first (same order the terminal game fills them). */
function getFillOrder(requirements: Position[]): number[] {
  const countOf = (position: Position) => requirements.filter(p => p === position).length;
  return requirements
    .map((_, index) => index)
    .sort((a, b) => countOf(requirements[a]) - countOf(requirements[b]));
}

/**
 * Best starting XI for a formation. Result is aligned with getFormationRequirements(formation):
 * result[i] is the player for requirement slot i.
 */
export function selectBestStartingXI(players: Player[], formation: string): Player[] | null {
  const requirements = getFormationRequirements(formation);
  const unused = new Set(players);
  const selected: Player[] = new Array(requirements.length);

  // Fill the most restrictive positions first, then use overall as the tiebreaker.
  for (const slotIndex of getFillOrder(requirements)) {
    const requiredPosition = requirements[slotIndex];
    const candidates = [...unused]
      .filter(player => canPlayPosition(player.position, requiredPosition))
      .sort((a, b) => b.overall - a.overall);

    if (!candidates[0]) return null;
    selected[slotIndex] = candidates[0];
    unused.delete(candidates[0]);
  }

  return selected;
}

export function calculateFormationOverall(team: Team, formation: string = team.formation): number | null {
  const startingXI = selectBestStartingXI(team.seniorSquad ?? [], formation);
  if (!startingXI || startingXI.length !== 11) return null;
  return Math.round(startingXI.reduce((sum, player) => sum + player.overall, 0) / 11);
}

/** Players currently in the starting XI, aligned with formation slots (null = empty slot). */
export function getStartingXISlots(team: Team): (Player | null)[] {
  const squad = team.seniorSquad ?? [];
  const byId = new Map(squad.map(player => [player.id, player]));
  const requirements = getFormationRequirements(team.formation);
  return requirements.map((_, index) => {
    const id = team.startingXI[index];
    return id ? byId.get(id) ?? null : null;
  });
}

function getCompleteStartingXI(team: Team): Player[] | null {
  const slots = getStartingXISlots(team);
  if (slots.length !== 11 || slots.some(slot => slot === null)) return null;
  return slots as Player[];
}

/**
 * Brings team.startingXI in line with the squad/formation.
 *  - auto mode: always the best XI.
 *  - manual mode: keeps valid picks; any slot that became invalid (player released,
 *    position changed, formation changed) is filled with the best eligible player.
 */
export function refreshStartingXI(team: Team): void {
  const squad = team.seniorSquad ?? [];
  const requirements = getFormationRequirements(team.formation);

  if (team.xiMode === "auto") {
    const best = selectBestStartingXI(squad, team.formation);
    team.startingXI = best ? best.map(player => player.id) : requirements.map(() => null);
    return;
  }

  const byId = new Map(squad.map(player => [player.id, player]));
  const used = new Set<string>();
  const slots: (string | null)[] = requirements.map((required, index) => {
    const id = team.startingXI[index];
    const player = id ? byId.get(id) : undefined;
    if (player && !used.has(player.id) && canPlayPosition(player.position, required)) {
      used.add(player.id);
      return player.id;
    }
    return null;
  });

  for (const slotIndex of getFillOrder(requirements)) {
    if (slots[slotIndex] !== null) continue;
    const candidate = squad
      .filter(player => !used.has(player.id) && canPlayPosition(player.position, requirements[slotIndex]))
      .sort((a, b) => b.overall - a.overall)[0];
    if (candidate) {
      slots[slotIndex] = candidate.id;
      used.add(candidate.id);
    }
  }

  team.startingXI = slots;
}

/** Re-picks the best XI (used at the start of every season) without changing the selection mode. */
export function resetStartingXIToAuto(team: Team): void {
  const mode = team.xiMode;
  team.xiMode = "auto";
  refreshStartingXI(team);
  team.xiMode = mode;
}

export function calculateTeamOverall(team: Team): number {
  refreshStartingXI(team);
  const startingXI = getCompleteStartingXI(team);
  if (!startingXI) return team.BaseOverall;

  const overall = Math.round(startingXI.reduce((sum, player) => sum + player.overall, 0) / 11);
  team.BaseOverall = overall;
  // Keep any in-season form bonus/penalty: changing formation, XI, or squad must not reset it.
  team.Overall = overall + team.seasonOverallChange;
  team.squadOverall = overall;
  return overall;
}

export function setStartingXIMode(team: Team, mode: "auto" | "manual"): void {
  team.xiMode = mode;
  calculateTeamOverall(team);
}

export function setStartingXISlot(
  team: Team,
  slotIndex: number,
  playerID: string
): { error?: string } {
  if (team.xiMode !== "manual") return { error: "Switch to manual selection to pick your starting XI." };

  const requirements = getFormationRequirements(team.formation);
  const squad = team.seniorSquad ?? [];
  const player = squad.find(candidate => candidate.id === playerID);
  const required = requirements[slotIndex];

  if (!player || required === undefined) return { error: "Invalid selection." };
  if (!canPlayPosition(player.position, required)) {
    return { error: `${player.firstName} ${player.lastName} (${player.position}) cannot play ${required}.` };
  }

  const existingSlot = team.startingXI.indexOf(playerID);
  const displacedID = team.startingXI[slotIndex];

  if (existingSlot >= 0 && existingSlot !== slotIndex) {
    if (displacedID) {
      const displaced = squad.find(candidate => candidate.id === displacedID);
      if (!displaced || !canPlayPosition(displaced.position, requirements[existingSlot])) {
        return {
          error: `Cannot swap: ${displaced ? `${displaced.firstName} ${displaced.lastName}` : "that player"} cannot play ${requirements[existingSlot]}.`
        };
      }
      team.startingXI[existingSlot] = displacedID;
    } else {
      team.startingXI[existingSlot] = null;
    }
  }

  team.startingXI[slotIndex] = playerID;
  calculateTeamOverall(team);
  return {};
}

/** Changes formation. In manual mode, current XI players are re-slotted where they fit. */
export function changeFormation(team: Team, formation: string): { error?: string; preview?: number } {
  if (!FORMATIONS[formation]) {
    return { error: `Unknown formation. Available: ${Object.keys(FORMATIONS).join(", ")}` };
  }
  const preview = calculateFormationOverall(team, formation);
  if (preview === null) {
    return { error: `You do not have the positional personnel required for ${formation}.` };
  }

  const previousXI = getStartingXISlots(team).filter((player): player is Player => player !== null);
  team.formation = formation;

  if (team.xiMode === "manual") {
    const requirements = getFormationRequirements(formation);
    const used = new Set<string>();
    const slots: (string | null)[] = requirements.map(() => null);
    for (const slotIndex of getFillOrder(requirements)) {
      const candidate = previousXI
        .filter(player => !used.has(player.id) && canPlayPosition(player.position, requirements[slotIndex]))
        .sort((a, b) => b.overall - a.overall)[0];
      if (candidate) {
        slots[slotIndex] = candidate.id;
        used.add(candidate.id);
      }
    }
    team.startingXI = slots;
  }

  calculateTeamOverall(team);
  return { preview };
}

// ---------------------------------------------------------------------------
// Squad generation / management
// ---------------------------------------------------------------------------

function adjustStartingXIToTarget(team: Team, targetOverall: number): void {
  const startingXI = selectBestStartingXI(team.seniorSquad as Player[], team.formation);
  if (!startingXI) return;

  const current = Math.round(startingXI.reduce((sum, player) => sum + player.overall, 0) / 11);
  const delta = targetOverall - current;

  for (const player of team.seniorSquad as Player[]) {
    player.overall = Math.max(1, Math.min(player.potential, player.overall + delta));
  }

  let actual = selectBestStartingXI(team.seniorSquad as Player[], team.formation) as Player[];
  let difference = targetOverall * 11 - actual.reduce((sum, player) => sum + player.overall, 0);
  let guard = 0;

  while (difference !== 0 && guard < 1000) {
    actual = selectBestStartingXI(team.seniorSquad as Player[], team.formation) as Player[];
    const candidates = difference > 0
      ? actual.filter(player => player.overall < player.potential).sort((a, b) => (b.potential - b.overall) - (a.potential - a.overall))
      : actual.filter(player => player.overall > 1).sort((a, b) => b.overall - a.overall);
    const player = candidates[0];
    if (!player) break;
    player.overall += difference > 0 ? 1 : -1;
    difference += difference > 0 ? -1 : 1;
    guard++;
  }
}

export function generateSquad(team: Team, year: number): Player[] {
  const positions = shuffle(POSITION_DISTRIBUTION);
  const players = positions.map((position, index) =>
    createPlayer(team, `${team.ID}-${index + 1}`, position)
  );

  team.seniorSquad = players;
  adjustStartingXIToTarget(team, team.BaseOverall);
  players.forEach(player => {
    recordInitialProgression(player, year);
    openStint(player, { id: team.ID, name: team.Team }, year, 0);
  });
  return players;
}

export function initializeManagerTeam(team: Team, year: number): Team {
  team.formation = team.formation ?? "4-4-2";
  team.xiMode = "auto";
  team.startingXI = [];
  team.seniorSquad = generateSquad(team, year);
  team.youthAcademySquad = [];
  team.scoutingMissions = [];
  team.scoutedPlayers = [];
  team.maxSeniorSquadSize = SENIOR_SQUAD_SIZE;
  team.maxYouthAcademySquadSize = YOUTH_SQUAD_SIZE;
  calculateTeamOverall(team);
  return team;
}

export function createEmergencyPlayer(team: Team, position: Position, year: number): Player {
  const targetOverall = Math.max(1, Math.round(team.BaseOverall * 0.70));
  const potential = Math.max(1, Math.round(team.BaseOverall * 0.70));
  const age = 18 + Math.floor(Math.random() * 3);
  const player = createPlayer(
    team,
    `${team.ID}-A${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    position,
    age,
    generateNationality(team.Tier),
    false,
    potential,
    targetOverall
  );
  recordInitialProgression(player, year);
  openStint(player, { id: team.ID, name: team.Team }, year, 0);
  return player;
}

export function ensureMinimumSeniorSquad(team: Team, year: number): Player[] {
  const squad = team.seniorSquad as Player[];
  const added: Player[] = [];
  const add = (position: Position) => {
    if (squad.length >= team.maxSeniorSquadSize) return;
    const player = createEmergencyPlayer(team, position, year);
    squad.push(player);
    added.push(player);
  };

  while (squad.length < 20) add(POSITION_DISTRIBUTION[Math.floor(Math.random() * POSITION_DISTRIBUTION.length)]);
  while (squad.filter(p => p.position === "GK").length < 3) add("GK");
  while (squad.filter(p => p.position === "RB").length < 1) add("RB");
  while (squad.filter(p => p.position === "LB").length < 1) add("LB");
  while (squad.filter(p => p.position === "RW").length < 1) add("RW");
  while (squad.filter(p => p.position === "LW").length < 1) add("LW");
  while (squad.filter(p => p.position === "CB").length < 2) add("CB");
  while (squad.filter(p => ["CM", "CAM", "CDM"].includes(p.position)).length < 2) add("CM");
  while (squad.filter(p => p.position === "ST").length < 2) add("ST");

  return added;
}

export function releaseSeniorPlayer(team: Team, playerID: string): Player | null {
  const index = team.seniorSquad?.findIndex(player => String(player.id) === String(playerID));
  if (index === undefined || index < 0) return null;
  const [player] = (team.seniorSquad as Player[]).splice(index, 1);
  return player;
}

export function promoteYouthPlayer(
  team: Team,
  playerID: string,
  signingYear: number
): { error?: string; player?: Player } {
  if ((team.seniorSquad as Player[]).length >= team.maxSeniorSquadSize) return { error: "Senior squad is full." };
  const index = (team.youthAcademySquad as Player[]).findIndex(player => String(player.id) === String(playerID));
  if (index < 0) return { error: `No youth player found with ID ${playerID}.` };
  const [player] = (team.youthAcademySquad as Player[]).splice(index, 1);
  player.isScouted = true;
  player.contractExpiry = Number(signingYear) + 3;
  (team.seniorSquad as Player[]).push(player);
  return { player };
}

export function releaseYouthPlayer(team: Team, playerID: string): Player | null {
  const index = team.youthAcademySquad?.findIndex(player => String(player.id) === String(playerID));
  if (index === undefined || index < 0) return null;
  const [player] = (team.youthAcademySquad as Player[]).splice(index, 1);
  return player;
}

export function addYouthPlayer(team: Team, player: Player): boolean {
  if ((team.youthAcademySquad as Player[]).length >= team.maxYouthAcademySquadSize) return false;
  (team.youthAcademySquad as Player[]).push(player);
  return true;
}

export function getPlayer(team: Team, playerID: string): Player | null {
  return [...(team.seniorSquad ?? []), ...(team.youthAcademySquad ?? [])]
    .find(player => String(player.id) === String(playerID)) ?? null;
}

export function getYouthPlayersAgingOut(team: Team): Player[] {
  return (team.youthAcademySquad ?? []).filter(player => player.age >= 18);
}

export function hasYouthPlayersAgingOut(team: Team): boolean {
  return getYouthPlayersAgingOut(team).length > 0;
}

export function getEligiblePositions(): Position[] {
  return [...POSITION_ORDER];
}

export function changePlayerPosition(
  team: Team,
  playerID: string,
  newPosition: Position
): { error?: string; player?: Player; oldPosition?: Position } {
  const player = getPlayer(team, playerID);
  if (!player) return { error: `No player found with ID ${playerID}.` };
  if (player.position === "GK") return { error: "Goalkeepers cannot have their position changed." };
  if (!POSITION_ORDER.includes(newPosition) || newPosition === "GK") {
    return { error: `Invalid outfield position. Available positions: ${POSITION_ORDER.filter(position => position !== "GK").join(", ")}.` };
  }

  const oldPosition = player.position;
  player.position = newPosition;
  return { player, oldPosition };
}

// ---------------------------------------------------------------------------
// Youth scouting player generation
// ---------------------------------------------------------------------------

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generatePlayerType(potential: number): PlayerType {
  if (potential >= 83) {
    return weightedRandom<PlayerType>([
      ["PRODIGY", 20],
      ["NORMAL", 60],
      ["LATE BLOOMER", 10],
      ["BURNOUT", 10]
    ]) as PlayerType;
  }

  return weightedRandom<PlayerType>([
    ["NORMAL", 70],
    ["LATE BLOOMER", 15],
    ["BURNOUT", 15]
  ]) as PlayerType;
}

function getGeneratedPeakRange(position: Position, playerType: PlayerType): PeakRange {
  const normalRanges: Record<string, PeakRange> = {
    GK: { start: 27, end: 34 },
    DEF: { start: 26, end: 33 },
    MID: { start: 25, end: 32 },
    ATK: { start: 25, end: 32 }
  };
  const category = ["GK"].includes(position)
    ? "GK"
    : ["RB", "LB", "CB"].includes(position)
      ? "DEF"
      : ["CM", "CAM", "CDM"].includes(position)
        ? "MID"
        : "ATK";
  const normal = normalRanges[category];

  if (playerType === "LATE BLOOMER") {
    return { start: normal.start + 2, end: normal.end + 2 };
  }

  if (playerType === "PRODIGY") {
    return {
      start: Math.max(18, normal.start - 2),
      end: normal.end - (Math.random() < 0.10 ? 1 : 0)
    };
  }

  if (playerType === "BURNOUT") {
    return { start: normal.start, end: Math.max(normal.start + 1, normal.end - 3) };
  }

  return { ...normal };
}

/**
 * `positions`: optional explicit position filter (web UI addition). When omitted or empty,
 * the position is random across all positions, exactly as in the terminal game.
 */
export function createYouthScoutedPlayer(
  team: Team,
  countryCode: string,
  id: string,
  year: number,
  positions: Position[] = []
): Player {
  const age = 15 + Math.floor(Math.random() * 3);
  const generated = generatePlayerName(countryCode);
  const potentialParams = ({
    1: [67, 83], 2: [70, 87], 3: [73, 90], 4: [76, 93], 5: [79, 95]
  } as Record<number, number[]>)[team.scoutingRating] ?? [73, 90];
  const sd = (potentialParams[1] - potentialParams[0]) / 2;
  const potential = Math.max(50, Math.min(95, Math.round(potentialParams[0] + randomNormal() * sd)));
  const ratioBase = ({ 1: 0.50, 2: 0.60, 3: 0.65, 4: 0.70, 5: 0.75 } as Record<number, number>)[team.scoutingExperience] ?? 0.65;
  const ratio = Math.max(0, ratioBase - 0.03 + Math.random() * 0.06);
  const pool = positions.length > 0 ? positions : POSITION_ORDER;
  const position = pool[Math.floor(Math.random() * pool.length)];
  const playerType = generatePlayerType(potential);
  const peakRange = getGeneratedPeakRange(position, playerType);
  const overall = Math.round(potential * ratio);
  const potentialRange = {
    lower: Math.max(40, potential - randInt(1, 10)),
    upper: Math.min(95, potential + randInt(1, 10))
  };

  const player: Player = {
    id,
    firstName: generated.firstName,
    lastName: generated.lastName,
    primaryNationality: generated.primaryNationality,
    secondaryNationality: generated.secondaryNationality,
    age,
    overall,
    potential,
    potentialRange,
    contractExpiry: null,
    position,
    isScouted: true,
    playerType,
    peakRange,
    progression: [],
    history: [],
    caps: 0,
    isShortlisted: false
  };
  recordInitialProgression(player, year);
  return player;
}
