import { useState } from "react";
import { useGame } from "../../store/gameStore";
import { getWorldRankings } from "../../engine/game";
import { REGIONS, getConfederation } from "../../engine/nations";
import { Empty, NationLink, OvrBadge, PageHeader, Panel, Tabs } from "../components/common";

type Tab = "world" | "overall";

export default function Rankings() {
  const game = useGame();
  const [tab, setTab] = useState<Tab>("world");
  const [confederation, setConfederation] = useState("ALL");
  const { points, overall } = getWorldRankings(game);

  const matches = (code: string) => confederation === "ALL" || getConfederation(code) === confederation;
  const pointRows = points.filter(row => matches(row.code));
  const overallRows = overall.filter(row => matches(row.code));

  return (
    <div>
      <PageHeader
        title="World Rankings"
        subtitle={`${pointRows.length} nation${pointRows.length === 1 ? "" : "s"}${confederation === "ALL" ? "" : ` in ${confederation}`}`}
        right={
          <label className="flex items-center gap-2 text-sm text-navy-200">
            Confederation
            <select className="input" value={confederation} onChange={event => setConfederation(event.target.value)}>
              <option value="ALL">All confederations</option>
              {REGIONS.map(region => <option key={region.id} value={region.id}>{region.id}</option>)}
            </select>
          </label>
        }
      />
      <Tabs
        tabs={[{ id: "world", label: "World rankings" }, { id: "overall", label: "Squad overall" }]}
        value={tab}
        onChange={setTab}
      />

      {tab === "world" && (
        <Panel>
          {pointRows.length === 0 ? <Empty>No nations.</Empty> : (
            <div className="overflow-x-auto max-h-[75vh] overflow-y-auto">
              <table className="tbl">
                <thead>
                  <tr><th className="w-14 text-center">Rank</th><th>Country</th><th>Confederation</th><th>Points</th></tr>
                </thead>
                <tbody>
                  {pointRows.map(row => (
                    <tr key={row.code}>
                      <td className="text-center tabular-nums">{row.rank}</td>
                      <td><NationLink code={row.code} /></td>
                      <td className="text-navy-200">{getConfederation(row.code)}</td>
                      <td className="tabular-nums">{row.points.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {tab === "overall" && (
        <Panel>
          {overallRows.length === 0 ? <Empty>No nations.</Empty> : (
            <div className="overflow-x-auto max-h-[75vh] overflow-y-auto">
              <table className="tbl">
                <thead>
                  <tr><th className="w-14 text-center">#</th><th>Country</th><th>Confederation</th><th>Overall</th></tr>
                </thead>
                <tbody>
                  {overallRows.map(row => (
                    <tr key={row.code}>
                      <td className="text-center tabular-nums">{row.rank}</td>
                      <td><NationLink code={row.code} /></td>
                      <td className="text-navy-200">{getConfederation(row.code)}</td>
                      <td><OvrBadge value={Math.round(row.overall)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
