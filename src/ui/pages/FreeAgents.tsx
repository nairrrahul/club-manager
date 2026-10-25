import { useState } from "react";
import { useGame, useGameStore } from "../../store/gameStore";
import { getFreeAgents } from "../../engine/game";
import { getNationName } from "../../engine/nations";
import { POSITION_ORDER } from "../../engine/formation";
import { seasonDisplay } from "../../engine/constants";
import { RESIGN_BLOCK_SEASONS } from "../../engine/freeAgents";
import {
  Empty, NationTag, OvrBadge, PageHeader, Panel, PlayerLink, PosBadge, ShortlistButton, SortTh, compareSortValues
} from "../components/common";
import type { SortState } from "../components/common";

type Key = "pos" | "name" | "age" | "ovr" | "pot" | "nat" | "sec" | "origin" | "status";
const DESC_FIRST: Key[] = ["ovr", "pot"];

export default function FreeAgents() {
  const game = useGame();
  const sign = useGameStore(s => s.signFreeAgent);
  const [sort, setSort] = useState<SortState>({ key: "ovr", dir: "desc" });

  const team = game.managerTeam;
  if (!team) return null;
  const squadFull = (team.seniorSquad?.length ?? 0) >= team.maxSeniorSquadSize;
  const agents = getFreeAgents(game);

  const rows = [...agents].sort((a, b) => {
    const value = (entry: typeof a): string | number | null => {
      const p = entry.player;
      switch (sort.key as Key) {
        case "pos": return POSITION_ORDER.indexOf(p.position);
        case "name": return `${p.firstName} ${p.lastName}`;
        case "age": return p.age;
        case "ovr": return p.overall;
        case "pot": return p.potential;
        case "nat": return getNationName(p.primaryNationality);
        case "sec": return p.secondaryNationality ? getNationName(p.secondaryNationality) : null;
        case "origin": return entry.releasedBy ?? "Unattached";
        case "status": return entry.blocked ? 1 : 0;
      }
    };
    return compareSortValues(value(a), value(b), sort.dir) || b.player.overall - a.player.overall;
  });

  const onSort = (key: string) => {
    if (sort.key === key) setSort({ key, dir: sort.dir === "asc" ? "desc" : "asc" });
    else setSort({ key, dir: DESC_FIRST.includes(key as Key) ? "desc" : "asc" });
  };
  const dir = (key: Key) => (sort.key === key ? sort.dir : null);

  return (
    <div>
      <PageHeader
        title="Free Agents"
        subtitle={`${agents.length} player${agents.length === 1 ? "" : "s"} without a club · Senior squad ${team.seniorSquad?.length ?? 0}/${team.maxSeniorSquadSize}`}
      />

      <p className="text-sm text-navy-300 mb-4 max-w-3xl">
        Free agents can be signed at any time, but any club in the game may sign them first. Players you release join this list and
        cannot be re-signed for {RESIGN_BLOCK_SEASONS} seasons. Free agents develop as if training at a 1-star facility, and a few new ones arrive at the start of every season.
      </p>

      <Panel title="Available players">
        {rows.length === 0 ? (
          <Empty>There are no free agents right now. New ones arrive at the start of each season.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="w-8"></th>
                  <SortTh label="Pos" sortKey="pos" dir={dir("pos")} onSort={onSort} />
                  <SortTh label="Name" sortKey="name" dir={dir("name")} onSort={onSort} />
                  <SortTh label="Age" sortKey="age" dir={dir("age")} onSort={onSort} className="num" />
                  <SortTh label="OVR" sortKey="ovr" dir={dir("ovr")} onSort={onSort} className="num" />
                  <SortTh label="POT" sortKey="pot" dir={dir("pot")} onSort={onSort} className="num" />
                  <SortTh label="Nationality" sortKey="nat" dir={dir("nat")} onSort={onSort} />
                  <SortTh label="Secondary" sortKey="sec" dir={dir("sec")} onSort={onSort} />
                  <SortTh label="Origin" sortKey="origin" dir={dir("origin")} onSort={onSort} />
                  <SortTh label="Status" sortKey="status" dir={dir("status")} onSort={onSort} />
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(entry => {
                  const player = entry.player;
                  const reason = entry.blocked
                    ? `Cannot be re-signed until ${seasonDisplay(entry.resignBlockedUntilYear as number)}`
                    : squadFull ? "Your senior squad is full" : "";
                  return (
                    <tr key={player.id}>
                      <td><ShortlistButton playerId={player.id} shortlisted={player.isShortlisted === true} /></td>
                      <td><PosBadge position={player.position} /></td>
                      <td><PlayerLink id={player.id} name={`${player.firstName} ${player.lastName}`} /></td>
                      <td className="num">{player.age}</td>
                      <td className="num"><OvrBadge value={player.overall} /></td>
                      <td className="num text-navy-200">{player.potential}</td>
                      <td><NationTag code={player.primaryNationality} /></td>
                      <td>{player.secondaryNationality ? <NationTag code={player.secondaryNationality} muted /> : <span className="text-navy-400">–</span>}</td>
                      <td className="text-xs text-navy-200">
                        {entry.releasedBy ? `Released by ${entry.releasedBy} (${seasonDisplay(entry.addedYear)})` : "Unattached"}
                      </td>
                      <td className="text-xs">
                        {entry.blocked
                          ? <span className="text-accent-yellow">Re-signable from {seasonDisplay(entry.resignBlockedUntilYear as number)}</span>
                          : <span className="text-navy-100">Available</span>}
                      </td>
                      <td className="text-right">
                        <button
                          className="btn-primary btn-sm"
                          disabled={entry.blocked || squadFull}
                          title={reason}
                          onClick={() => sign(player.id)}
                        >
                          Sign
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
