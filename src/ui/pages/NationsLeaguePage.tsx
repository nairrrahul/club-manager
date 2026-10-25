import { useState } from "react";
import type { ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import {
  getNationsLeagueDivisionHistory, getNationsLeagueStandings, isNationsLeagueConfederation
} from "../../engine/nationsLeague";
import type { NationsLeagueEdition, NationsLeagueGroup } from "../../engine/nationsLeague";
import { seasonDisplay } from "../../engine/constants";
import { useGame } from "../../store/gameStore";
import { Empty, NationLink, PageHeader, Panel, Tabs } from "../components/common";

type Tab = "current" | "history" | "divisionHistory";

function GroupTable(props: {
  edition: NationsLeagueEdition;
  division: string;
  group: NationsLeagueGroup;
}) {
  const rows = getNationsLeagueStandings(props.edition, props.division, props.group);
  return (
    <Panel title={`Group ${props.group.name}`}>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th className="w-8 text-center">#</th>
              <th>Nation</th>
              <th className="num">P</th>
              <th className="num">W</th>
              <th className="num">D</th>
              <th className="num">L</th>
              <th className="num">GF</th>
              <th className="num">GA</th>
              <th className="num">GD</th>
              <th className="num">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.code}>
                <td className="text-center tabular-nums">{row.position}</td>
                <td><NationLink code={row.code} /></td>
                <td className="num">{row.played}</td>
                <td className="num">{row.won}</td>
                <td className="num">{row.drawn}</td>
                <td className="num">{row.lost}</td>
                <td className="num">{row.goalsFor}</td>
                <td className="num">{row.goalsAgainst}</td>
                <td className="num">{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                <td className="num font-bold">{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function EditionTables(props: { edition: NationsLeagueEdition }) {
  return (
    <div className="space-y-5">
      {Object.entries(props.edition.divisions).sort(([a], [b]) => a.localeCompare(b)).map(([division, groups]) => (
        <section key={division} className="space-y-3">
          <h3 className="text-lg font-semibold">League {division}</h3>
          <div className="grid gap-4 xl:grid-cols-2">
            {groups.map(group => (
              <GroupTable
                key={`${division}-${group.name}`}
                edition={props.edition}
                division={division}
                group={group}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function PromotionRelegationOverview(props: { edition: NationsLeagueEdition; right?: ReactNode }) {
  const divisions = Object.keys(props.edition.divisions).sort();
  return (
    <Panel title="Promotion and Relegation Overview" right={props.right}>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Division</th>
              <th>Promoted</th>
              <th>Relegated</th>
            </tr>
          </thead>
          <tbody>
            {divisions.map(division => (
              <tr key={division}>
                <td className="font-semibold">League {division}</td>
                <td>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {(props.edition.promoted[division] ?? []).map(code => <NationLink key={code} code={code} />)}
                    {(props.edition.promoted[division] ?? []).length === 0 && <span className="text-navy-400">—</span>}
                  </div>
                </td>
                <td>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {(props.edition.relegated[division] ?? []).map(code => <NationLink key={code} code={code} />)}
                    {(props.edition.relegated[division] ?? []).length === 0 && <span className="text-navy-400">—</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function DivisionBadge(props: { division: string }) {
  const tones: Record<string, string> = {
    A: "bg-yellow-400 text-black",
    B: "bg-purple-700 text-white",
    C: "bg-purple-300 text-black",
    D: "bg-gray-500 text-white"
  };
  return (
    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-sm text-xs font-bold ${tones[props.division] ?? "bg-navy-500 text-white"}`}>
      {props.division}
    </span>
  );
}

function DivisionHistory(props: { editions: NationsLeagueEdition[] }) {
  const { editions, rows } = getNationsLeagueDivisionHistory(props.editions);
  if (rows.length === 0) {
    return <Panel><Empty>No completed edition is available for division history yet.</Empty></Panel>;
  }
  const rankColumnWidth = 56;
  const nationColumnWidth = 220;
  const editionColumnWidth = 96;
  const tableWidth = rankColumnWidth + nationColumnWidth + editions.length * editionColumnWidth;

  return (
    <Panel title="Division history">
      <div className="w-full overflow-x-auto">
        <table className="tbl division-history-table table-fixed" style={{ width: tableWidth }}>
          <colgroup>
            <col style={{ width: rankColumnWidth }} />
            <col style={{ width: nationColumnWidth }} />
            {editions.map(edition => <col key={edition.id} style={{ width: editionColumnWidth }} />)}
          </colgroup>
          <thead>
            <tr>
              <th
                className="division-history-sticky sticky left-0 z-20 bg-navy-800 text-center"
                style={{ textAlign: "center" }}
              >
                Rank
              </th>
              <th
                className="division-history-sticky sticky z-20 bg-navy-800"
                style={{ left: rankColumnWidth }}
              >
                Nation
              </th>
              {editions.map(edition => (
                <th key={edition.id} className="text-center whitespace-nowrap" style={{ textAlign: "center" }}>
                  {seasonDisplay(edition.year)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.code}>
                <td className="division-history-sticky sticky left-0 z-10 bg-navy-800 text-center tabular-nums">
                  {row.aggregateRank}
                </td>
                <td
                  className="division-history-sticky sticky z-10 bg-navy-800"
                  style={{ left: rankColumnWidth }}
                >
                  <NationLink code={row.code} />
                </td>
                {editions.map(edition => (
                  <td key={edition.id} className="text-center" style={{ textAlign: "center" }}>
                    <div className="flex w-full justify-center">
                      {row.divisions[edition.id]
                        ? <DivisionBadge division={row.divisions[edition.id]} />
                        : "—"}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export default function NationsLeaguePage() {
  const game = useGame();
  const { confederation: rawConfederation } = useParams();
  const confederation = String(rawConfederation ?? "").toUpperCase();
  const [tab, setTab] = useState<Tab>("current");
  const [historyEditionId, setHistoryEditionId] = useState<string | null>(null);
  if (!isNationsLeagueConfederation(confederation)) return <Navigate to="/international" replace />;

  const editions = game.season.international.nationsLeague.editions
    .filter(edition => edition.confederation === confederation)
    .sort((a, b) => b.startWindowIndex - a.startWindowIndex);
  const current = editions[0] ?? null;
  const history = editions.filter(edition => edition.status === "complete");
  const historyEdition = history.find(edition => edition.id === historyEditionId) ?? history[0] ?? null;
  const historyIndex = historyEdition ? history.findIndex(edition => edition.id === historyEdition.id) : -1;

  return (
    <div>
      <PageHeader
        title={`${confederation} Nations League`}
        subtitle="Home-and-away group stage played during designated international windows"
      />
      <Tabs
        tabs={[
          { id: "current", label: "Current league standings" },
          { id: "history", label: "History" },
          { id: "divisionHistory", label: "Division History" }
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "current" && (
        current ? (
          <div className="space-y-4">
            <Panel
              title={seasonDisplay(current.year)}
              right={<span className="capitalize">{current.status}</span>}
            >
              {current.status === "scheduled" && (
                <p className="px-3 py-2 text-sm text-navy-300">
                  The groups have been drawn. The league stage begins in its first assigned Nations League window.
                </p>
              )}
              {current.status === "active" && (
                <p className="px-3 py-2 text-sm text-navy-300">League standings update as each international window is simulated.</p>
              )}
              {current.status === "complete" && (
                <p className="px-3 py-2 text-sm text-navy-300">The league stage is complete. Promotion and relegation have been applied for the next edition.</p>
              )}
            </Panel>
            <EditionTables edition={current} />
          </div>
        ) : (
          <Panel>
            <Empty>
              No {confederation} Nations League edition has been drawn yet. Groups are drawn during the international window immediately before the competition begins.
            </Empty>
          </Panel>
        )
      )}

      {tab === "history" && (
        history.length === 0 ? (
          <Panel><Empty>No completed Nations League editions yet.</Empty></Panel>
        ) : (
          historyEdition && (
            <div className="space-y-4">
              <PromotionRelegationOverview
                edition={historyEdition}
                right={
                  <span className="inline-flex items-center gap-2">
                    <button
                      className="btn-ghost btn-sm"
                      aria-label="Older edition"
                      disabled={historyIndex >= history.length - 1}
                      onClick={() => setHistoryEditionId(history[historyIndex + 1]?.id ?? null)}
                    >
                      ‹
                    </button>
                    <button
                      className="btn-ghost btn-sm"
                      aria-label="Newer edition"
                      disabled={historyIndex <= 0}
                      onClick={() => setHistoryEditionId(history[historyIndex - 1]?.id ?? null)}
                    >
                      ›
                    </button>
                    <span>{seasonDisplay(historyEdition.year)}</span>
                    <span>Completed</span>
                  </span>
                }
              />
              <EditionTables edition={historyEdition} />
            </div>
          )
        )
      )}

      {tab === "divisionHistory" && (
        <DivisionHistory editions={editions} />
      )}
    </div>
  );
}
