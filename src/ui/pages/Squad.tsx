import { useState } from "react";
import { useGame, useGameStore } from "../../store/gameStore";
import { FORMATIONS, POSITION_ORDER, canPlayPosition, getFormationLayoutSlots, getFormationRequirements } from "../../engine/formation";
import { calculateFormationOverall, getStartingXISlots } from "../../engine/playerSquad";
import { ConfirmDialog, Empty, NationTag, OvrBadge, PageHeader, Panel, PlaneIcon, PlayerLink, PosBadge, SortTh, Tabs, compareSortValues } from "../components/common";
import type { SortState } from "../components/common";
import { getNationName } from "../../engine/nations";
import { getPlayerInternationalDuty } from "../../engine/game";
import type { Player } from "../../engine/types";

type Tab = "squad" | "tactics";

type SquadSortKey = "pos" | "name" | "age" | "ovr" | "pot" | "nat" | "sec" | "contract" | "xi";

/** Keys that sort high-to-low on the first click. */
const DESC_FIRST: SquadSortKey[] = ["ovr", "pot", "xi"];

function SquadTable() {
  const game = useGame();
  const release = useGameStore(s => s.releaseSenior);
  const team = game.managerTeam;
  const [pendingRelease, setPendingRelease] = useState<Player | null>(null);
  // null = the default squad view (by position, then rating).
  const [sort, setSort] = useState<SortState | null>(null);
  const inXI = new Set(getStartingXISlots(team).filter(Boolean).map(player => (player as Player).id));

  const fullName = (player: Player) => `${player.firstName} ${player.lastName}`;
  const defaultOrder = (a: Player, b: Player) =>
    POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position) ||
    b.overall - a.overall ||
    fullName(a).localeCompare(fullName(b));

  const sorted = [...(team.seniorSquad ?? [])].sort((a, b) => {
    if (!sort) return defaultOrder(a, b);
    const key = sort.key as SquadSortKey;
    const values = (player: Player): string | number | null => {
      switch (key) {
        case "pos": return POSITION_ORDER.indexOf(player.position);
        case "name": return fullName(player);
        case "age": return player.age;
        case "ovr": return player.overall;
        case "pot": return player.potential;
        case "nat": return getNationName(player.primaryNationality);
        case "sec": return player.secondaryNationality ? getNationName(player.secondaryNationality) : null;
        case "contract": return player.contractExpiry;
        case "xi": return inXI.has(player.id) ? 1 : 0;
      }
    };
    return compareSortValues(values(a), values(b), sort.dir) || defaultOrder(a, b);
  });

  const onSort = (key: string) => {
    if (key === "pos") {
      // Sorting by position IS the default view; clicking again reverses the position order.
      setSort(sort === null ? { key: "pos", dir: "desc" } : null);
      return;
    }
    if (sort?.key === key) {
      setSort({ key, dir: sort.dir === "asc" ? "desc" : "asc" });
    } else {
      setSort({ key, dir: DESC_FIRST.includes(key as SquadSortKey) ? "desc" : "asc" });
    }
  };
  const dirFor = (key: SquadSortKey): "asc" | "desc" | null => {
    if (key === "pos") return sort === null ? "asc" : sort.key === "pos" ? sort.dir : null;
    return sort?.key === key ? sort.dir : null;
  };

  return (
    <Panel
      title={`Senior squad (${sorted.length}/${team.maxSeniorSquadSize})`}
      right={
        <span className="flex items-center gap-3 text-navy-300">
          {sort === null
            ? <span className="text-xs">Default view</span>
            : <button className="btn-ghost btn-sm" onClick={() => setSort(null)}>Reset to default view</button>}
          <span>Team OVR <b className="text-white">{team.BaseOverall}</b></span>
        </span>
      }
    >
      {sorted.length === 0 ? <Empty>Your squad is empty.</Empty> : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <SortTh label="Pos" sortKey="pos" dir={dirFor("pos")} onSort={onSort} />
                <SortTh label="Name" sortKey="name" dir={dirFor("name")} onSort={onSort} />
                <SortTh label="Age" sortKey="age" dir={dirFor("age")} onSort={onSort} className="num" />
                <SortTh label="OVR" sortKey="ovr" dir={dirFor("ovr")} onSort={onSort} className="num" />
                <SortTh label="POT" sortKey="pot" dir={dirFor("pot")} onSort={onSort} className="num" />
                <SortTh label="Nationality" sortKey="nat" dir={dirFor("nat")} onSort={onSort} />
                <SortTh label="Secondary" sortKey="sec" dir={dirFor("sec")} onSort={onSort} />
                <SortTh label="Contract" sortKey="contract" dir={dirFor("contract")} onSort={onSort} className="num" />
                <SortTh label="XI" sortKey="xi" dir={dirFor("xi")} onSort={onSort} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(player => {
                // Only shown during a manually simulated international break.
                const duty = getPlayerInternationalDuty(game, player.id);
                return (
                <tr key={player.id} className={duty ? "bg-red-500/10" : ""}>
                  <td><PosBadge position={player.position} /></td>
                  <td>
                    {duty && <PlaneIcon className="text-red-300 mr-1.5" title={`On international duty with ${getNationName(duty)}`} />}
                    <PlayerLink id={player.id} name={fullName(player)} />
                  </td>
                  <td className="num">{player.age}</td>
                  <td className="num"><OvrBadge value={player.overall} /></td>
                  <td className="num text-navy-200">{player.potential}</td>
                  <td><NationTag code={player.primaryNationality} /></td>
                  <td>{player.secondaryNationality ? <NationTag code={player.secondaryNationality} muted /> : <span className="text-navy-400">–</span>}</td>
                  <td className="num text-navy-300">{player.contractExpiry ?? "–"}</td>
                  <td>{inXI.has(player.id) && <span className="inline-block w-2.5 h-2.5 rounded-full bg-accent-yellow" title="In starting XI" />}</td>
                  <td className="text-right">
                    <button className="btn-danger btn-sm" onClick={() => setPendingRelease(player)}>
                      Release
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {pendingRelease && (
        <ConfirmDialog
          title="Release player"
          confirmLabel="Release"
          message={
            <>
              Release <b>{pendingRelease.firstName} {pendingRelease.lastName}</b> ({pendingRelease.position}, {pendingRelease.overall} OVR) from the senior squad?
              They will join the free agents, and you won't be able to re-sign them for 2 seasons. Other clubs may sign them in the meantime.
            </>
          }
          onCancel={() => setPendingRelease(null)}
          onConfirm={() => { release(pendingRelease.id); setPendingRelease(null); }}
        />
      )}
    </Panel>
  );
}

function Pitch(props: {
  formation: string;
  slots: (Player | null)[];
  selected: number | null;
  editable: boolean;
  onSelect: (slot: number) => void;
}) {
  const requirements = getFormationRequirements(props.formation);
  const rows = getFormationLayoutSlots(props.formation);
  return (
    <div className="relative bg-navy-900 border-2 border-navy-500 rounded-xl px-3 py-6 min-h-[34rem] flex flex-col justify-around">
      {/* Pitch markings */}
      <div className="absolute inset-x-0 top-1/2 border-t-2 border-navy-600 pointer-events-none" />
      <div className="absolute left-1/2 top-1/2 w-24 h-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-navy-600 pointer-events-none" />
      <div className="absolute left-1/2 top-0 w-48 h-16 -translate-x-1/2 border-2 border-t-0 border-navy-600 pointer-events-none" />
      <div className="absolute left-1/2 bottom-0 w-48 h-16 -translate-x-1/2 border-2 border-b-0 border-navy-600 pointer-events-none" />
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="relative flex justify-around items-start">
          {row.map(slotIndex => {
            const player = props.slots[slotIndex];
            const selected = props.selected === slotIndex;
            return (
              <button
                key={slotIndex}
                disabled={!props.editable}
                onClick={() => props.onSelect(slotIndex)}
                className={`flex flex-col items-center w-24 group ${props.editable ? "cursor-pointer" : "cursor-default"}`}
              >
                <span className={`rounded-full ${selected ? "ring-4 ring-accent-yellow" : props.editable ? "group-hover:ring-2 ring-accent-purple" : ""}`}>
                  {player ? <OvrBadge value={player.overall} size="lg" /> : (
                    <span className="inline-flex w-12 h-12 items-center justify-center rounded-lg bg-navy-700 text-navy-300 text-xl">?</span>
                  )}
                </span>
                <span className="mt-1 text-[11px] font-semibold leading-tight text-center truncate w-full">
                  {player ? player.lastName : "Empty"}
                </span>
                <span className="text-[10px] text-navy-300">
                  {requirements[slotIndex]}{player && player.position !== requirements[slotIndex] ? ` (${player.position})` : ""}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Tactics() {
  const game = useGame();
  const setFormation = useGameStore(s => s.formation);
  const setMode = useGameStore(s => s.xiMode);
  const setSlot = useGameStore(s => s.xiSlot);
  const team = game.managerTeam;
  const [selected, setSelected] = useState<number | null>(null);

  const slots = getStartingXISlots(team);
  const requirements = getFormationRequirements(team.formation);
  const manual = team.xiMode === "manual";
  const inXI = new Map<string, number>();
  slots.forEach((player, index) => { if (player) inXI.set(player.id, index); });

  const squad = team.seniorSquad ?? [];
  const bench = squad
    .filter(player => !inXI.has(player.id))
    .sort((a, b) => POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position) || b.overall - a.overall);

  const candidates = selected === null ? [] : squad
    .filter(player => canPlayPosition(player.position, requirements[selected]))
    .sort((a, b) => b.overall - a.overall);

  const complete = slots.every(Boolean);
  const xiAverage = complete ? Math.round(slots.reduce((sum, p) => sum + (p as Player).overall, 0) / 11) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        <Panel title="Selection mode">
          <div className="p-4 flex flex-wrap items-center gap-4">
            <div className="flex rounded-md overflow-hidden border border-navy-600">
              <button
                className={`px-4 py-1.5 text-sm font-medium ${!manual ? "bg-accent-purple text-white" : "bg-navy-900 text-navy-200 hover:text-white"}`}
                onClick={() => { setMode("auto"); setSelected(null); }}
              >
                Auto (by rating)
              </button>
              <button
                className={`px-4 py-1.5 text-sm font-medium ${manual ? "bg-accent-purple text-white" : "bg-navy-900 text-navy-200 hover:text-white"}`}
                onClick={() => setMode("manual")}
              >
                Manual
              </button>
            </div>
            <div className="text-sm text-navy-200">
              Team OVR <b className="text-white text-base">{team.BaseOverall}</b>
              {xiAverage !== null && <span className="text-navy-300"> · XI average {xiAverage}</span>}
            </div>
            <div className="text-xs text-navy-300 w-full">
              {manual
                ? "Select a position on the pitch, then choose a player. Players can only fill slots their position can cover. The XI is re-selected automatically at the start of each season."
                : "The best available XI is picked automatically from player ratings, and updates whenever your squad changes."}
            </div>
          </div>
        </Panel>

        <Panel title="Formation">
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.keys(FORMATIONS).map(formation => {
              const preview = calculateFormationOverall(team, formation);
              const active = team.formation === formation;
              return (
                <button
                  key={formation}
                  disabled={preview === null || active}
                  onClick={() => { setFormation(formation); setSelected(null); }}
                  className={`rounded-md border px-3 py-2 text-left transition-colors ${
                    active ? "bg-accent-purple border-accent-purple-light"
                    : preview === null ? "bg-navy-900 border-navy-700 opacity-50 cursor-not-allowed"
                    : "bg-navy-900 border-navy-600 hover:border-accent-purple"
                  }`}
                >
                  <div className="font-semibold">{formation}</div>
                  <div className="text-xs text-navy-200">{preview === null ? "Unavailable" : `Best XI OVR ${preview}`}</div>
                </button>
              );
            })}
          </div>
        </Panel>

        <Pitch
          formation={team.formation}
          slots={slots}
          selected={selected}
          editable={manual}
          onSelect={slot => setSelected(selected === slot ? null : slot)}
        />
        {!complete && (
          <p className="text-sm text-accent-yellow">
            Your squad cannot currently fill every slot for {team.formation}. Add or retrain players, or choose another formation.
          </p>
        )}
      </div>

      <div className="space-y-4">
        {manual && selected !== null ? (
          <Panel title={`Choose ${requirements[selected]}`} right={<button className="text-xs text-accent-purple-light" onClick={() => setSelected(null)}>Close</button>}>
            <div className="max-h-[36rem] overflow-y-auto">
              {candidates.length === 0 && <Empty>No players can cover this position.</Empty>}
              {candidates.map(player => {
                const slotOfPlayer = inXI.get(player.id);
                const current = slots[selected]?.id === player.id;
                return (
                  <button
                    key={player.id}
                    disabled={current}
                    onClick={() => { const result = setSlot(selected, player.id); if (result.ok) setSelected(null); }}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left border-b border-navy-700/60 ${current ? "bg-accent-purple/25" : "hover:bg-navy-700"}`}
                  >
                    <OvrBadge value={player.overall} />
                    <span className="flex-1 truncate text-sm">{player.firstName} {player.lastName}</span>
                    <PosBadge position={player.position} />
                    <span className="text-[10px] w-14 text-right text-navy-300">
                      {current ? "Selected" : slotOfPlayer !== undefined ? "Swap" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </Panel>
        ) : (
          <Panel title={`Substitutes & reserves (${bench.length})`}>
            <div className="max-h-[44rem] overflow-y-auto">
              {bench.length === 0 && <Empty>Everyone is in the starting XI.</Empty>}
              {bench.map(player => (
                <div key={player.id} className="flex items-center gap-3 px-3 py-1.5 border-b border-navy-700/60 text-sm">
                  <OvrBadge value={player.overall} />
                  <span className="flex-1 truncate"><PlayerLink id={player.id} name={`${player.firstName} ${player.lastName}`} /></span>
                  <PosBadge position={player.position} />
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

export default function Squad() {
  const game = useGame();
  const [tab, setTab] = useState<Tab>("squad");
  return (
    <div>
      <PageHeader title="Squad" subtitle={`${game.managerTeam.Team} · ${game.managerTeam.formation}`} />
      <Tabs
        tabs={[{ id: "squad", label: "Squad" }, { id: "tactics", label: "Formation & Starting XI" }]}
        value={tab}
        onChange={setTab}
      />
      {tab === "squad" ? <SquadTable /> : <Tactics />}
    </div>
  );
}
