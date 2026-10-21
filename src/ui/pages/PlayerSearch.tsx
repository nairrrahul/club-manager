import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getPlayerSearchPlayers } from "../../engine/game";
import { LEAGUE_NAMES } from "../../engine/constants";
import { getNationName, nationInfo } from "../../engine/nations";
import { useGame, useGameStore } from "../../store/gameStore";
import {
  Empty, NationTag, OvrBadge, PageHeader, Panel, PlayerLink, PosBadge, TeamLink
} from "../components/common";
import type { PlayerSearchEntry } from "../../engine/game";

interface SearchFilters {
  name: string;
  nationality: string;
  league: string;
  club: string;
  overallMin: string;
  overallMax: string;
  potentialMin: string;
  potentialMax: string;
  ageMin: string;
  ageMax: string;
}

const EMPTY_FILTERS: SearchFilters = {
  name: "",
  nationality: "",
  league: "",
  club: "",
  overallMin: "",
  overallMax: "",
  potentialMin: "",
  potentialMax: "",
  ageMin: "",
  ageMax: ""
};

const ROW_HEIGHT = 38;
const OVERSCAN = 8;
const VIRTUALIZE_AFTER = 100;

function withinRange(value: number, min: string, max: string): boolean {
  return (min === "" || value >= Number(min)) && (max === "" || value <= Number(max));
}

function clubFilterKey(entry: PlayerSearchEntry): string {
  return entry.clubID === null ? "free-agents" : String(entry.clubID);
}

