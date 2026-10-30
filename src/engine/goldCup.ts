import hostOptionsRaw from "./data/tournament_hosts.json";
import { getNationName } from "./nations";
import { getNationsLeagueStandings, type NationsLeagueEdition } from "./nationsLeague";
import type { InternationalMatch, InternationalRound } from "./international";
import { shuffledCopy } from "./utils";

const hostOptions = hostOptionsRaw as Record<string, string[]>;
const GROUP_NAMES = ["A", "B", "C", "D"] as const;
export type InternationalCup = "goldCup" | "copaAmerica";
const GROUP_PAIRINGS = [
  [[0, 1], [2, 3]],
  [[0, 2], [3, 1]],
  [[0, 3], [1, 2]]
];

export interface GoldCupPlayoffTie {
  id: string;
  team1: string;
  team2: string;
  firstLeg: InternationalMatch;
  secondLeg: InternationalMatch;
  winner: string | null;
  penalties: { home: string[]; away: string[] } | null;
}

export interface GoldCupPlayoffEdition {
  id: string;
  year: number;
  windowId: string;
  windowMatchday: number;
  nationsLeagueEditionId: string;
  directQualifiers: string[];
  entrants: string[];
  ties: GoldCupPlayoffTie[];
  completed: boolean;
  qualifiers: string[];
}

export interface GoldCupGroup {
  name: typeof GROUP_NAMES[number];
  teams: string[];
  matches: InternationalMatch[][];
}

export interface GoldCupKnockoutMatch {
  id: string;
  home: string;
  away: string;
  fixture: InternationalMatch;
  winner: string | null;
}

export interface GoldCupKnockoutRound {
  label: "Quarter-finals" | "Semi-finals" | "Final";
  matches: GoldCupKnockoutMatch[];
}

export interface GoldCupEdition {
  id: string;
  year: number;
  windowId: string;
  windowMatchday: number;
  hosts: string[];
  teams: string[];
  pots: string[][];
  seedRanks: Record<string, number>;
  groups: GoldCupGroup[];
  knockout: GoldCupKnockoutRound[] | null;
  completed: boolean;
  winner: string | null;
  runnerUp: string | null;
  semifinalists: string[];
}

export type InternationalCupEdition = GoldCupEdition;

export interface GoldCupState {
  playoffEditions: GoldCupPlayoffEdition[];
  editions: GoldCupEdition[];
}

export function createGoldCupState(): GoldCupState {
  return { playoffEditions: [], editions: [] };
}

function createMatch(
  home: string,
  away: string,
  kind: "goldCupPlayoff" | "goldCupGroup" | "goldCupKnockout" | "copaAmericaGroup" | "copaAmericaKnockout",
  year: number,
  windowId: string,
  windowMatchday: number,
  extra: Partial<InternationalMatch> = {}
): InternationalMatch {
  return {
    home,
    away,
    kind,
    homeGoals: null,
    awayGoals: null,
    homeChange: null,
    awayChange: null,
    windowYear: year,
    windowId,
    windowMatchday,
    ...extra
  };
}

function standingsFor(edition: NationsLeagueEdition, division: string) {
  return (edition.divisions[division] ?? []).flatMap(group =>
    getNationsLeagueStandings(edition, division, group)
  );
}

