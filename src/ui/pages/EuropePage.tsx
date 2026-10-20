import { useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useGame } from "../../store/gameStore";
import { getAllSeasonViews } from "../../engine/game";
import { COMPETITION_NAMES } from "../../engine/europeanCompetitions";
import { EUROPEAN_START_YEAR, seasonDisplay } from "../../engine/constants";
import { Empty, PageHeader, Panel, SeasonSelect, Tabs, TeamLink } from "../components/common";
import { EuroBracketTree } from "../components/brackets";
import { EuroTable, Legend, MatchLine } from "../components/tables";
import { formatScore } from "../format";
import type { EuroSnap } from "../../engine/snapshots";

type Tab = "league" | "knockout" | "history";

function LeaguePhaseFixtures(props: { comp: EuroSnap }) {
  const { comp } = props;
  const lastPlayed = comp.fixtures.reduce((last, day, index) => (day.matches.some(m => m.score) ? index : last), -1);
  const [index, setIndex] = useState(Math.max(0, lastPlayed));
  const day = comp.fixtures[Math.min(index, comp.fixtures.length - 1)];
  return (
    <Panel
      title={`League phase · matchday ${day.local} (global ${day.matchday})`}
      right={
        <span className="flex items-center gap-2">
          <button className="btn-ghost btn-sm" disabled={index <= 0} onClick={() => setIndex(index - 1)}>◂</button>
          <select className="input py-0.5 text-xs" value={index} onChange={e => setIndex(Number(e.target.value))}>
            {comp.fixtures.map((d, i) => <option key={d.matchday} value={i}>Matchday {d.local}</option>)}
          </select>
          <button className="btn-ghost btn-sm" disabled={index >= comp.fixtures.length - 1} onClick={() => setIndex(index + 1)}>▸</button>
        </span>
      }
    >
      {day.matches.map((match, i) => <MatchLine key={i} match={match} />)}
    </Panel>
  );
}

export default function EuropePage() {
  const game = useGame();
  const params = useParams();
  const code = String(params.code ?? "").toUpperCase();
  const [tab, setTab] = useState<Tab>("league");
  const [year, setYear] = useState(game.season.year);

  if (!COMPETITION_NAMES[code]) return <Navigate to="/" replace />;

  const views = getAllSeasonViews(game).filter(v => v.european?.[code]);
  const name = COMPETITION_NAMES[code];

  if (views.length === 0) {
    return (
      <div>
        <PageHeader title={name} />
        <Panel><Empty>European competitions begin in the {seasonDisplay(EUROPEAN_START_YEAR)} season.</Empty></Panel>
      </div>
    );
  }

  const view = views.find(v => v.year === year) ?? views[views.length - 1];
  const comp = view.european![code];
  const isCurrent = view.year === game.season.year;
  const managerID = game.managerTeam.ID;

  return (
    <div>
      <PageHeader
        title={name}
        subtitle={
          comp.complete
            ? `Season ${view.label} · Winners: ${comp.winner?.name}`
            : `Season ${view.label} · ${comp.phase === "LEAGUE PHASE" ? "League phase" : comp.phase}`
        }
        right={<SeasonSelect years={views.map(v => ({ year: v.year, label: v.label }))} value={view.year} onChange={setYear} />}
      />
      <Tabs
        tabs={[
          { id: "league", label: "League phase" },
          { id: "knockout", label: "Knockout bracket" },
          { id: "history", label: "History" }
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "league" && (
        <div className="space-y-6">
          <Panel title="League phase standings">
            <EuroTable rows={comp.table} zones highlightID={managerID} />
            <Legend items={[
              { zone: "ucl", label: "Direct to Round of 16 (1–8)" },
              { zone: "playoff", label: "Knockout round (9–24)" }
            ]} />
          </Panel>
          <LeaguePhaseFixtures key={`${view.year}-${code}`} comp={comp} />
        </div>
      )}

      {tab === "knockout" && (
        comp.knockout
          ? <EuroBracketTree rounds={comp.knockout} highlightID={managerID} />
          : (
            <Panel>
              <Empty>
                The knockout bracket is drawn once the league phase finishes{isCurrent ? ` (matchday ${game.season.europeanCompetitions?.[code].matchdays["GS 8"]})` : ""}.
                The top 24 teams advance; the top 8 receive byes into the Round of 16.
              </Empty>
            </Panel>
          )
      )}

      {tab === "history" && (
        <Panel title={`${name} history`}>
          {views.filter(v => v.european![code].complete).length === 0 ? <Empty>No completed seasons yet.</Empty> : (
            <table className="tbl">
              <thead><tr><th>Season</th><th>Winners</th><th>Runners-up</th><th>Final</th><th></th></tr></thead>
              <tbody>
                {[...views].reverse().filter(v => v.european![code].complete).map(v => {
                  const c = v.european![code];
                  const final = c.knockout![c.knockout!.length - 1].ties[0];
                  return (
                    <tr key={v.year}>
                      <td className="font-semibold">{v.label}</td>
                      <td>{c.winner && <TeamLink team={c.winner} />}</td>
                      <td>{c.runnerUp && <TeamLink team={c.runnerUp} />}</td>
                      <td className="text-navy-200">
                        {final.home?.name} {formatScore(final.legs[0]?.score ?? null)} {final.away?.name}
                      </td>
                      <td className="text-right">
                        <button className="btn-ghost btn-sm" onClick={() => { setYear(v.year); setTab("league"); }}>View season</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      )}
    </div>
  );
}
