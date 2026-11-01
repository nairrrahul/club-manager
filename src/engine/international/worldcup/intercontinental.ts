import { emptyWorldCupPhase, drawPaths } from "./utils";
import type { WorldCupEdition, WorldCupPath, WorldCupRegionalQualifying } from "./types";
import type { InternationalMatch, InternationalRound } from "../international";

export function createIntercontinentalPlayoff(
  edition: WorldCupEdition,
  year: number,
  windowId: string,
  matchday: number
): void {
  const entrants = Object.values(edition.regions).flatMap(region => region.intercontinental);
  if (entrants.length < 5) {
    throw new Error(`Intercontinental playoff requires at least five teams; received ${entrants.length}.`);
  }
  const phase = emptyWorldCupPhase();
  phase.playoffTeams = entrants;
  phase.paths = drawPaths(entrants, 2, edition.seedRanks);
  phase.completed = false;
  edition.intercontinental = {
    confederation: "ICPO", teams: entrants, phases: { ICPO: phase },
    qualified: [], intercontinental: [], playoffQualifiers: [], playoffBottomSeeds: []
  };
  void year;
  void windowId;
  void matchday;
}

function settleByes(paths: WorldCupPath[], roundIndex: number): void {
  for (const path of paths) {
    const round = path.bracket.rounds[roundIndex];
    if (!round) continue;
    for (const match of round) {
      if (match.winner) continue;
      const team1 = match.player1?.team ?? null;
      const team2 = match.player2?.team ?? null;
      if (team1 && !team2) match.winner = team1;
      else if (team2 && !team1) match.winner = team2;
    }
  }
}

export function getIntercontinentalPlayoffRounds(
  edition: WorldCupEdition,
  year: number,
  windowId: string,
  matchday: number
): InternationalRound[] {
  const phase = edition.intercontinental.phases.ICPO;
  if (!phase) return [];
  settleByes(phase.paths, phase.playoffRoundsPlayed);
  const matches = phase.paths.flatMap(path =>
    (path.bracket.rounds[phase.playoffRoundsPlayed] ?? []).flatMap((bracketMatch, index) => {
      const home = bracketMatch.player1?.team;
      const away = bracketMatch.player2?.team;
      if (!home || !away) return [];
      return [{
        home, away, kind: "worldCupQualifier",
        homeGoals: null, awayGoals: null, homeChange: null, awayChange: null,
        windowYear: year, windowId, windowMatchday: matchday,
        worldCupEditionId: edition.id, worldCupStage: "ICPO",
        worldCupPhase: "ICPO",
        worldCupPath: path.name, worldCupPathRound: phase.playoffRoundsPlayed + 1,
        worldCupPathMatch: index
      } as InternationalMatch];
    })
  );
  return matches.length === 0 ? [] : [{
    kind: "worldCupQualifier",
    label: `Intercontinental Play-offs · Round ${phase.playoffRoundsPlayed + 1}`,
    leftOut: null,
    worldCupEditionId: edition.id,
    worldCupStage: "ICPO",
    worldCupPhase: "ICPO",
    worldCupRound: phase.playoffRoundsPlayed + 1,
    matches
  }];
}

export function recordIntercontinentalPlayoffRound(
  edition: WorldCupEdition,
  matches: InternationalMatch[]
): boolean {
  const phase = edition.intercontinental.phases.ICPO;
  if (!phase) throw new Error("Intercontinental playoff was not initialized.");
  for (const match of matches) {
    const path = phase.paths.find(item => item.name === match.worldCupPath);
    const bracketMatch = match.worldCupPathMatch === undefined
      ? undefined
      : path?.bracket.rounds[phase.playoffRoundsPlayed]?.[match.worldCupPathMatch];
    if (!path || !bracketMatch || !match.worldCupWinner) throw new Error("Invalid intercontinental playoff match result.");
    if (match.homeGoals === null || match.awayGoals === null) {
      throw new Error("Intercontinental playoff result is missing its score.");
    }
    path.results[bracketMatch.id] = {
      homeGoals: match.homeGoals,
      awayGoals: match.awayGoals,
      ...(match.homePenalties ? { homePenalties: [...match.homePenalties] } : {}),
      ...(match.awayPenalties ? { awayPenalties: [...match.awayPenalties] } : {})
    };
    bracketMatch.winner = match.worldCupWinner;
  }
  settleByes(phase.paths, phase.playoffRoundsPlayed);
  if (!phase.paths.every(path =>
    path.bracket.rounds[phase.playoffRoundsPlayed] === undefined ||
    path.bracket.rounds[phase.playoffRoundsPlayed].every(match => match.winner)
  )) {
    return false;
  }
  phase.playoffRoundsPlayed++;
  for (const path of phase.paths) {
    const previous = path.bracket.rounds[phase.playoffRoundsPlayed - 1];
    const next = path.bracket.rounds[phase.playoffRoundsPlayed];
    next?.forEach((match, index) => {
      match.player1 = { team: previous[index * 2]?.winner ?? null };
      match.player2 = { team: previous[index * 2 + 1]?.winner ?? null };
    });
  }
  if (phase.paths.every(path => phase.playoffRoundsPlayed >= path.bracket.rounds.length)) {
    phase.playoffComplete = true;
    phase.completed = true;
    phase.qualifiers = phase.paths.map(path => path.bracket.rounds.at(-1)?.[0]?.winner)
      .filter((team): team is string => Boolean(team));
    edition.intercontinental.qualified = phase.qualifiers;
    return true;
  }
  phase.completed = false;
  return false;
}

export function createIntercontinentalRegion(): WorldCupRegionalQualifying {
  return { confederation: "ICPO", teams: [], phases: {}, qualified: [], intercontinental: [], playoffQualifiers: [], playoffBottomSeeds: [] };
}