export function createGoldCupPlayoffEdition(
  edition: NationsLeagueEdition,
  year: number,
  windowId: string,
  windowMatchday: number,
  worldRanks: Record<string, number>
): { edition: GoldCupPlayoffEdition; rounds: InternationalRound[] } {
  const leagueA = standingsFor(edition, "A");
  const leagueB = standingsFor(edition, "B");
  const leagueC = standingsFor(edition, "C");
  const qualifiers = [
    ...leagueA.filter(row => row.position <= 2).map(row => row.code),
    ...leagueB.filter(row => row.position === 1).map(row => row.code)
  ];
  const bestThirds = leagueB
    .filter(row => row.position === 3)
    .sort((a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      (worldRanks[a.code] ?? Number.MAX_SAFE_INTEGER) - (worldRanks[b.code] ?? Number.MAX_SAFE_INTEGER)
    )
    .slice(0, 2)
    .map(row => row.code);
  const entrants = [
    ...leagueA.filter(row => row.position >= 3).map(row => row.code),
    ...leagueB.filter(row => row.position === 2).map(row => row.code),
    ...leagueC.filter(row => row.position === 1).map(row => row.code),
    ...bestThirds
  ];

  if (qualifiers.length !== 9 || entrants.length !== 14 || new Set([...qualifiers, ...entrants]).size !== 23) {
    throw new Error(
      `The ${edition.confederation} Nations League edition produced ${qualifiers.length} direct qualifiers and ${entrants.length} Gold Cup playoff teams; expected 9 and 14 unique teams.`
    );
  }

  const seeded = [...entrants].sort((a, b) =>
    (worldRanks[a] ?? Number.MAX_SAFE_INTEGER) - (worldRanks[b] ?? Number.MAX_SAFE_INTEGER) ||
    a.localeCompare(b)
  );
  const id = `GCPO-${year}-${windowId}`;
  const ties = Array.from({ length: 7 }, (_, index) => {
    const team1 = seeded[index];
    const team2 = seeded[seeded.length - 1 - index];
    return {
      id: `${id}-T${index + 1}`,
      team1,
      team2,
      firstLeg: createMatch(team1, team2, "goldCupPlayoff", year, windowId, windowMatchday, {
        goldCupPlayoffId: id,
        goldCupTieId: `${id}-T${index + 1}`,
        goldCupLeg: 1
      }),
      secondLeg: createMatch(team2, team1, "goldCupPlayoff", year, windowId, windowMatchday, {
        goldCupPlayoffId: id,
        goldCupTieId: `${id}-T${index + 1}`,
        goldCupLeg: 2
      }),
      winner: null,
      penalties: null
    };
  });
  const playoff: GoldCupPlayoffEdition = {
    id,
    year,
    windowId,
    windowMatchday,
    nationsLeagueEditionId: edition.id,
    directQualifiers: qualifiers,
    entrants: seeded,
    ties,
    completed: false,
    qualifiers: []
  };
  return {
    edition: playoff,
    rounds: [
      {
        kind: "goldCupPlayoff",
        label: "Gold Cup Playoff · First leg",
        leftOut: null,
        matches: ties.map(tie => tie.firstLeg)
      },
      {
        kind: "goldCupPlayoff",
        label: "Gold Cup Playoff · Second leg",
        leftOut: null,
        matches: ties.map(tie => tie.secondLeg)
      }
    ]
  };
}

export function resolveGoldCupPlayoffTie(
  state: GoldCupState,
  playoffId: string,
  tieId: string,
  winner: string,
  penalties: { home: string[]; away: string[] } | null
): void {
  const playoff = state.playoffEditions.find(item => item.id === playoffId);
  const tie = playoff?.ties.find(item => item.id === tieId);
  if (!playoff || !tie) throw new Error(`Unknown Gold Cup playoff tie "${tieId}".`);
  tie.winner = winner;
  tie.penalties = penalties;
}

export function completeGoldCupPlayoff(state: GoldCupState, playoffId: string): void {
  const playoff = state.playoffEditions.find(item => item.id === playoffId);
  if (!playoff) throw new Error(`Unknown Gold Cup playoff edition "${playoffId}".`);
  if (playoff.ties.some(tie => !tie.winner)) {
    throw new Error(`Gold Cup playoff edition "${playoffId}" cannot complete before every tie is decided.`);
  }
  playoff.qualifiers = playoff.ties.map(tie => tie.winner as string);
  playoff.completed = true;
}

export function drawInternationalCupGroups(
  teams: string[],
  hosts: string[],
  worldRanks: Record<string, number>
): { pots: string[][]; groups: string[][] } {
  const hostSet = new Set(hosts);
  const ranked = [...teams].sort((a, b) =>
    (worldRanks[a] ?? Number.MAX_SAFE_INTEGER) - (worldRanks[b] ?? Number.MAX_SAFE_INTEGER) ||
    a.localeCompare(b)
  );
  const potOne = [
    ...ranked.filter(code => hostSet.has(code)),
    ...ranked.filter(code => !hostSet.has(code)).slice(0, 4 - hosts.length)
  ];
  const remaining = ranked.filter(code => !potOne.includes(code));
  const pots = [potOne, ...Array.from({ length: 3 }, (_, index) => remaining.slice(index * 4, (index + 1) * 4))];
  const groups = GROUP_NAMES.map(() => [] as string[]);
  for (const pot of pots) {
    shuffledCopy(pot).forEach((team, index) => groups[index].push(team));
  }
  return { pots, groups };
}

export function createInternationalCupGroupMatches(
  teams: string[],
  group: string,
  year: number,
  windowId: string,
  windowMatchday: number,
  competition: InternationalCup = "goldCup"
): InternationalMatch[][] {
  const isGoldCup = competition === "goldCup";
  const editionId = `${isGoldCup ? "GC" : "COPA"}-${year}-${windowId}`;
  return GROUP_PAIRINGS.map((pairing, roundIndex) =>
    pairing.map(([homeIndex, awayIndex]) =>
      createMatch(
        teams[homeIndex],
        teams[awayIndex],
        isGoldCup ? "goldCupGroup" : "copaAmericaGroup",
        year,
        windowId,
        windowMatchday,
        isGoldCup
          ? {
              goldCupEditionId: editionId,
              goldCupStage: "group",
              goldCupGroup: group,
              goldCupRound: roundIndex + 1
            }
          : {
              copaAmericaEditionId: editionId,
              copaAmericaStage: "group",
              copaAmericaGroup: group,
              copaAmericaRound: roundIndex + 1
            }
      )
    )
  );
}

export function createGoldCupEdition(
  state: GoldCupState,
  playoffId: string,
  directQualifiers: string[],
  year: number,
  windowId: string,
  windowMatchday: number,
  worldRanks: Record<string, number>
): { edition: GoldCupEdition; rounds: InternationalRound[] } {
  const playoff = state.playoffEditions.find(item => item.id === playoffId);
  if (!playoff?.completed) {
    throw new Error("The Gold Cup playoff must be complete before the Gold Cup draw.");
  }
  const teams = [...directQualifiers, ...playoff.qualifiers];
  if (teams.length !== 16 || new Set(teams).size !== 16) {
    throw new Error(`The Gold Cup requires 16 unique qualified teams, but received ${teams.length}.`);
  }
  const qualified = new Set(teams);
  const eligibleHosts = (hostOptions.GC ?? []).filter(option =>
    option.split("|").every(code => qualified.has(code))
  );
  if (eligibleHosts.length === 0) {
    throw new Error("No Gold Cup host configuration is eligible among the qualified teams.");
  }
  const chosenHosts = eligibleHosts[Math.floor(Math.random() * eligibleHosts.length)].split("|");
  const { pots, groups } = drawInternationalCupGroups(teams, chosenHosts, worldRanks);
  const id = `GC-${year}-${windowId}`;
  const goldCup: GoldCupEdition = {
    id,
    year,
    windowId,
    windowMatchday,
    hosts: chosenHosts,
    teams,
    pots,
    seedRanks: Object.fromEntries(teams.map(code => [code, worldRanks[code] ?? Number.MAX_SAFE_INTEGER])),
    groups: groups.map((groupTeams, index) => ({
      name: GROUP_NAMES[index],
      teams: groupTeams,
      matches: createInternationalCupGroupMatches(groupTeams, GROUP_NAMES[index], year, windowId, windowMatchday)
    })),
    knockout: null,
    completed: false,
    winner: null,
    runnerUp: null,
    semifinalists: []
  };
  state.editions.push(goldCup);
  const rounds = [0, 1, 2].map(roundIndex => ({
    kind: "goldCup" as const,
    label: `Gold Cup · Group stage · Matchday ${roundIndex + 1}`,
    leftOut: null,
    matches: goldCup.groups.flatMap(group => group.matches[roundIndex])
  }));
  return { edition: goldCup, rounds };
}

export function getGoldCupPlayoff(state: GoldCupState, id: string): GoldCupPlayoffEdition {
  const playoff = state.playoffEditions.find(item => item.id === id);
  if (!playoff) throw new Error(`Unknown Gold Cup playoff edition "${id}".`);
  return playoff;
}

function groupStandings(edition: GoldCupEdition, group: GoldCupGroup) {
  const rows = new Map(group.teams.map(code => [code, {
    code, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0
  }]));
  for (const match of group.matches.flat()) {
    if (match.homeGoals === null || match.awayGoals === null) continue;
    const home = rows.get(match.home);
    const away = rows.get(match.away);
    if (!home || !away) throw new Error(`Invalid Gold Cup fixture in Group ${group.name}.`);
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
  return [...rows.values()].map(row => ({
    ...row,
    goalDifference: row.goalsFor - row.goalsAgainst
  })).sort((a, b) =>
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    edition.seedRanks[a.code] - edition.seedRanks[b.code]
  );
}

export function getInternationalCupStandings(edition: GoldCupEdition, group: GoldCupGroup) {
  return groupStandings(edition, group);
}

export const getGoldCupStandings = getInternationalCupStandings;

function makeKnockoutMatch(
  edition: GoldCupEdition,
  id: string,
  home: string,
  away: string,
  competition: InternationalCup = "goldCup"
): GoldCupKnockoutMatch {
  const isGoldCup = competition === "goldCup";
  const fixture = createMatch(
    home,
    away,
    isGoldCup ? "goldCupKnockout" : "copaAmericaKnockout",
    edition.year,
    edition.windowId,
    edition.windowMatchday,
    isGoldCup
      ? {
          goldCupEditionId: edition.id,
          goldCupStage: "knockout",
          goldCupKnockoutMatchId: id
        }
      : {
          copaAmericaEditionId: edition.id,
          copaAmericaStage: "knockout",
          copaAmericaKnockoutMatchId: id
        }
  );
  return { id, home, away, fixture, winner: null };
}

export function advanceInternationalCupRound(
  edition: GoldCupEdition,
  roundIndex: number,
  competition: InternationalCup = "goldCup"
): InternationalRound | null {
  const isGoldCup = competition === "goldCup";
  const roundKind = isGoldCup ? "goldCup" : "copaAmerica";
  const competitionLabel = isGoldCup ? "Gold Cup" : "Copa América";
  if (roundIndex === -1) {
    if (edition.groups.some(group => group.matches.flat().some(match => match.homeGoals === null || match.awayGoals === null))) {
      return null;
    }
    const topTwo = Object.fromEntries(edition.groups.map(group => [
      group.name,
      groupStandings(edition, group).slice(0, 2).map(row => row.code)
    ])) as Record<typeof GROUP_NAMES[number], string[]>;
    const quarterFinals = [
      ["A", 0, "B", 1],
      ["C", 0, "D", 1],
      ["B", 0, "A", 1],
      ["D", 0, "C", 1]
    ] as const;
    const matches = quarterFinals.map(([group1, place1, group2, place2], index) =>
      makeKnockoutMatch(
        edition,
        `QF${index + 1}`,
        topTwo[group1][place1],
        topTwo[group2][place2],
        competition
      )
    );
    edition.knockout = [{ label: "Quarter-finals", matches }];
    return {
      kind: roundKind,
      label: `${competitionLabel} · Quarter-finals`,
      leftOut: null,
      matches: matches.map(match => match.fixture)
    };
  }

  const knockout = edition.knockout;
  const round = knockout?.[roundIndex];
  if (!round || round.matches.some(match => match.winner === null)) return null;
  if (roundIndex === 0 || roundIndex === 1) {
    const winners = round.matches.map(match => match.winner as string);
    const nextMatches = Array.from({ length: roundIndex === 0 ? 2 : 1 }, (_, index) => {
      const winner1 = winners[index * 2];
      const winner2 = winners[index * 2 + 1];
      return makeKnockoutMatch(edition, roundIndex === 0 ? `SF${index + 1}` : "F", winner1, winner2, competition);
    });
    const label = roundIndex === 0 ? "Semi-finals" : "Final";
    knockout.push({ label, matches: nextMatches });
    if (roundIndex === 1) {
      edition.semifinalists = round.matches.map(match => {
        if (!match.winner) throw new Error(`${competitionLabel} semi-final "${match.id}" has no winner.`);
        return match.winner === match.home ? match.away : match.home;
      });
    }
    return {
      kind: roundKind,
      label: `${competitionLabel} · ${label}`,
      leftOut: null,
      matches: nextMatches.map(match => match.fixture)
    };
  }

  const final = round.matches[0];
  edition.winner = final.winner;
  edition.runnerUp = final.winner === final.home ? final.away : final.home;
  edition.completed = true;
  return null;
}

export function setInternationalCupKnockoutWinner(
  edition: GoldCupEdition,
  matchId: string,
  winner: string
): void {
  const match = edition.knockout?.flatMap(round => round.matches).find(item => item.id === matchId);
  if (!match) throw new Error(`Unknown international cup knockout match "${matchId}".`);
  match.winner = winner;
}

export function findLatestGoldCupPlayoff(state: GoldCupState): GoldCupPlayoffEdition | null {
  return state.playoffEditions.at(-1) ?? null;
}

export function findLatestGoldCupEdition(state: GoldCupState): GoldCupEdition | null {
  return state.editions.at(-1) ?? null;
}

export function getGoldCupHostNames(hosts: string[]): string {
  return hosts.map(getNationName).join(" / ");
}

export function playoffAggregate(tie: GoldCupPlayoffTie): { team1: number; team2: number } {
  if (tie.firstLeg.homeGoals === null || tie.firstLeg.awayGoals === null ||
    tie.secondLeg.homeGoals === null || tie.secondLeg.awayGoals === null) {
    throw new Error(`Gold Cup playoff tie "${tie.id}" has unplayed legs.`);
  }
  return {
    team1: tie.firstLeg.homeGoals + tie.secondLeg.awayGoals,
    team2: tie.firstLeg.awayGoals + tie.secondLeg.homeGoals
  };
}
