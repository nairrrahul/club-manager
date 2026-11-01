import { shuffledCopy } from "../../utils";
import { createInternationalPlayoffPaths } from "../internationalCompetitionsUtils";
import type { InternationalCompetitionGroup } from "../internationalCompetitionsUtils";
import type { InternationalMatch, InternationalRound } from "../international";
import type { WorldCupEdition, WorldCupPath, WorldCupPhase, WorldCupTie } from "./types";

export function emptyWorldCupPhase(groups: InternationalCompetitionGroup[] = []): WorldCupPhase {
  return {
    groups,
    roundsPlayed: 0,
    completed: false,
    qualifiers: [],
    playoffTeams: [],
    bottomSeeds: [],
    ties: [],
    paths: [],
    playoffRoundsPlayed: 0,
    playoffComplete: false
  };
}

export function findWorldCupTie(edition: WorldCupEdition, tieId: string): WorldCupTie | null {
  for (const region of Object.values(edition.regions).concat([edition.intercontinental])) {
    for (const phase of Object.values(region.phases)) {
      const tie = phase.ties.find(item => item.id === tieId);
      if (tie) return tie;
    }
  }
  return null;
}

export function createRoundRobinGroups(
  teams: string[],
  groupSize: number,
  groupCount: number,
  seedRanks: Record<string, number>,
  nameOffset = 0
): InternationalCompetitionGroup[] {
  if (teams.length !== groupCount * groupSize) {
    throw new Error(`World Cup qualifying draw needs ${groupCount * groupSize} teams; received ${teams.length}.`);
  }
  const ranked = [...teams].sort((a, b) =>
    (seedRanks[a] ?? Number.MAX_SAFE_INTEGER) - (seedRanks[b] ?? Number.MAX_SAFE_INTEGER) || a.localeCompare(b)
  );
  const pots = Array.from({ length: groupSize }, (_, index) =>
    ranked.slice(index * groupCount, (index + 1) * groupCount)
  );
  const groups = Array.from({ length: groupCount }, (_, index) => ({
    name: String.fromCharCode(65 + nameOffset + index),
    teams: [] as string[],
    matches: [] as InternationalMatch[][]
  }));
  for (const pot of pots) {
    shuffledCopy(pot).forEach((team, index) => groups[index].teams.push(team));
  }
  return groups.map(group => ({ ...group, matches: createGroupFixtures(group.teams, group.name) }));
}

export function createBalancedGroups(
  teams: string[],
  groupCount: number,
  seedRanks: Record<string, number>,
  nameOffset = 0
): InternationalCompetitionGroup[] {
  if (groupCount < 1 || teams.length < groupCount) {
    throw new Error(`World Cup qualifying cannot distribute ${teams.length} teams into ${groupCount} groups.`);
  }
  const ranked = [...teams].sort((a, b) =>
    (seedRanks[a] ?? Number.MAX_SAFE_INTEGER) - (seedRanks[b] ?? Number.MAX_SAFE_INTEGER) || a.localeCompare(b)
  );
  const sizes = Array.from({ length: groupCount }, (_, index) =>
    Math.floor(teams.length / groupCount) + (index < teams.length % groupCount ? 1 : 0)
  );
  const pots = Array.from({ length: Math.max(...sizes) }, (_, potIndex) =>
    sizes.flatMap((size, groupIndex) => size > potIndex ? [groupIndex] : [])
  );
  const groups = Array.from({ length: groupCount }, (_, index) => ({
    name: String.fromCharCode(65 + nameOffset + index),
    teams: [] as string[],
    matches: [] as InternationalMatch[][]
  }));
  let teamIndex = 0;
  for (const pot of pots) {
    const drawn = shuffledCopy(ranked.slice(teamIndex, teamIndex + pot.length));
    teamIndex += pot.length;
    pot.forEach((groupIndex, index) => groups[groupIndex].teams.push(drawn[index]));
  }
  return groups.map(group => ({ ...group, matches: createGroupFixtures(group.teams, group.name) }));
}

