import { useState } from "react";
import { useGame } from "../../store/gameStore";
import { getAllSeasonViews } from "../../engine/game";
import { CLUB_WORLD_CUP_NAME, CLUB_WORLD_CUP_START_YEAR } from "../../engine/clubWorldCup";
import { seasonDisplay } from "../../engine/constants";
import { CupBracketTree } from "../components/brackets";
import { Empty, PageHeader, Panel, SeasonSelect, Tabs, TeamLink } from "../components/common";
import { MatchLine } from "../components/tables";
import type { ClubWorldCupSnap } from "../../engine/snapshots";
import type { CupSnap } from "../../engine/snapshots";
import { formatScore } from "../format";

type Tab = "groups" | "knockout" | "history";

function groupToCup(group: ClubWorldCupSnap): CupSnap {
  return {
    rounds: (group.knockout ?? []).map((round, index) => ({
      round: index + 1,
      label: round.label,
      matchday: 21,
      matches: round.matches.map((match, matchIndex) => ({
        id: `CWC-${index}-${matchIndex}`,
        home: match.home,
        away: match.away,
        score: match.score,
        winner: match.winner,
        bye: false
      }))
    })),
    complete: group.complete,
    winner: group.winner,
    runnerUp: group.runnerUp
  };
}

function GroupTable(props: { group: ClubWorldCupSnap["groups"][number]; highlightID: number }) {
  return (
    <Panel title={`Group ${props.group.name}`}>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th className="w-8">#</th><th>Club</th><th className="num">P</th>
              <th className="num">W</th><th className="num">D</th><th className="num">L</th>
              <th className="num">GF</th><th className="num">GA</th><th className="num">GD</th><th className="num">Pts</th>
            </tr>
          </thead>
          <tbody>
            {props.group.table.map(row => (
              <tr key={row.team.id} className={row.team.id === props.highlightID ? "bg-navy-600" : ""}>
                <td className="num">{row.pos}</td>
                <td><TeamLink team={row.team} /></td>
                <td className="num">{row.GP}</td><td className="num">{row.W}</td>
                <td className="num">{row.D}</td><td className="num">{row.L}</td>
                <td className="num">{row.GF}</td><td className="num">{row.GA}</td>
                <td className="num">{row.GD > 0 ? `+${row.GD}` : row.GD}</td>
                <td className="num font-bold">{row.PTS}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 text-xs text-navy-300">The top two clubs advance to the semi-finals.</div>
    </Panel>
  );
}

function GroupFixtures(props: { group: ClubWorldCupSnap["groups"][number] }) {
  return (
    <Panel title={`Group ${props.group.name} fixtures`}>
      <div className="grid lg:grid-cols-3">
        {props.group.fixtures.map(round => (
          <div key={round.round} className="border-r last:border-r-0 border-navy-700">
            <div className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-navy-300">
              Matchday {round.round}
            </div>
            {round.matches.map((match, index) => (
              <MatchLine key={index} match={{ home: match.home, away: match.away, score: match.score }} />
            ))}
          </div>
        ))}
      </div>
    </Panel>
  );
}

export default function ClubWorldCupPage() {
  const game = useGame();
  const [tab, setTab] = useState<Tab>("groups");
  const [year, setYear] = useState(game.season.year);
  const views = getAllSeasonViews(game).filter(view => view.clubWorldCup);
  const histories = views.filter(view => view.clubWorldCup?.complete);

  if (views.length === 0) {
    return (
      <div>
        <PageHeader title={CLUB_WORLD_CUP_NAME} />
        <Panel><Empty>The Club World Cup begins in the {seasonDisplay(CLUB_WORLD_CUP_START_YEAR)} season.</Empty></Panel>
      </div>
    );
  }

  const view = views.find(item => item.year === year) ?? views[views.length - 1];
  const cup = view.clubWorldCup as ClubWorldCupSnap;
  const isCurrent = view.year === game.season.year;
  const currentPhase = cup.complete ? `Winners: ${cup.winner?.name ?? "Unknown"}` :
    isCurrent && game.season.matchday >= 21 ? "Ready to simulate" : "Group stage";

  return (
    <div>
      <PageHeader
        title={CLUB_WORLD_CUP_NAME}
        subtitle={`Season ${view.label} · ${currentPhase}`}
        right={<SeasonSelect years={views.map(item => ({ year: item.year, label: item.label }))} value={view.year} onChange={setYear} />}
      />
      <Tabs
        tabs={[
          { id: "groups", label: "Group stage" },
          { id: "knockout", label: "Knockout bracket" },
          { id: "history", label: "History" }
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "groups" && (
        <div className="space-y-6">
          <div className="grid xl:grid-cols-2 gap-6">
            {cup.groups.map(group => <GroupTable key={group.name} group={group} highlightID={game.managerTeam.ID} />)}
          </div>
          <div className="grid xl:grid-cols-2 gap-6">
            {cup.groups.map(group => <GroupFixtures key={group.name} group={group} />)}
          </div>
        </div>
      )}

      {tab === "knockout" && (
        cup.knockout
          ? <CupBracketTree cup={groupToCup(cup)} highlightID={game.managerTeam.ID} />
          : <Panel><Empty>The semi-finals and final are played after the group stage between matchdays 21 and 22.</Empty></Panel>
      )}

      {tab === "history" && (
        <Panel title={`${CLUB_WORLD_CUP_NAME} history`}>
          {histories.length === 0 ? <Empty>No completed tournaments yet.</Empty> : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Season</th><th>Winner</th><th>Runner-up</th><th>Final score</th><th></th></tr></thead>
                <tbody>
                  {[...histories].reverse().map(item => {
                    const record = item.clubWorldCup as ClubWorldCupSnap;
                    const final = record.knockout?.at(-1)?.matches[0];
                    return (
                      <tr key={item.year}>
                        <td className="font-semibold">{item.label}</td>
                        <td>{record.winner && <TeamLink team={record.winner} />}</td>
                        <td>{record.runnerUp && <TeamLink team={record.runnerUp} />}</td>
                        <td className="text-navy-200">
                          {final && <>{final.home.name} {formatScore(final.score)} {final.away.name}</>}
                        </td>
                        <td className="text-right">
                          <button className="btn-ghost btn-sm" onClick={() => { setYear(item.year); setTab("groups"); }}>View season</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
