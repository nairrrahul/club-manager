import { useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useGame } from "../../store/gameStore";
import { getAllSeasonViews } from "../../engine/game";
import { LEAGUE_NAMES } from "../../engine/constants";
import { tier_information } from "../../engine/promotionRelegation";
import { Empty, PageHeader, Panel, SeasonSelect, Tabs, TeamLink } from "../components/common";
import { Legend, LeagueTable, MatchLine } from "../components/tables";
import type { LeagueZones } from "../components/tables";
import type { LeagueSnap, SeasonArchive } from "../../engine/snapshots";

type Tab = "table" | "prediction" | "fixtures" | "playoffs" | "history";

function buildZones(tier: number): { zones: LeagueZones; legend: { zone: string; label: string }[] } {
  const info = tier_information[String(tier)] as Record<string, number[]>;
  const zones: LeagueZones = {};
  const legend: { zone: string; label: string }[] = [];
  const fill = (positions: number[] | undefined, zone: string, label: string) => {
    if (!positions) return;
    for (let p = positions[0]; p <= positions[positions.length - 1]; p++) zones[p] = zone;
    legend.push({ zone, label });
  };
  if (tier === 1) {
    fill(info.CHAMPIONSLEAGUE, "ucl", "Champions League");
    fill(info.EUROPALEAGUE, "uel", "Europa League");
    fill(info.CONFERENCELEAGUE, "uecl", "Conference League");
  } else {
    fill(info.UP, "up", "Promotion");
    fill(info.PLAYOFF, "playoff", "Promotion play-offs");
  }
  fill(info.DOWN, "down", "Relegation");
  return { zones, legend };
}