export function createGroupFixtures(
  teams: string[],
  group: string,
  homeAndAway = true
): InternationalMatch[][] {
  const rotating: (string | null)[] = teams.length % 2 === 0 ? [...teams] : [...teams, null];
  const firstLegs: [string, string][][] = [];
  for (let round = 0; round < rotating.length - 1; round++) {
    const fixtures: [string, string][] = [];
    for (let i = 0; i < rotating.length / 2; i++) {
      const home = rotating[i];
      const away = rotating[rotating.length - 1 - i];
      if (home && away) fixtures.push(round % 2 === 0 ? [home, away] : [away, home]);
    }
    firstLegs.push(fixtures);
    rotating.splice(1, 0, rotating.pop()!);
  }
  const rounds = homeAndAway
    ? [...firstLegs, ...firstLegs.map(round => round.map(([home, away]) => [away, home] as [string, string]))]
    : firstLegs;
  return rounds
    .map(fixtures => fixtures.map(([home, away]) => ({
      home, away, kind: "worldCupQualifier", homeGoals: null, awayGoals: null,
      homeChange: null, awayChange: null
    })));
}

export function createWorldCupGroupRounds(
  phase: WorldCupPhase,
  editionId: string,
  stage: string,
  kind: InternationalRound["kind"],
  year: number,
  windowId: string,
  afterMatchday: number,
  roundsPerWindow: number,
  totalRounds?: number,
  scheduledStartRound = phase.roundsPlayed
): InternationalRound[] {
  const roundCount = totalRounds ?? Math.max(...phase.groups.map(group => group.matches.length));
  if (phase.roundsPlayed !== scheduledStartRound) {
    throw new Error(
      `${stage} expected matchday ${scheduledStartRound + 1}, but ${phase.roundsPlayed} matchdays have been played.`
    );
  }
  const count = Math.min(roundsPerWindow, roundCount - scheduledStartRound);
  if (count < 1) return [];
  return Array.from({ length: count }, (_, offset) => {
    const roundIndex = scheduledStartRound + offset;
    const matches = phase.groups.flatMap(group => group.matches[roundIndex] ?? []);
    matches.forEach((match, matchIndex) => Object.assign(match, {
      kind: kind ?? "worldCupQualifier",
      windowYear: year,
      windowId,
      windowMatchday: afterMatchday,
      worldCupEditionId: editionId,
      worldCupStage: stage,
      worldCupPhase: stage,
      worldCupRound: roundIndex + 1,
      worldCupGroup: phase.groups.find(group => group.matches[roundIndex]?.includes(match))?.name,
      worldCupMatchIndex: matchIndex
    }));
    return {
      kind,
      label: `${stage} · Matchday ${roundIndex + 1}`,
      leftOut: null,
      worldCupEditionId: editionId,
      worldCupStage: stage,
      worldCupPhase: stage,
      worldCupRound: roundIndex + 1,
      matches
    } as InternationalRound;
  });
}

export function getStandings(group: InternationalCompetitionGroup, ranks: Record<string, number>) {
  const table = new Map(group.teams.map(code => [code, {
    code, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0
  }]));
  for (const match of group.matches.flat()) {
    if (match.homeGoals === null || match.awayGoals === null) continue;
    const home = table.get(match.home);
    const away = table.get(match.away);
    if (!home || !away) throw new Error(`Invalid World Cup qualifying fixture in Group ${group.name}.`);
    home.played++;
    away.played++;
    home.goalsFor += match.homeGoals;
    home.goalsAgainst += match.awayGoals;
    away.goalsFor += match.awayGoals;
    away.goalsAgainst += match.homeGoals;
    if (match.homeGoals > match.awayGoals) {
      home.won++; away.lost++; home.points += 3;
    } else if (match.homeGoals < match.awayGoals) {
      away.won++; home.lost++; away.points += 3;
    } else {
      home.drawn++; away.drawn++; home.points++; away.points++;
    }
  }
  return [...table.values()].map(row => ({ ...row, goalDifference: row.goalsFor - row.goalsAgainst }))
    .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor || (ranks[a.code] ?? Number.MAX_SAFE_INTEGER) -
      (ranks[b.code] ?? Number.MAX_SAFE_INTEGER));
}

