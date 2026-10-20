import type { ReactNode } from "react";
import { NationTag, TeamLink } from "./common";
import type { EuroRow, LeagueRow, MatchSnap, ScoreSnap } from "../../engine/snapshots";
import { formatScore } from "../format";

/** Left-edge colour marker for a table row. */
function zoneClass(zone: string | null): string {
  switch (zone) {
    case "ucl": return "border-l-4 border-l-accent-yellow";
    case "uel": return "border-l-4 border-l-accent-purple";
    case "uecl": return "border-l-4 border-l-accent-purple-light";
    case "up": return "border-l-4 border-l-accent-yellow";
    case "playoff": return "border-l-4 border-l-accent-purple";
    case "down": return "border-l-4 border-l-white/60";
    default: return "border-l-4 border-l-transparent";
  }
}

/** Subtle row tint matching the zone's marker colour. */
function zoneBg(zone: string | null): string {
  switch (zone) {
    case "ucl": return "bg-accent-yellow/10";
    case "uel": return "bg-accent-purple/15";
    case "uecl": return "bg-accent-purple-light/10";
    case "up": return "bg-accent-yellow/10";
    case "playoff": return "bg-accent-purple/15";
    case "down": return "bg-white/10";
    default: return "";
  }
}

/** The managed club's row: a lighter blue than the table background. */
const MANAGED_ROW = "bg-navy-600";

export interface LeagueZones {
  [position: number]: string;
}

export function LeagueTable(props: {
  rows: LeagueRow[];
  zones?: LeagueZones;
  limit?: number;
  highlightID?: number;
  compact?: boolean;
  showStatus?: boolean;
}) {
  const rows = props.limit ? props.rows.slice(0, props.limit) : props.rows;
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th className="w-8 text-center">#</th>
            <th>Team</th>
            <th className="num">P</th>
            {!props.compact && <th className="num">W</th>}
            {!props.compact && <th className="num">D</th>}
            {!props.compact && <th className="num">L</th>}
            {!props.compact && <th className="num">GF</th>}
            {!props.compact && <th className="num">GA</th>}
            <th className="num">GD</th>
            <th className="num">Pts</th>
            {props.showStatus && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.team.id} className={props.highlightID === row.team.id ? MANAGED_ROW : zoneBg(props.zones?.[row.pos] ?? null)}>
              <td className={`${zoneClass(props.zones?.[row.pos] ?? null)} text-center tabular-nums`}>{row.pos}</td>
              <td><TeamLink team={row.team} /></td>
              <td className="num">{row.GP}</td>
              {!props.compact && <td className="num">{row.W}</td>}
              {!props.compact && <td className="num">{row.D}</td>}
              {!props.compact && <td className="num">{row.L}</td>}
              {!props.compact && <td className="num">{row.GF}</td>}
              {!props.compact && <td className="num">{row.GA}</td>}
              <td className="num">{row.GD > 0 ? `+${row.GD}` : row.GD}</td>
              <td className="num font-bold">{row.PTS}</td>
              {props.showStatus && (
                <td className="text-xs">
                  {row.status === "PROMOTED" && <span className="text-accent-yellow font-semibold">Promoted</span>}
                  {row.status === "RELEGATED" && <span className="text-navy-300">Relegated</span>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EuroTable(props: {
  rows: EuroRow[];
  limit?: number;
  highlightID?: number;
  compact?: boolean;
  /** Show the knockout qualification zones (top 8 bye, 9–24 knockout round). */
  zones?: boolean;
}) {
  const rows = props.limit ? props.rows.slice(0, props.limit) : props.rows;
  const zone = (pos: number) =>
    !props.zones ? null : pos <= 8 ? "ucl" : pos <= 24 ? "playoff" : null;
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th className="w-8 text-center">#</th>
            <th>Team</th>
            <th>Ctry</th>
            <th className="num">P</th>
            {!props.compact && <th className="num">W</th>}
            {!props.compact && <th className="num">D</th>}
            {!props.compact && <th className="num">L</th>}
            {!props.compact && <th className="num">GF</th>}
            {!props.compact && <th className="num">GA</th>}
            <th className="num">GD</th>
            <th className="num">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.team.id} className={props.highlightID === row.team.id ? MANAGED_ROW : zoneBg(zone(row.pos))}>
              <td className={`${zoneClass(zone(row.pos))} text-center tabular-nums`}>{row.pos}</td>
              <td><TeamLink team={row.team} /></td>
              <td className="text-xs"><NationTag code={row.countrycode} muted /></td>
              <td className="num">{row.GP}</td>
              {!props.compact && <td className="num">{row.W}</td>}
              {!props.compact && <td className="num">{row.D}</td>}
              {!props.compact && <td className="num">{row.L}</td>}
              {!props.compact && <td className="num">{row.GF}</td>}
              {!props.compact && <td className="num">{row.GA}</td>}
              <td className="num">{row.GD > 0 ? `+${row.GD}` : row.GD}</td>
              <td className="num font-bold">{row.PTS}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MatchLine(props: { match: MatchSnap }) {
  const { match } = props;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-3 py-1.5 border-b border-navy-700/60 text-sm">
      <div className="text-right truncate"><TeamLink team={match.home} /></div>
      <div className="min-w-[4.5rem] text-center font-bold tabular-nums bg-navy-900 rounded px-2 py-0.5">
        {formatScore(match.score)}
      </div>
      <div className="truncate"><TeamLink team={match.away} /></div>
    </div>
  );
}

export function Legend(props: { items: { zone: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2 text-xs text-navy-300">
      {props.items.map(item => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span className={`inline-block h-3 ${zoneClass(item.zone)}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function ScoreChip(props: { score: ScoreSnap | null; children?: ReactNode }) {
  return <span className="font-bold tabular-nums">{formatScore(props.score)}{props.children}</span>;
}