function Prediction(props: { league: LeagueSnap; highlightID: number }) {
  return (
    <Panel title="Pre-season prediction">
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead><tr><th className="w-8 text-center">#</th><th>Team</th></tr></thead>
          <tbody>
            {props.league.prediction.map((team, index) => (
              <tr key={team.id} className={team.id === props.highlightID ? "bg-navy-600" : ""}>
                <td className="text-center tabular-nums border-l-4 border-l-transparent">{index + 1}</td>
                <td><TeamLink team={team} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Playoffs(props: { league: LeagueSnap }) {
  const { playoffs, playoffFixtures } = props.league;
  if (!playoffs && playoffFixtures) {
    return (
      <Panel title="Promotion play-offs">
        <div className="px-3 pt-3 pb-1 text-xs uppercase tracking-wider text-navy-300">Semi-finals</div>
        <MatchLine match={{ ...playoffFixtures.semiOne, score: null }} />
        <MatchLine match={{ ...playoffFixtures.semiTwo, score: null }} />
        <div className="px-3 pt-4 pb-1 text-xs uppercase tracking-wider text-navy-300">Final</div>
        <div className="px-4 py-2 text-sm text-navy-300">Winners of the semi-finals — to be played.</div>
        <p className="px-4 py-3 text-xs text-navy-300">
          The regular season is over. Use "Play promotion play-offs" in the top bar to simulate these matches.
        </p>
      </Panel>
    );
  }
  if (!playoffs) {
    return (
      <Panel title="Promotion play-offs">
        <Empty>The play-offs take place after the final matchday, once the regular season is over.</Empty>
      </Panel>
    );
  }
  return (
    <Panel title="Promotion play-offs">
      <div className="px-3 pt-3 pb-1 text-xs uppercase tracking-wider text-navy-300">Semi-finals</div>
      <MatchLine match={playoffs.semiOne} />
      <MatchLine match={playoffs.semiTwo} />
      <div className="px-3 pt-4 pb-1 text-xs uppercase tracking-wider text-navy-300">Final</div>
      <MatchLine match={playoffs.final} />
      <div className="px-4 py-3 text-sm">
        Promoted via play-offs: <TeamLink team={playoffs.winner} className="font-semibold" />
      </div>
    </Panel>
  );
}

function Fixtures(props: { league: LeagueSnap }) {
  const { league } = props;
  const lastPlayed = league.fixtures.reduce((last, day, index) => (day.matches.some(m => m.score) ? index : last), -1);
  const [index, setIndex] = useState(Math.max(0, lastPlayed));
  const day = league.fixtures[Math.min(index, league.fixtures.length - 1)];
  if (!day) return <Empty>No fixtures.</Empty>;
  return (
    <Panel
      title={`Matchday ${day.local} · global matchday ${day.matchday}`}
      right={
        <span className="flex items-center gap-2">
          <button className="btn-ghost btn-sm" disabled={index <= 0} onClick={() => setIndex(index - 1)}>◂</button>
          <select className="input py-0.5 text-xs" value={index} onChange={e => setIndex(Number(e.target.value))}>
            {league.fixtures.map((d, i) => <option key={d.local} value={i}>Matchday {d.local}</option>)}
          </select>
          <button className="btn-ghost btn-sm" disabled={index >= league.fixtures.length - 1} onClick={() => setIndex(index + 1)}>▸</button>
        </span>
      }
    >
      {day.matches.map((match, i) => <MatchLine key={i} match={match} />)}
    </Panel>
  );
}

function History(props: { tier: number; archives: SeasonArchive[]; onPick: (year: number) => void }) {
  const rows = [...props.archives].reverse();
  return (
    <Panel title={`${LEAGUE_NAMES[props.tier]} history`}>
      {rows.length === 0 ? <Empty>No completed seasons yet.</Empty> : (
        <table className="tbl">
          <thead><tr><th>Season</th><th>Champions</th><th>Runners-up</th><th>Third</th>{props.tier > 1 && <th>Play-off winner</th>}<th></th></tr></thead>
          <tbody>
            {rows.map(arch => {
              const league = arch.leagues[props.tier];
              return (
                <tr key={arch.year}>
                  <td className="font-semibold">{arch.label}</td>
                  <td><TeamLink team={league.rows[0].team} /></td>
                  <td><TeamLink team={league.rows[1].team} /></td>
                  <td><TeamLink team={league.rows[2].team} /></td>
                  {props.tier > 1 && <td>{league.playoffs ? <TeamLink team={league.playoffs.winner} /> : "–"}</td>}
                  <td className="text-right">
                    <button className="btn-ghost btn-sm" onClick={() => props.onPick(arch.year)}>View season</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

export default function LeaguePage() {
  const game = useGame();
  const params = useParams();
  const tier = Number(params.tier);
  const [year, setYear] = useState(game.season.year);
  const [tab, setTab] = useState<Tab>("table");

  const views = getAllSeasonViews(game);
  const view = views.find(v => v.year === year) ?? views[views.length - 1];
  const zoneInfo = useMemo(() => (LEAGUE_NAMES[tier] ? buildZones(tier) : null), [tier]);

  if (!LEAGUE_NAMES[tier] || !zoneInfo) return <Navigate to="/" replace />;

  const league = view.leagues[tier];
  const isCurrent = view.year === game.season.year;
  const tabs: { id: Tab; label: string }[] = [
    { id: "table", label: "Table" },
    { id: "prediction", label: "Season prediction" },
    { id: "fixtures", label: "Fixtures & results" },
    ...(tier > 1 ? [{ id: "playoffs" as Tab, label: "Play-offs" }] : []),
    { id: "history", label: "History" }
  ];

  return (
    <div>
      <PageHeader
        title={LEAGUE_NAMES[tier]}
        subtitle={isCurrent ? `Season ${view.label} · matchday ${game.season.matchday}/46` : `Season ${view.label} · final standings`}
        right={
          <SeasonSelect
            years={views.map(v => ({ year: v.year, label: v.label }))}
            value={view.year}
            onChange={setYear}
          />
        }
      />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "table" && (
        <Panel>
          <LeagueTable
            rows={league.rows}
            zones={zoneInfo.zones}
            highlightID={game.managerTeam.ID}
            showStatus={!isCurrent}
          />
          <Legend items={zoneInfo.legend} />
          {tier === 1 && isCurrent && (
            <p className="px-4 pb-3 text-xs text-navy-300">European places shown are for the following season.</p>
          )}
        </Panel>
      )}
      {tab === "prediction" && <Prediction league={league} highlightID={game.managerTeam.ID} />}
      {tab === "fixtures" && <Fixtures key={`${view.year}-${tier}`} league={league} />}
      {tab === "playoffs" && tier > 1 && <Playoffs league={league} />}
      {tab === "history" && (
        <History
          tier={tier}
          archives={views.filter(v => v.leagues[tier].complete)}
          onPick={picked => { setYear(picked); setTab("table"); }}
        />
      )}
    </div>
  );
}
