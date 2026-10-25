import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useGame, useGameStore } from "../../store/gameStore";
import { findPlayer, TEAM_DIRECTORY } from "../../engine/game";
import { POSITION_ORDER } from "../../engine/formation";
import { seasonDisplay } from "../../engine/constants";
import { buildHistoryRows } from "../../engine/playerHistory";
import type { HistoryRow } from "../../engine/playerHistory";
import type { ReactNode } from "react";
import { Empty, NationTag, OvrBadge, Panel, PosBadge, ShortlistButton, Stat, Tabs } from "../components/common";
import type { Player, Position, ProgressionEntry } from "../../engine/types";

type Tab = "overview" | "progression" | "history";

function ProgressionChart(props: { entries: ProgressionEntry[] }) {
  const { entries } = props;
  const width = 640;
  const height = 240;
  const pad = { left: 36, right: 16, top: 16, bottom: 28 };
  const values = entries.map(entry => entry.overall);
  const min = Math.max(0, Math.floor((Math.min(...values) - 5) / 5) * 5);
  const max = Math.min(100, Math.ceil((Math.max(...values) + 2) / 5) * 5);
  const x = (index: number) =>
    pad.left + (entries.length === 1 ? (width - pad.left - pad.right) / 2 : (index / (entries.length - 1)) * (width - pad.left - pad.right));
  const y = (value: number) => pad.top + (1 - (value - min) / (max - min || 1)) * (height - pad.top - pad.bottom);
  const ticks: number[] = [];
  for (let v = min; v <= max; v += 5) ticks.push(v);
  const overall = entries.map((entry, i) => `${x(i)},${y(entry.overall)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      {ticks.map(tick => (
        <g key={tick}>
          <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="#213a75" strokeWidth={1} />
          <text x={pad.left - 6} y={y(tick) + 3} textAnchor="end" fontSize={8} fill="#7d93c6">{tick}</text>
        </g>
      ))}
      <polyline points={overall} fill="none" stroke="#facc15" strokeWidth={2.5} />
      {entries.map((entry, i) => (
        <g key={entry.year}>
          <circle cx={x(i)} cy={y(entry.overall)} r={3.5} fill="#facc15" />
          {(entries.length <= 12 || i % 2 === 0 || i === entries.length - 1) && (
            <text x={x(i)} y={height - 8} textAnchor="middle" fontSize={8} fill="#aab9dc">{entry.year}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

function PositionChanger(props: { player: Player }) {
  const godPosition = useGameStore(s => s.godPosition);
  if (props.player.position === "GK") {
    return <p className="text-xs text-navy-300">Goalkeepers cannot have their position changed.</p>;
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-navy-200">Position</span>
      <select
        className="input"
        value={props.player.position}
        onChange={event => godPosition(props.player.id, event.target.value as Position)}
      >
        {POSITION_ORDER.filter(position => position !== "GK").map(position => (
          <option key={position} value={position}>{position}</option>
        ))}
      </select>
    </div>
  );
}

/** Human-readable span of a season the player spent with a team. */
function describePeriod(row: HistoryRow, currentYear: number): string {
  const startsAtBeginning = row.startMatchday === 0;
  if (startsAtBeginning && row.endMatchday === null) {
    return row.year === currentYear ? "Since the start of the season" : "Full season";
  }
  const from = startsAtBeginning ? "Start of season" : `Matchday ${row.startMatchday}`;
  const to = row.endMatchday === null
    ? (row.year === currentYear ? "present" : "end of season")
    : `matchday ${row.endMatchday}`;
  return `${from} – ${to}`;
}

export default function PlayerPage() {
  const game = useGame();
  const params = useParams();
  const [tab, setTab] = useState<Tab>("overview");
  const found = params.id ? findPlayer(game, params.id) : null;

  if (!found) {
    return (
      <Panel title="Player not found">
        <Empty>
          No player found with ID {params.id}. Unsigned scouting candidates expire when the next matchday is played.
        </Empty>
      </Panel>
    );
  }

  const { player, location } = found;
  const retired = location === "retired" || player.isRetired === true;
  const clubName = retired ? "Retired" : found.teamID !== null ? TEAM_DIRECTORY.get(found.teamID)?.name ?? "Unknown club" : null;
  const status = retired ? "Retired" :
    location === "senior" ? "Senior squad"
    : location === "youth" ? "Youth academy"
    : location === "free-agent"
      ? (found.freeAgent?.releasedBy ? `Released by ${found.freeAgent.releasedBy}` : "Unattached")
      : found.club?.source === "regen"
        ? `Joined ${seasonDisplay(found.club.signedYear)}`
        : `Signed from free agents (${seasonDisplay(found.club?.signedYear ?? 0)}, matchday ${found.club?.signedMatchday ?? 0})`;
  const progression = player.progression;
  const historyRows = buildHistoryRows(player, game.season.year);

  return (
    <div>
      <div className="panel p-6 mb-4 flex flex-wrap items-center gap-6">
        <OvrBadge value={player.overall} size="xl" />
        <div className="flex-1 min-w-[16rem]">
          <h1 className="text-3xl font-bold leading-tight flex items-center gap-3">
            {player.firstName} {player.lastName}
            {/* Players on the managed team cannot be shortlisted. */}
            {location !== "senior" && location !== "youth" && (
              <ShortlistButton playerId={player.id} shortlisted={player.isShortlisted === true} className="text-2xl" />
            )}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-navy-200">
            {retired
              ? <span className="text-accent-yellow font-semibold">Retired</span>
              : found.teamID !== null
              ? <Link to={`/team/${found.teamID}`} className="link text-accent-yellow font-semibold">{clubName}</Link>
              : <span className="text-accent-yellow font-semibold">Free agent</span>}
            <span>{status}</span>
            <PosBadge position={player.position} />
          </div>
          {!retired && player.retirementYear === game.season.year && (
            <p className="text-sm text-accent-yellow mb-4" role="status">
              This player is scheduled to retire at the end of {seasonDisplay(player.retirementYear)}.
            </p>
          )}
          <div className="mt-3 text-left">
            <div className="text-xl font-semibold">
              <NationTag code={player.primaryNationality} label="name" />
            </div>
            {player.secondaryNationality && (
              <div className="text-xs text-navy-300 mt-0.5">
                <NationTag code={player.secondaryNationality} label="name" muted />
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-6 text-center">
          <Stat label="Age" value={player.age} />
          <Stat label="Overall" value={player.overall} />
          <Stat label="Potential" value={<span className="text-accent-purple-light">{player.potential}</span>} />
          <Stat label="Caps" value={player.caps ?? 0} />
        </div>
      </div>

      <Tabs
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "progression", label: "Overall progression" },
          { id: "history", label: "Team history" }
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "overview" && (
        <div className="grid gap-6 md:grid-cols-2">
          <Panel title="Details">
            <dl className="divide-y divide-navy-700/60 text-sm">
              {([
                ["Club", retired ? "Retired" : clubName ?? "Free agent"],
                ["Position", player.position],
                ["Primary nationality", <NationTag key="n1" code={player.primaryNationality} label="name" />],
                ["Secondary nationality", player.secondaryNationality ? <NationTag key="n2" code={player.secondaryNationality} label="name" /> : "None"],
                ["Age", player.age],
                ["Overall", player.overall],
                ["Potential", player.potential],
                ["Contract expiry", player.contractExpiry ?? "–"],
                ["International caps", (
                  <span key="caps" className="inline-flex items-center gap-2">
                    {player.caps ?? 0}
                    <span className="text-xs text-navy-300 inline-flex items-center gap-1">
                      for <NationTag code={player.primaryNationality} label="name" muted />
                    </span>
                  </span>
                )],
                ["Scouted", player.isScouted ? "Yes" : "No"],
                ...(game.godMode && player.isScouted ? [["Player type", player.playerType ?? "NORMAL"]] : [])
              ] as [string, ReactNode][]).map(([label, value]) => (
                <div key={label} className="flex justify-between px-4 py-2">
                  <dt className="text-navy-300">{label}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          {game.godMode && (location === "senior" || location === "youth") && (
            <Panel title="God Mode">
              <div className="p-4"><PositionChanger player={player} /></div>
            </Panel>
          )}
        </div>
      )}

      {tab === "history" && (
        <Panel title="Team history">
          {historyRows.length === 0 ? (
            <Empty>No team history recorded yet.</Empty>
          ) : (
            <table className="tbl">
              <thead>
                <tr><th>Season</th><th>Team</th><th>Period</th></tr>
              </thead>
              <tbody>
                {historyRows.map((row, index) => (
                  <tr key={index}>
                    <td className="font-medium">{seasonDisplay(row.year)}</td>
                    <td>
                      {row.teamID !== null
                        ? <Link to={`/team/${row.teamID}`} className="link">{row.teamName}</Link>
                        : <span className="text-navy-200">{row.teamName}</span>}
                    </td>
                    <td className="text-navy-300 text-sm">{describePeriod(row, game.season.year)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}

      {tab === "progression" && (
        <div className="space-y-6">
          <Panel
            title="Overall by season"
          >
            <div className="p-4">
              {progression.length < 2 && (
                <p className="text-xs text-navy-300 mb-2">Progression is recorded each time a new season begins.</p>
              )}
              <ProgressionChart entries={progression} />
            </div>
          </Panel>
          <Panel title="Year by year">
            <table className="tbl">
              <thead>
                <tr><th>Season</th><th className="num">Age</th><th className="num">OVR</th><th className="num">Change</th><th className="num">POT</th></tr>
              </thead>
              <tbody>
                {[...progression].reverse().map((entry, reversedIndex) => {
                  const index = progression.length - 1 - reversedIndex;
                  const previous = index > 0 ? progression[index - 1] : null;
                  const delta = previous ? entry.overall - previous.overall : null;
                  return (
                    <tr key={entry.year}>
                      <td>{seasonDisplay(entry.year)}</td>
                      <td className="num">{entry.age}</td>
                      <td className="num font-semibold">{entry.overall}</td>
                      <td className={`num ${delta === null ? "text-navy-400" : delta > 0 ? "text-accent-yellow" : delta < 0 ? "text-navy-300" : ""}`}>
                        {delta === null ? "–" : delta > 0 ? `+${delta}` : delta}
                      </td>
                      <td className="num text-navy-200">{entry.potential}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        </div>
      )}
    </div>
  );
}
