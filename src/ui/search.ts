import { TEAM_DIRECTORY } from "../engine/game";
import type { Game } from "../engine/game";
import { LEAGUE_NAMES, CUP_NAME } from "../engine/constants";
import { COMPETITION_NAMES } from "../engine/europeanCompetitions";
import { normalizeText } from "./format";
import { nationInfo } from "../engine/nations";
import { computeRankings } from "../engine/international";
import { getNationsLeagueConfederations } from "../engine/nationsLeague";

export interface SearchResult {
  kind: "player" | "team" | "competition" | "nation";
  key: string;
  label: string;
  sub: string;
  to: string;
}

const PER_KIND = 8;

export function runSearch(game: Game, rawQuery: string): SearchResult[] {
  const query = normalizeText(rawQuery.trim());
  if (query.length === 0) return [];

  const players: SearchResult[] = [];
  const team = game.managerTeam;
  for (const player of game.season.freeAgents.retiredPlayers) {
    const name = `${player.firstName} ${player.lastName}`;
    if (normalizeText(name).includes(query)) {
      players.push({
        kind: "player",
        key: `p-${player.id}`,
        label: name,
        sub: `Retired · ${player.position} · OVR ${player.overall}`,
        to: `/player/${encodeURIComponent(player.id)}`
      });
    }
  }
  const groups: [string, NonNullable<typeof team>["seniorSquad"]][] = team
    ? [["Senior squad", team.seniorSquad], ["Youth academy", team.youthAcademySquad]]
    : [];
  for (const [where, squad] of groups) {
    for (const player of squad ?? []) {
      if (player.isRetired) continue;
      const name = `${player.firstName} ${player.lastName}`;
      if (normalizeText(name).includes(query)) {
        players.push({
          kind: "player",
          key: `p-${player.id}`,
          label: name,
          sub: `${where} · ${player.position} · OVR ${player.overall}`,
          to: `/player/${encodeURIComponent(player.id)}`
        });
      }
    }
  }

  // Free agents and players signed by other clubs.
  for (const entry of game.season.freeAgents.available) {
    if (entry.player.isRetired) continue;
    const name = `${entry.player.firstName} ${entry.player.lastName}`;
    if (normalizeText(name).includes(query)) {
      players.push({
        kind: "player",
        key: `p-${entry.player.id}`,
        label: name,
        sub: `Free agent · ${entry.player.position} · OVR ${entry.player.overall}`,
        to: `/player/${encodeURIComponent(entry.player.id)}`
      });
    }
  }
  for (const [teamID, entries] of Object.entries(game.season.freeAgents.clubPlayers)) {
    for (const entry of entries) {
      if (entry.player.isRetired) continue;
      const name = `${entry.player.firstName} ${entry.player.lastName}`;
      if (normalizeText(name).includes(query)) {
        players.push({
          kind: "player",
          key: `p-${entry.player.id}`,
          label: name,
          sub: `${TEAM_DIRECTORY.get(Number(teamID))?.name ?? "Club"} · ${entry.player.position} · OVR ${entry.player.overall}`,
          to: `/player/${encodeURIComponent(entry.player.id)}`
        });
      }
    }
  }

  const tierByTeam = new Map<number, number>();
  for (const [tier, league] of Object.entries(game.season.leagueStates)) {
    for (const t of league.teams) tierByTeam.set(t.ID, Number(tier));
  }

  const teams: SearchResult[] = [];
  for (const entry of TEAM_DIRECTORY.values()) {
    if (normalizeText(entry.name).includes(query)) {
      const tier = tierByTeam.get(entry.id);
      teams.push({
        kind: "team",
        key: `t-${entry.id}`,
        label: entry.name,
        sub: tier ? LEAGUE_NAMES[tier] : `European club · ${entry.countrycode}`,
        to: `/team/${entry.id}`
      });
    }
  }
  teams.sort((a, b) => {
    const aStarts = normalizeText(a.label).startsWith(query) ? 0 : 1;
    const bStarts = normalizeText(b.label).startsWith(query) ? 0 : 1;
    return aStarts - bStarts || a.label.localeCompare(b.label);
  });

  const nations: SearchResult[] = [];
  const rankOf = new Map(computeRankings(game.season.international).map(row => [row.code, row.rank]));
  for (const [name, info] of Object.entries(nationInfo)) {
    if (normalizeText(`${name} ${info.threeLetterCode}`).includes(query)) {
      nations.push({
        kind: "nation",
        key: `n-${info.threeLetterCode}`,
        label: name,
        sub: `National team · ${info.confederationID} · world rank #${rankOf.get(info.threeLetterCode) ?? "-"}`,
        to: `/nation/${info.threeLetterCode}`
      });
    }
  }
  nations.sort((a, b) => {
    const aStarts = normalizeText(a.label).startsWith(query) ? 0 : 1;
    const bStarts = normalizeText(b.label).startsWith(query) ? 0 : 1;
    return aStarts - bStarts || a.label.localeCompare(b.label);
  });

  const competitions: SearchResult[] = [];
  const all: { label: string; sub: string; to: string; extra: string }[] = [
    ...Object.entries(LEAGUE_NAMES).map(([tier, name]) => ({
      label: name, sub: `League · Tier ${tier}`, to: `/league/${tier}`, extra: `tier ${tier} league`
    })),
    { label: CUP_NAME, sub: "Domestic cup", to: "/cup", extra: "cup fa" },
    ...Object.entries(COMPETITION_NAMES).map(([code, name]) => ({
      label: name, sub: `European · ${code}`, to: `/europe/${code}`, extra: code.toLowerCase()
    })),
    ...getNationsLeagueConfederations().map(confederation => ({
      label: `${confederation} Nations League`,
      sub: `International · ${confederation}`,
      to: `/nations-league/${confederation}`,
      extra: `nations league ${confederation.toLowerCase()}`
    })),
    { label: "Gold Cup", sub: "International · CONCACAF", to: "/gold-cup", extra: "gold cup concacaf" },
    { label: "Gold Cup Playoff", sub: "International · CONCACAF", to: "/gold-cup-playoff", extra: "gold cup playoff qualifier" },
    { label: "Copa América", sub: "International · CONMEBOL", to: "/copa-america", extra: "copa america copa CONMEBOL" }
  ];
  for (const item of all) {
    if (normalizeText(`${item.label} ${item.extra}`).includes(query)) {
      competitions.push({ kind: "competition", key: `c-${item.to}`, label: item.label, sub: item.sub, to: item.to });
    }
  }

  return [
    ...competitions.slice(0, PER_KIND),
    ...nations.slice(0, PER_KIND),
    ...teams.slice(0, PER_KIND),
    ...players.slice(0, PER_KIND)
  ];
}