export default function PlayerSearch() {
  const game = useGame();
  const tick = useGameStore(state => state.tick);
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(560);
  const scrollRef = useRef<HTMLDivElement>(null);

  const entries = useMemo(() => getPlayerSearchPlayers(game), [game, tick]);
  const leagueOptions = useMemo(() =>
    [...new Set(Object.values(game.season.leagueStates).map(league => league.tier))]
      .sort((a, b) => a - b),
  [game, tick]);
  const clubOptions = useMemo(() => {
    const options = new Map<string, { key: string; name: string }>();
    for (const entry of entries) {
      const key = clubFilterKey(entry);
      options.set(key, { key, name: entry.clubName });
    }
    return [...options.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);
  const nationalityOptions = useMemo(() =>
    Object.values(nationInfo)
      .map(nation => nation.threeLetterCode)
      .sort((a, b) => getNationName(a).localeCompare(getNationName(b))),
  []);

  const rows = useMemo(() => {
    const query = filters.name.trim().toLocaleLowerCase();
    return entries.filter(entry => {
      const { player, leagueTier } = entry;
      const fullName = `${player.firstName} ${player.lastName}`.toLocaleLowerCase();
      const reverseName = `${player.lastName} ${player.firstName}`.toLocaleLowerCase();
      const matchesName = !query || fullName.includes(query) || reverseName.includes(query);
      const matchesNationality = !filters.nationality ||
        player.primaryNationality === filters.nationality ||
        player.secondaryNationality === filters.nationality;
      const matchesLeague = !filters.league ||
        (filters.league === "other" ? leagueTier === null : leagueTier === Number(filters.league));
      const matchesClub = !filters.club || clubFilterKey(entry) === filters.club;
      return matchesName && matchesNationality && matchesLeague && matchesClub &&
        withinRange(player.overall, filters.overallMin, filters.overallMax) &&
        withinRange(player.potential, filters.potentialMin, filters.potentialMax) &&
        withinRange(player.age, filters.ageMin, filters.ageMax);
    }).sort((a, b) =>
      b.player.overall - a.player.overall ||
      b.player.potential - a.player.potential ||
      a.player.age - b.player.age ||
      `${a.player.firstName} ${a.player.lastName}`.localeCompare(
        `${b.player.firstName} ${b.player.lastName}`,
        undefined,
        { sensitivity: "base" }
      )
    );
  }, [entries, filters]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const resizeObserver = new ResizeObserver(() => setViewportHeight(element.clientHeight));
    resizeObserver.observe(element);
    setViewportHeight(element.clientHeight);
    return () => resizeObserver.disconnect();
  }, []);

  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [filterKey]);

  const updateFilter = (key: keyof SearchFilters, value: string) => {
    setFilters(current => ({ ...current, [key]: value }));
  };
  const virtualized = rows.length > VIRTUALIZE_AFTER;
  const firstRow = virtualized
    ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
    : 0;
  const visibleCount = virtualized
    ? Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2
    : rows.length;
  const visibleRows = rows.slice(firstRow, firstRow + visibleCount);
  const bottomRows = Math.max(0, rows.length - firstRow - visibleRows.length);

  return (
    <div>
      <PageHeader
        title="Player Search"
        subtitle={`${rows.length.toLocaleString()} of ${entries.length.toLocaleString()} players`}
      />

      <Panel title="Filters" right={
        <button className="btn-ghost btn-sm" onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</button>
      }>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 p-4">
          <label className="text-xs text-navy-300">
            Name
            <input
              className="input mt-1 w-full"
              type="search"
              placeholder="Search name"
              value={filters.name}
              onChange={event => updateFilter("name", event.target.value)}
            />
          </label>
          <label className="text-xs text-navy-300">
            Nationality
            <select className="input mt-1 w-full" value={filters.nationality} onChange={event => updateFilter("nationality", event.target.value)}>
              <option value="">All nationalities</option>
              {nationalityOptions.map(code => <option key={code} value={code}>{getNationName(code)}</option>)}
            </select>
          </label>
          <label className="text-xs text-navy-300">
            League
            <select className="input mt-1 w-full" value={filters.league} onChange={event => updateFilter("league", event.target.value)}>
              <option value="">All leagues</option>
              {leagueOptions.map(tier => <option key={tier} value={tier}>{LEAGUE_NAMES[tier] ?? `Tier ${tier}`}</option>)}
              <option value="other">Other / Free Agents</option>
            </select>
          </label>
          <label className="text-xs text-navy-300">
            Club
            <select className="input mt-1 w-full" value={filters.club} onChange={event => updateFilter("club", event.target.value)}>
              <option value="">All clubs</option>
              {clubOptions.map(option => <option key={option.key} value={option.key}>{option.name}</option>)}
            </select>
          </label>
          <RangeFilter label="Overall" min={filters.overallMin} max={filters.overallMax}
            onMinChange={value => updateFilter("overallMin", value)}
            onMaxChange={value => updateFilter("overallMax", value)} />
          <RangeFilter label="Potential" min={filters.potentialMin} max={filters.potentialMax}
            onMinChange={value => updateFilter("potentialMin", value)}
            onMaxChange={value => updateFilter("potentialMax", value)} />
          <RangeFilter label="Age" min={filters.ageMin} max={filters.ageMax}
            onMinChange={value => updateFilter("ageMin", value)}
            onMaxChange={value => updateFilter("ageMax", value)} />
        </div>
      </Panel>

      <Panel className="mt-6">
        {rows.length === 0 ? <Empty>No players match these filters.</Empty> : (
          <div
            ref={scrollRef}
            className="max-h-[70vh] min-h-[320px] overflow-auto"
            onScroll={event => setScrollTop(event.currentTarget.scrollTop)}
          >
            <table className="tbl min-w-[900px] border-collapse">
              <thead className="sticky top-0 z-10 bg-navy-800">
                <tr>
                  <th>Pos</th><th>Name</th><th className="num">Age</th><th className="num">OVR</th>
                  <th className="num">POT</th><th>Nationality</th><th>Secondary</th><th>Club</th><th>League</th>
                </tr>
              </thead>
              <tbody>
                {virtualized && firstRow > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={9} className="p-0 border-0" style={{ height: firstRow * ROW_HEIGHT, padding: 0, border: 0 }} />
                  </tr>
                )}
                {visibleRows.map(({ player, clubID, clubName, leagueTier }) => (
                  <tr key={player.id} style={virtualized ? { height: ROW_HEIGHT } : undefined}>
                    <td><PosBadge position={player.position} /></td>
                    <td><PlayerLink id={player.id} name={`${player.firstName} ${player.lastName}`} /></td>
                    <td className="num">{player.age}</td>
                    <td className="num"><OvrBadge value={Math.round(player.overall)} /></td>
                    <td className="num"><OvrBadge value={Math.round(player.potential)} /></td>
                    <td><NationTag code={player.primaryNationality} /></td>
                    <td><NationTag code={player.secondaryNationality} muted /></td>
                    <td>{clubID === null
                      ? <span className="text-navy-200">{clubName}</span>
                      : <TeamLink team={{ id: clubID, name: clubName }} />}
                    </td>
                    <td>{leagueTier === null
                      ? <span className="text-navy-400">–</span>
                      : <Link to={`/league/${leagueTier}`} className="link">{LEAGUE_NAMES[leagueTier] ?? `Tier ${leagueTier}`}</Link>}
                    </td>
                  </tr>
                ))}
                {virtualized && bottomRows > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={9} className="p-0 border-0" style={{ height: bottomRows * ROW_HEIGHT, padding: 0, border: 0 }} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function RangeFilter(props: {
  label: string;
  min: string;
  max: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
}) {
  return (
    <fieldset className="text-xs text-navy-300">
      <legend>{props.label}</legend>
      <div className="flex gap-2 mt-1">
        <input
          className="input min-w-0 w-full"
          type="number"
          aria-label={`${props.label} minimum`}
          placeholder="Min"
          value={props.min}
          onChange={event => props.onMinChange(event.target.value)}
        />
        <input
          className="input min-w-0 w-full"
          type="number"
          aria-label={`${props.label} maximum`}
          placeholder="Max"
          value={props.max}
          onChange={event => props.onMaxChange(event.target.value)}
        />
      </div>
    </fieldset>
  );
}
