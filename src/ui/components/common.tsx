import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useGameStore } from "../../store/gameStore";
import { getConfederation, getNationName } from "../../engine/nations";
import { FlagIcon } from "./FlagIcon";
import { POSITION_GROUP } from "../format";
import type { Position } from "../../engine/types";
import type { TeamRef } from "../../engine/snapshots";

export function Panel(props: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`panel overflow-hidden ${props.className ?? ""}`}>
      {(props.title || props.right) && (
        <div className="panel-title flex items-center justify-between gap-2">
          <span>{props.title}</span>
          <span className="normal-case tracking-normal font-normal">{props.right}</span>
        </div>
      )}
      <div className={props.bodyClassName ?? ""}>{props.children}</div>
    </section>
  );
}

export function Tabs<T extends string>(props: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-navy-700 mb-4 overflow-x-auto">
      {props.tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => props.onChange(tab.id)}
          className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
            props.value === tab.id
              ? "border-accent-yellow text-white"
              : "border-transparent text-navy-300 hover:text-white"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader(props: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div>
        <h1 className="text-2xl font-bold">{props.title}</h1>
        {props.subtitle && <div className="text-sm text-navy-300 mt-0.5">{props.subtitle}</div>}
      </div>
      {props.right}
    </div>
  );
}

export function TeamLink(props: { team: TeamRef | { id: number; name: string }; className?: string; plain?: boolean }) {
  const managerID = useGameStore.getState().game?.managerTeam?.ID;
  const mine = props.team.id === managerID;
  return (
    <Link
      to={`/team/${props.team.id}`}
      className={`link ${mine ? "text-accent-yellow font-semibold" : ""} ${props.className ?? ""}`}
    >
      {props.team.name}
    </Link>
  );
}

export function PlayerLink(props: { id: string; name: string; className?: string }) {
  return (
    <Link to={`/player/${encodeURIComponent(props.id)}`} className={`link ${props.className ?? ""}`}>
      {props.name}
    </Link>
  );
}

export function OvrBadge(props: { value: number; size?: "sm" | "lg" | "xl" }) {
  const v = props.value;
  // <=50 red, 51-60 orange, 61-70 yellow, 71-80 light green, 81-90 green, 91+ dark green
  const tone =
    v >= 91 ? "bg-green-900 text-white"
    : v >= 81 ? "bg-green-600 text-white"
    : v >= 71 ? "bg-green-400 text-black"
    : v >= 61 ? "bg-yellow-400 text-black"
    : v >= 51 ? "bg-orange-500 text-white"
    : "bg-red-600 text-white";
  const size =
    props.size === "xl" ? "w-20 h-20 text-4xl rounded-xl"
    : props.size === "lg" ? "w-12 h-12 text-xl rounded-lg"
    : "w-8 h-6 text-xs rounded";
  return (
    <span className={`inline-flex items-center justify-center font-bold tabular-nums ${tone} ${size}`}>
      {v}
    </span>
  );
}

export function PosBadge(props: { position: Position }) {
  const group = POSITION_GROUP[props.position];
  const tone =
    group === "GK" ? "bg-accent-yellow/20 text-accent-yellow"
    : group === "DEF" ? "bg-navy-500/60 text-white"
    : group === "MID" ? "bg-accent-purple/30 text-accent-purple-light"
    : "bg-white/15 text-white";
  return (
    <span className={`inline-block min-w-[2.5rem] text-center text-[11px] font-bold rounded px-1.5 py-0.5 ${tone}`}>
      {props.position}
    </span>
  );
}

/**
 * Flag followed by the country (three-letter code by default, or the full name with
 * label="name"), linking to that country's page. Text size is inherited, and the flag scales
 * to it. `muted` is used for secondary nationalities; `noLink` renders it as plain text.
 */
export function NationTag(props: { code: string | null; muted?: boolean; label?: "code" | "name"; noLink?: boolean }) {
  if (!props.code) return <span className="text-navy-400">–</span>;
  const className = `inline-flex items-center gap-[0.4em] whitespace-nowrap ${props.muted ? "text-navy-300" : ""}`;
  const content = (
    <>
      <FlagIcon code={props.code} />
      <span>{props.label === "name" ? getNationName(props.code) : props.code}</span>
    </>
  );
  if (props.noLink || !getConfederation(props.code)) {
    return <span title={getNationName(props.code)} className={className}>{content}</span>;
  }
  return (
    <Link to={`/nation/${props.code}`} title={getNationName(props.code)} className={`${className} link`}>
      {content}
    </Link>
  );
}

export function Modal(props: { title: string; onClose?: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4">
      <div className={`panel w-full ${props.wide ? "max-w-3xl" : "max-w-lg"} max-h-[85vh] flex flex-col shadow-xl`}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-navy-700">
          <h2 className="font-semibold">{props.title}</h2>
          {props.onClose && (
            <button onClick={props.onClose} className="text-navy-300 hover:text-white text-xl leading-none">×</button>
          )}
        </div>
        <div className="p-5 overflow-y-auto">{props.children}</div>
      </div>
    </div>
  );
}

export function Empty(props: { children: ReactNode }) {
  return <div className="px-4 py-8 text-center text-sm text-navy-300">{props.children}</div>;
}

export function Stat(props: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-navy-300">{props.label}</div>
      <div className="text-lg font-semibold leading-tight">{props.value}</div>
      {props.sub && <div className="text-xs text-navy-300">{props.sub}</div>}
    </div>
  );
}

