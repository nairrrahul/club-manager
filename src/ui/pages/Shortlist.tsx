import { useState } from "react";
import { useGame, useGameStore } from "../../store/gameStore";
import { getRetiredShortlistedPlayers, getShortlistedPlayers } from "../../engine/game";
import type { ShortlistEntry } from "../../engine/game";
import { getNationName } from "../../engine/nations";
import { POSITION_ORDER } from "../../engine/formation";
import { seasonDisplay } from "../../engine/constants";
import {
  Empty, NationTag, OvrBadge, PageHeader, Panel, PlayerLink, PosBadge, ShortlistButton, SortTh, TeamLink,
  Tabs, compareSortValues
} from "../components/common";
import type { SortState } from "../components/common";

type Key = "pos" | "name" | "age" | "ovr" | "pot" | "nat" | "sec" | "club" | "status";
type ListTab = "active" | "retired";
const DESC_FIRST: Key[] = ["ovr", "pot"];

export default function Shortlist() {
  const game = useGame();
  const sign = useGameStore(s => s.signFreeAgent);
  const [sort, setSort] = useState<SortState>({ key: "ovr", dir: "desc" });
  const [tab, setTab] = useState<ListTab>("active");

  const team = game.managerTeam;
  const squadFull = (team.seniorSquad?.length ?? 0) >= team.maxSeniorSquadSize;
  const entries = getShortlistedPlayers(game);
  const retiredEntries = getRetiredShortlistedPlayers(game);

  const rows = [...(tab === "active" ? entries : retiredEntries)].sort((a, b) => {
    const value = (entry: ShortlistEntry): string | number | null => {
      const p = entry.player;
      switch (sort.key as Key) {
        case "pos": return POSITION_ORDER.indexOf(p.position);
        case "name": return `${p.firstName} ${p.lastName}`;
        case "age": return p.age;
        case "ovr": return p.overall;
        case "pot": return p.potential;
        case "nat": return getNationName(p.primaryNationality);
        case "sec": return p.secondaryNationality ? getNationName(p.secondaryNationality) : null;
        case "club": return entry.clubName;
        case "status": return entry.freeAgent ? (entry.freeAgent.blocked ? 1 : 0) : 2;
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
        title="Shortlist"
        subtitle={`${entries.length} active · ${retiredEntries.length} retired`}
      />
      <p className="text-sm text-navy-300 mb-4 max-w-3xl">
        Use the flag icon next to a player to add or remove them from your shortlist. Players on your own team cannot be shortlisted,
        and a shortlisted player is removed from the list when you sign them.
      </p>

      <Tabs
        tabs={[
          { id: "active", label: `Active (${entries.length})` },
          { id: "retired", label: `Retired (${retiredEntries.length})` }
        ]}
        value={tab}
        onChange={setTab}
      />
      <Panel title={tab === "active" ? "Active shortlisted players" : "Retired shortlisted players"}>
        {rows.length === 0 ? (
          <Empty>{tab === "active"
            ? "Your active shortlist is empty. Click the flag icon on a free agent, a club's player or a nation's player to add them."
            : "No retired players are on your shortlist."}</Empty>
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
                  <SortTh label="Club" sortKey="club" dir={dir("club")} onSort={onSort} />
                  <SortTh label="Status" sortKey="status" dir={dir("status")} onSort={onSort} />
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(entry => {
                  const player = entry.player;
                  const agent = entry.freeAgent;
                  const reason = agent?.blocked
                    ? `Cannot be re-signed until ${seasonDisplay(agent.resignBlockedUntilYear as number)}`
                    : squadFull ? "Your senior squad is full" : "";
                  return (
                    <tr key={player.id}>
                      <td><ShortlistButton playerId={player.id} shortlisted /></td>
                      <td><PosBadge position={player.position} /></td>
                      <td><PlayerLink id={player.id} name={`${player.firstName} ${player.lastName}`} /></td>
                      <td className="num">{player.age}</td>
                      <td className="num"><OvrBadge value={player.overall} /></td>
                      <td className="num text-navy-200">{player.potential}</td>
                      <td><NationTag code={player.primaryNationality} /></td>
                      <td>{player.secondaryNationality ? <NationTag code={player.secondaryNationality} muted /> : <span className="text-navy-400">–</span>}</td>
                      <td className="text-sm">
                        {entry.retired
                          ? <span className="text-navy-200">Retired</span>
                          : entry.clubID !== null
                          ? <TeamLink team={{ id: entry.clubID, name: entry.clubName }} />
                          : <span className="text-navy-200">Free Agents</span>}
                      </td>
                      <td className="text-xs">
                        {entry.retired
                          ? <span className="text-navy-300">Retired</span>
                          : agent
                          ? agent.blocked
                            ? <span className="text-accent-yellow">Re-signable from {seasonDisplay(agent.resignBlockedUntilYear as number)}</span>
                            : <span className="text-navy-100">Available</span>
                          : <span className="text-navy-400">Under contract</span>}
                      </td>
                      <td className="text-right">
                        {agent && (
                          <button
                            className="btn-primary btn-sm"
                            disabled={agent.blocked || squadFull}
                            title={reason}
                            onClick={() => sign(player.id)}
                          >
                            Sign
                          </button>
                        )}
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
