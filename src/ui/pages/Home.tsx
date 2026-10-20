import { Link } from "react-router-dom";
import { useGame } from "../../store/gameStore";
import { getLiveSnapshot } from "../../engine/game";
import { LEAGUE_NAMES, EUROPEAN_START_YEAR, seasonDisplay } from "../../engine/constants";
import { COMPETITION_NAMES } from "../../engine/europeanCompetitions";
import { Empty, OvrBadge, Panel, PageHeader, PlayerLink, PosBadge, Stat, TeamLink } from "../components/common";
import { EuroTable, LeagueTable } from "../components/tables";
import { ordinal, formatScore } from "../format";
import type { EuroSnap, LeagueRow } from "../../engine/snapshots";

function LeagueCard(props: { tier: number; rows: LeagueRow[]; managerID: number }) {
  const top = props.rows.slice(0, 5);
  const mine = props.rows.find(row => row.team.id === props.managerID);
  const display = mine && mine.pos > 5 ? [...top, mine] : top;
  return (
    <Panel
      title={<Link to={`/league/${props.tier}`} className="hover:text-accent-yellow">{LEAGUE_NAMES[props.tier]}</Link>}
      right={<Link to={`/league/${props.tier}`} className="text-xs text-accent-purple-light hover:underline">Full table</Link>}
    >
      <LeagueTable rows={display} compact highlightID={props.managerID} />
    </Panel>
  );
}

function EuropeCard(props: { code: string; comp: EuroSnap | null; managerID: number; year: number }) {
  const name = COMPETITION_NAMES[props.code];
  const header = <Link to={`/europe/${props.code}`} className="hover:text-accent-yellow">{name}</Link>;
  const link = <Link to={`/europe/${props.code}`} className="text-xs text-accent-purple-light hover:underline">Details</Link>;

  if (!props.comp) {
    return (
      <Panel title={header}>
        <Empty>European competitions begin in {seasonDisplay(EUROPEAN_START_YEAR)}.</Empty>
      </Panel>
    );
  }

  const { comp } = props;
  const involved = comp.table.some(row => row.team.id === props.managerID);
  const phaseLabel = comp.complete ? "Complete" : comp.phase === "LEAGUE PHASE" ? "League phase" : comp.phase;

  if (!comp.knockout) {
    const top = comp.table.slice(0, 5);
    const mine = comp.table.find(row => row.team.id === props.managerID);
    const rows = mine && mine.pos > 5 ? [...top, mine] : top;
    return (
      <Panel title={header} right={link}>
        <div className="px-4 py-2 text-xs text-navy-300 flex justify-between">
          <span>{phaseLabel}</span>
          {involved && <span className="text-accent-yellow font-semibold">Your club is competing</span>}
        </div>
        <EuroTable rows={rows} compact highlightID={props.managerID} />
      </Panel>
    );
  }

  const round = comp.knockout.find(r => r.label === comp.phase) ?? comp.knockout[comp.knockout.length - 1];
  const ties = round.ties.filter(tie => !tie.bye);
  return (
    <Panel title={header} right={link}>
      <div className="px-4 py-2 text-xs text-navy-300 flex justify-between">
        <span>{comp.complete ? `Final · Winner: ${comp.winner?.name ?? "-"}` : round.label}</span>
        {involved && <span className="text-accent-yellow font-semibold">Your club is in this competition</span>}
      </div>
      <div className="max-h-64 overflow-y-auto">
        {ties.length === 0 && <Empty>No ties yet.</Empty>}
        {ties.map(tie => (
          <div key={tie.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-1.5 border-b border-navy-700/60 text-xs">
            <div className="text-right truncate">{tie.home ? <TeamLink team={tie.home} /> : "TBD"}</div>
            <div className="min-w-[3.5rem] text-center font-bold tabular-nums bg-navy-900 rounded px-1.5 py-0.5">
              {tie.aggregate
                ? `${tie.aggregate.h}-${tie.aggregate.a}`
                : tie.legs.length === 1
                  ? formatScore(tie.legs[0].score).replace(/ \(.*\)/, "")
                  : "v"}
            </div>
            <div className="truncate">{tie.away ? <TeamLink team={tie.away} /> : "TBD"}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export default function Home() {
  const game = useGame();
  const snap = getLiveSnapshot(game);
  const team = game.managerTeam;
  const managerID = team.ID;

  const topSenior = [...(team.seniorSquad ?? [])].sort((a, b) => b.overall - a.overall || b.potential - a.potential).slice(0, 6);
  const topYouth = [...(team.youthAcademySquad ?? [])].sort((a, b) => b.potential - a.potential || b.overall - a.overall).slice(0, 6);

  let tier = 0;
  let position = 0;
  for (const league of Object.values(snap.leagues)) {
    const row = league.rows.find(r => r.team.id === managerID);
    if (row) { tier = league.tier; position = row.pos; }
  }

  return (
    <div>
      <PageHeader
        title="Home"
        subtitle={`${team.Team} · Season ${seasonDisplay(game.season.year)}`}
      />

      <div className="panel p-4 mb-6 grid grid-cols-2 md:grid-cols-5 gap-4">
        <Stat label="League" value={LEAGUE_NAMES[tier]} sub={`${ordinal(position)} place`} />
        <Stat label="Team OVR" value={team.BaseOverall} sub={team.Overall !== team.BaseOverall ? `Form: ${team.Overall}` : "In form"} />
        <Stat label="Formation" value={team.formation} sub={team.xiMode === "auto" ? "Auto XI" : "Manual XI"} />
        <Stat label="Senior squad" value={`${team.seniorSquad?.length ?? 0}/${team.maxSeniorSquadSize}`} />
        <Stat label="Academy" value={`${team.youthAcademySquad?.length ?? 0}/${team.maxYouthAcademySquadSize}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-6">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-navy-300 mb-2">League standings</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2, 3, 4, 5].map(t => (
                <LeagueCard key={t} tier={t} rows={snap.leagues[t].rows} managerID={managerID} />
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-navy-300 mb-2">European competitions</h2>
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {["UCL", "UEL", "UECL"].map(code => (
                <EuropeCard key={code} code={code} comp={snap.european?.[code] ?? null} managerID={managerID} year={game.season.year} />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <Panel title="Best players — senior squad" right={<Link to="/squad" className="text-xs text-accent-purple-light hover:underline">Squad</Link>}>
            <table className="tbl">
              <tbody>
                {topSenior.map(player => (
                  <tr key={player.id}>
                    <td className="w-10"><OvrBadge value={player.overall} /></td>
                    <td><PlayerLink id={player.id} name={`${player.firstName} ${player.lastName}`} /></td>
                    <td><PosBadge position={player.position} /></td>
                    <td className="num text-navy-300">{player.age}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Panel title="Best prospects — youth academy" right={<Link to="/academy" className="text-xs text-accent-purple-light hover:underline">Academy</Link>}>
            {topYouth.length === 0 ? (
              <Empty>Your academy is empty. Send scouts to find prospects.</Empty>
            ) : (
              <table className="tbl">
                <thead><tr><th>POT</th><th>Name</th><th>Pos</th><th className="num">OVR</th><th className="num">Age</th></tr></thead>
                <tbody>
                  {topYouth.map(player => (
                    <tr key={player.id}>
                      <td className="w-10"><OvrBadge value={player.potential} /></td>
                      <td><PlayerLink id={player.id} name={`${player.firstName} ${player.lastName}`} /></td>
                      <td><PosBadge position={player.position} /></td>
                      <td className="num">{player.overall}</td>
                      <td className="num text-navy-300">{player.age}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