export function SeasonSelect(props: { years: { year: number; label: string }[]; value: number; onChange: (year: number) => void }) {
  const ordered = [...props.years].sort((a, b) => a.year - b.year);
  const index = ordered.findIndex(item => item.year === props.value);
  return (
    <div className="flex items-center gap-2 text-sm text-navy-200">
      Season
      <button
        className="btn-ghost btn-sm"
        aria-label="Previous season"
        disabled={index <= 0}
        onClick={() => props.onChange(ordered[index - 1].year)}
      >
        ◂
      </button>
      <select
        className="input"
        value={props.value}
        onChange={event => props.onChange(Number(event.target.value))}
      >
        {[...ordered].reverse().map(item => (
          <option key={item.year} value={item.year}>{item.label}</option>
        ))}
      </select>
      <button
        className="btn-ghost btn-sm"
        aria-label="Next season"
        disabled={index < 0 || index >= ordered.length - 1}
        onClick={() => props.onChange(ordered[index + 1].year)}
      >
        ▸
      </button>
    </div>
  );
}

export function ConfirmDialog(props: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={props.title} onClose={props.onCancel}>
      <div className="text-sm text-navy-100">{props.message}</div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={props.onCancel}>Cancel</button>
        <button className="btn-yellow" onClick={props.onConfirm}>{props.confirmLabel ?? "Confirm"}</button>
      </div>
    </Modal>
  );
}

export function RatingDots(props: { value: number; max?: number }) {
  const max = props.max ?? 5;
  return (
    <span className="inline-flex gap-1 align-middle">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`w-3 h-3 rounded-full ${i < props.value ? "bg-accent-yellow" : "bg-navy-600"}`} />
      ))}
    </span>
  );
}

export interface SortState {
  key: string;
  dir: "asc" | "desc";
}

/** Clickable, sortable table header. `dir` is the active direction for this column (null = not sorted by it). */
export function SortTh(props: {
  label: string;
  sortKey: string;
  dir: "asc" | "desc" | null;
  onSort: (key: string) => void;
  className?: string;
}) {
  return (
    <th
      className={`${props.className ?? ""} cursor-pointer select-none hover:text-white ${props.dir ? "text-white" : ""}`}
      onClick={() => props.onSort(props.sortKey)}
      title={`Sort by ${props.label}`}
    >
      {props.label}
      <span className="ml-1 text-accent-yellow">{props.dir === "asc" ? "▲" : props.dir === "desc" ? "▼" : ""}</span>
    </th>
  );
}

/** Compares two values, always placing missing values (null) last regardless of direction. */
export function compareSortValues(a: string | number | null, b: string | number | null, dir: "asc" | "desc"): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const result = typeof a === "string" || typeof b === "string"
    ? String(a).localeCompare(String(b))
    : a - b;
  return dir === "asc" ? result : -result;
}

/** Flag + country name linking to the nation's page. */
export function NationLink(props: { code: string; className?: string }) {
  return (
    <Link
      to={`/nation/${props.code}`}
      className={`link inline-flex items-center gap-[0.4em] whitespace-nowrap ${props.className ?? ""}`}
    >
      <FlagIcon code={props.code} />
      <span>{getNationName(props.code)}</span>
    </Link>
  );
}

/** Small plane icon (international duty). Sized in em so it follows the surrounding text. */
export function PlaneIcon(props: { title?: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`inline-block align-[-0.15em] ${props.className ?? ""}`}
      style={{ width: "1.1em", height: "1.1em" }}
      role="img"
      aria-label={props.title ?? "On international duty"}
    >
      <title>{props.title ?? "On international duty"}</title>
      <path fill="currentColor" d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
    </svg>
  );
}

/** Door-and-arrow icon for a player scheduled to retire at season end. */
export function RetirementIcon(props: { title?: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`inline-block align-[-0.15em] ${props.className ?? ""}`}
      style={{ width: "1.1em", height: "1.1em" }}
      role="img"
      aria-label={props.title ?? "Retiring at the end of the season"}
    >
      <title>{props.title ?? "Retiring at the end of the season"}</title>
      <path fill="currentColor" d="M13 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8v-2H5V5h8v4h2V5a2 2 0 0 0-2-2Zm5.59 8L16 8.41 14.59 9.83 16.76 12h-7.17v2h7.17l-2.17 2.17L16 17.59 20.59 13 18.59 11Z" />
    </svg>
  );
}

/** Flag icon button to add/remove a player from the shortlist (filled = shortlisted). */
export function ShortlistButton(props: { playerId: string; shortlisted: boolean; className?: string }) {
  const toggle = useGameStore(state => state.toggleShortlist);
  return (
    <button
      type="button"
      onClick={() => toggle(props.playerId)}
      title={props.shortlisted ? "Remove from shortlist" : "Add to shortlist"}
      aria-label={props.shortlisted ? "Remove from shortlist" : "Add to shortlist"}
      aria-pressed={props.shortlisted}
      className={`inline-flex items-center justify-center align-middle ${
        props.shortlisted ? "text-accent-yellow" : "text-navy-300 hover:text-white"
      } ${props.className ?? ""}`}
    >
      <svg viewBox="0 0 24 24" style={{ width: "1.25em", height: "1.25em" }} fill={props.shortlisted ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round">
        <path d="M5 21V4" />
        <path d="M5 4h13l-3 4.5L18 13H5" />
      </svg>
    </button>
  );
}
