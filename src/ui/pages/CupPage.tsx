import { useState } from "react";
import { useGame } from "../../store/gameStore";
import { getAllSeasonViews } from "../../engine/game";
import { CUP_NAME } from "../../engine/constants";
import { Empty, PageHeader, Panel, SeasonSelect, Tabs, TeamLink } from "../components/common";
import { CupBracketTree } from "../components/brackets";
import { MatchLine } from "../components/tables";
import { formatScore } from "../format";

type Tab = "bracket" | "rounds" | "history";

export default function CupPage() {
  const game = useGame();
  const [year, setYear] = useState(game.season.year);
  const [tab, setTab] = useState<Tab>("bracket");
  const [roundIndex, setRoundIndex] = useState<number | null>(null);

  const views = getAllSeasonViews(game);
  const view = views.find(v => v.year === year) ?? views[views.length - 1];
  const cup = view.cup;
  const isCurrent = view.year === game.season.year;

  // Default to the most recent round that has results (or the first round).
  const latest = cup.rounds.reduce((last, round, index) => (round.matches.some(m => m.score) ? index : last), 0);
  const activeRound = Math.min(roundIndex ?? latest, cup.rounds.length - 1);
  const round = cup.rounds[activeRound];

  return (
    <div>
      <PageHeader
        title={CUP_NAME}
        subtitle={
          cup.complete
            ? `Season ${view.label} · Winners: ${cup.winner?.name}`
            : `Season ${view.label} · ${cup.rounds.find(r => r.matches.some(m => !m.winner && !m.bye))?.label ?? "In progress"}`
        }
        right={
          <SeasonSelect years={views.map(v => ({ year: v.year, label: v.label }))} value={view.year} onChange={y => { setYear(y); setRoundIndex(null); }} />
        }
      />
      <Tabs
        tabs={[
          { id: "bracket", label: "Bracket" },
          { id: "rounds", label: "Rounds" },
          { id: "history", label: "History" }
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "bracket" && <CupBracketTree cup={cup} highlightID={game.managerTeam?.ID} showFlag={false} />}

      {tab === "rounds" && (
        <Panel
          title={`${round.label} · matchday ${round.matchday}`}
          right={
            <select className="input py-0.5 text-xs" value={activeRound} onChange={e => setRoundIndex(Number(e.target.value))}>
              {cup.rounds.map((r, i) => <option key={r.round} value={i}>{r.label}</option>)}
            </select>
          }
        >
          {round.matches.every(m => !m.home && !m.away) ? <Empty>This round has not been drawn yet.</Empty> : (
            <div className="max-h-[70vh] overflow-y-auto">
              {round.matches.map(match => {
                if (!match.home && !match.away) return null;
                if (match.bye) {
                  const team = (match.home ?? match.away)!;
                  return (
                    <div key={match.id} className="px-3 py-1.5 border-b border-navy-700/60 text-sm text-center">
                      <TeamLink team={team} /> <span className="text-navy-300">— bye</span>
                    </div>
                  );
                }
                return (
                  <MatchLine
                    key={match.id}
                    match={{ home: match.home!, away: match.away!, score: match.score }}
                  />
                );
              })}
            </div>
          )}
        </Panel>
      )}

      {tab === "history" && (
        <Panel title={`${CUP_NAME} history`}>
          {views.filter(v => v.cup.complete).length === 0 ? <Empty>No completed seasons yet.</Empty> : (
            <table className="tbl">
              <thead><tr><th>Season</th><th>Winners</th><th>Runners-up</th><th>Final</th><th></th></tr></thead>
              <tbody>
                {[...views].reverse().filter(v => v.cup.complete).map(v => {
                  const final = v.cup.rounds[v.cup.rounds.length - 1].matches[0];
                  return (
                    <tr key={v.year}>
                      <td className="font-semibold">{v.label}</td>
                      <td>{v.cup.winner && <TeamLink team={v.cup.winner} />}</td>
                      <td>{v.cup.runnerUp && <TeamLink team={v.cup.runnerUp} />}</td>
                      <td className="text-navy-200">{final.home?.name} {formatScore(final.score)} {final.away?.name}</td>
                      <td className="text-right">
                        <button className="btn-ghost btn-sm" onClick={() => { setYear(v.year); setRoundIndex(null); setTab("bracket"); }}>
                          View bracket
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {isCurrent && null}
        </Panel>
      )}
    </div>
  );
}