export function rankGroupPlaces(
  groups: InternationalCompetitionGroup[],
  position: number,
  ranks: Record<string, number>,
  discardLastPlaceResults = false
) {
  return groups.map(group => {
    let rows = getStandings(group, ranks);
    let row = rows[position - 1];
    if (!row) throw new Error(`Group ${group.name} has no position ${position}.`);
    if (discardLastPlaceResults && group.teams.length !== Math.min(...groups.map(item => item.teams.length))) {
      const bottom = rows[rows.length - 1].code;
      const discarded = group.matches.flat().filter(match => match.home === bottom || match.away === bottom);
      let points = 0, goalDifference = 0, goalsFor = 0;
      for (const match of group.matches.flat()) {
        if (match.homeGoals === null || match.awayGoals === null ||
          match.home === bottom || match.away === bottom) continue;
        const isHome = match.home === row.code;
        if (!isHome && match.away !== row.code) continue;
        const gf = isHome ? match.homeGoals : match.awayGoals;
        const ga = isHome ? match.awayGoals : match.homeGoals;
        goalsFor += gf;
        goalDifference += gf - ga;
        points += gf > ga ? 3 : gf === ga ? 1 : 0;
      }
      void discarded;
      row = { ...row, points, goalDifference, goalsFor };
    }
    return { ...row, group: group.name };
  });
}

export function makeTies(teams: string[], idPrefix: string, year: number, windowId: string, matchday: number): WorldCupTie[] {
  if (teams.length % 2 !== 0) throw new Error(`${idPrefix} needs an even number of teams to form ties.`);
  const ranked = [...teams];
  return Array.from({ length: ranked.length / 2 }, (_, index) => {
    const team1 = ranked[index];
    const team2 = ranked[ranked.length - 1 - index];
    const base = {
      kind: "worldCupQualifier",
      homeGoals: null, awayGoals: null, homeChange: null, awayChange: null,
      windowYear: year, windowId, windowMatchday: matchday
    };
    return {
      id: `${idPrefix}-${index + 1}`,
      team1, team2, winner: null,
      firstLeg: { ...base, home: team1, away: team2, worldCupTieId: `${idPrefix}-${index + 1}`, worldCupLeg: 1 },
      secondLeg: { ...base, home: team2, away: team1, worldCupTieId: `${idPrefix}-${index + 1}`, worldCupLeg: 2 }
    };
  });
}

export function getWorldCupTieRounds(
  phase: WorldCupPhase,
  editionId: string,
  phaseName: string,
  year: number,
  windowId: string,
  matchday: number
): InternationalRound[] {
  if (phase.ties.length === 0) return [];
  return [1, 2].map(leg => ({
    kind: "worldCupQualifier",
    label: `${phaseName} · ${leg === 1 ? "First" : "Second"} leg`,
    leftOut: null,
    worldCupEditionId: editionId,
    worldCupStage: phaseName,
    worldCupPhase: phaseName,
    worldCupRound: leg,
    matches: phase.ties.map(tie => {
      const match = leg === 1 ? tie.firstLeg : tie.secondLeg;
      Object.assign(match, {
        kind: "worldCupQualifier",
        windowYear: year,
        windowId,
        windowMatchday: matchday,
        worldCupEditionId: editionId,
        worldCupStage: phaseName,
        worldCupPhase: phaseName,
        worldCupTieId: tie.id,
        worldCupLeg: leg as 1 | 2
      });
      return match;
    })
  }));
}

function settleWorldCupByes(paths: WorldCupPath[], roundIndex: number): void {
  for (const path of paths) {
    for (const match of path.bracket.rounds[roundIndex] ?? []) {
      if (match.winner) continue;
      const home = match.player1?.team ?? null;
      const away = match.player2?.team ?? null;
      if (home && !away) match.winner = home;
      else if (away && !home) match.winner = away;
    }
  }
}

export function getWorldCupPathRound(
  phase: WorldCupPhase,
  editionId: string,
  phaseName: string,
  year: number,
  windowId: string,
  matchday: number
): InternationalRound | null {
  const roundIndex = phase.playoffRoundsPlayed;
  settleWorldCupByes(phase.paths, roundIndex);
  const matches = phase.paths.flatMap(path =>
    (path.bracket.rounds[roundIndex] ?? []).flatMap((bracketMatch, matchIndex) => {
      const home = bracketMatch.player1?.team;
      const away = bracketMatch.player2?.team;
      if (!home || !away) return [];
      return [{
        home, away,
        kind: "worldCupQualifier",
        homeGoals: null, awayGoals: null, homeChange: null, awayChange: null,
        windowYear: year, windowId, windowMatchday: matchday,
        worldCupEditionId: editionId, worldCupStage: phaseName,
        worldCupPhase: phaseName, worldCupPath: path.name,
        worldCupPathRound: roundIndex + 1, worldCupPathMatch: matchIndex
      } as InternationalMatch];
    })
  );
  if (matches.length === 0) return null;
  return {
    kind: "worldCupQualifier",
    label: `${phaseName} · Round ${roundIndex + 1}`,
    leftOut: null,
    worldCupEditionId: editionId,
    worldCupStage: phaseName,
    worldCupPhase: phaseName,
    worldCupRound: roundIndex + 1,
    matches
  };
}

