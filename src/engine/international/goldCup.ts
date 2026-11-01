import hostOptionsRaw from "../data/intl/tournament_hosts.json";
import { getNationName } from "../nations";
import { getNationsLeagueStandings, type NationsLeagueEdition } from "./nationsLeague";
import type { InternationalMatch, InternationalRound } from "./international";
import type { InternationalCompetitionEdition } from "./internationalCompetitionsUtils";
import {
  createInternationalCupGroupMatches, drawInternationalCupGroups,
  getFixedInternationalCompetitionHosts, getInternationalWindowType
} from "./internationalCompetitionsUtils";

const hostOptions = hostOptionsRaw as Record<string, string[]>;
const GROUP_NAMES = ["A", "B", "C", "D"] as const;

export function getGoldCupWindowType(year: number, windowId: string): "GCPO" | "GC" | null {
  const type = getInternationalWindowType("CONCACAF", year, windowId);
  if (type.startsWith("GCPO")) return "GCPO";
  if (type.startsWith("GC")) return "GC";
  return null;
}

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

export interface GoldCupState {
  playoffEditions: GoldCupPlayoffEdition[];
  editions: InternationalCompetitionEdition[];
}

export function createGoldCupState(): GoldCupState {
  return { playoffEditions: [], editions: [] };
}

function createMatch(
  home: string,
  away: string,
  kind: "goldCupPlayoff",
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

export function createGoldCupEdition(
  state: GoldCupState,
  playoffId: string,
  directQualifiers: string[],
  year: number,
  windowId: string,
  windowMatchday: number,
  worldRanks: Record<string, number>
): { edition: InternationalCompetitionEdition; rounds: InternationalRound[] } {
  const playoff = state.playoffEditions.find(item => item.id === playoffId);
  if (!playoff?.completed) {
    throw new Error("The Gold Cup playoff must be complete before the Gold Cup draw.");
  }
  const teams = [...directQualifiers, ...playoff.qualifiers];
  if (teams.length !== 16 || new Set(teams).size !== 16) {
    throw new Error(`The Gold Cup requires 16 unique qualified teams, but received ${teams.length}.`);
  }
  const qualified = new Set(teams);
  const fixedHosts = getFixedInternationalCompetitionHosts("GC", year + 1);
  const eligibleHosts = (hostOptions.GC ?? []).filter(option =>
    option.split("|").every(code => qualified.has(code))
  );
  if (!fixedHosts && eligibleHosts.length === 0) {
    throw new Error("No Gold Cup host configuration is eligible among the qualified teams.");
  }
  const chosenHosts = fixedHosts ?? eligibleHosts[Math.floor(Math.random() * eligibleHosts.length)].split("|");
  if (chosenHosts.some(host => !qualified.has(host))) {
    throw new Error(`Configured Gold Cup hosts for ${year} must qualify for the tournament.`);
  }
  const { pots, groups } = drawInternationalCupGroups(teams, chosenHosts, worldRanks);
  const id = `GC-${year}-${windowId}`;
  const goldCup: InternationalCompetitionEdition = {
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

export function findLatestGoldCupPlayoff(state: GoldCupState): GoldCupPlayoffEdition | null {
  return state.playoffEditions.at(-1) ?? null;
}

export function findLatestGoldCupEdition(state: GoldCupState): InternationalCompetitionEdition | null {
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