export function recordWorldCupPathRound(phase: WorldCupPhase, matches: InternationalMatch[]): boolean {
  const roundIndex = phase.playoffRoundsPlayed;
  for (const match of matches) {
    const path = phase.paths.find(item => item.name === match.worldCupPath);
    const index = match.worldCupPathMatch;
    const bracketMatch = index === undefined ? undefined : path?.bracket.rounds[roundIndex]?.[index];
    if (!path || !bracketMatch || !match.worldCupWinner) throw new Error("World Cup playoff result does not match the drawn bracket.");
    if (match.homeGoals === null || match.awayGoals === null) {
      throw new Error("World Cup playoff result is missing its score.");
    }
    path.results[bracketMatch.id] = {
      homeGoals: match.homeGoals,
      awayGoals: match.awayGoals,
      ...(match.homePenalties ? { homePenalties: [...match.homePenalties] } : {}),
      ...(match.awayPenalties ? { awayPenalties: [...match.awayPenalties] } : {})
    };
    bracketMatch.winner = match.worldCupWinner;
  }
  settleWorldCupByes(phase.paths, roundIndex);
  if (!phase.paths.every(path =>
    path.bracket.rounds[roundIndex] === undefined ||
    path.bracket.rounds[roundIndex].every(match => match.winner)
  )) return false;
  phase.playoffRoundsPlayed++;
  for (const path of phase.paths) {
    const previous = path.bracket.rounds[roundIndex];
    path.bracket.rounds[roundIndex + 1]?.forEach((match, index) => {
      const first = previous[index * 2]?.winner;
      const second = previous[index * 2 + 1]?.winner;
      if (!first || !second) throw new Error(`World Cup Path ${path.name} is missing a prior-round winner.`);
      match.player1 = { team: first };
      match.player2 = { team: second };
    });
  }
  if (phase.paths.every(path => phase.playoffRoundsPlayed >= path.bracket.rounds.length)) {
    phase.playoffComplete = true;
    phase.completed = true;
    phase.qualifiers = phase.paths.map(path => path.bracket.rounds.at(-1)?.[0]?.winner)
      .filter((team): team is string => Boolean(team));
    return true;
  }
  return false;
}

export function drawPaths(teams: string[], pathCount: number, ranks: Record<string, number>, bottomSeeds: string[] = []): WorldCupPath[] {
  const draw = createInternationalPlayoffPaths(teams, pathCount, ranks, bottomSeeds);
  return draw.paths.map((path, index) => ({
    ...path,
    name: String.fromCharCode(65 + index),
    results: {}
  }));
}

export function recordPathWinners(paths: WorldCupPath[], matches: InternationalMatch[], roundIndex: number): boolean {
  for (const match of matches) {
    const path = paths.find(item => item.name === match.worldCupPath);
    const index = match.worldCupPathMatch;
    const bracketMatch = index === undefined ? undefined : path?.bracket.rounds[roundIndex]?.[index];
    if (!bracketMatch) throw new Error("World Cup playoff fixture does not map to a bracket match.");
    if (!match.worldCupWinner) throw new Error("World Cup playoff fixture has no recorded winner.");
    bracketMatch.winner = match.worldCupWinner;
  }
  if (!paths.every(path => path.bracket.rounds[roundIndex]?.every(match => match.winner))) return false;
  return true;
}

export function advancePathRound(paths: WorldCupPath[], roundIndex: number): void {
  for (const path of paths) {
    const round = path.bracket.rounds[roundIndex];
    for (const match of round) {
      if (!match.winner) throw new Error(`World Cup path ${path.name} has an unresolved match.`);
    }
    const next = path.bracket.rounds[roundIndex + 1];
    if (!next) continue;
    next.forEach((match, index) => {
      const first = round[index * 2]?.winner;
      const second = round[index * 2 + 1]?.winner;
      if (!first || !second) throw new Error(`World Cup path ${path.name} has missing winners for the next round.`);
      match.player1 = { team: first };
      match.player2 = { team: second };
    });
  }
}
