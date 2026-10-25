import { useState } from "react";
import { useGame } from "../../store/gameStore";
import { getAllSeasonViews } from "../../engine/game";
import { CONTINENTAL_CONFEDERATIONS } from "../../engine/continentalTournaments";
import type { ContinentalTournamentSnap, CupSnap } from "../../engine/snapshots";
import { CupBracketTree } from "../components/brackets";
import { Empty, PageHeader, Panel, SeasonSelect, Tabs, TeamLink } from "../components/common";
import { formatScore } from "../format";

type Tab = "bracket" | "history";

function tournamentToCup(tournament: ContinentalTournamentSnap): CupSnap {
  return {
    rounds: tournament.rounds.map((round, roundIndex) => ({
      round: roundIndex + 1,
      label: round.label,
      matchday: round.matchday,
      matches: round.matches.map(match => ({
        id: match.id,
        home: match.home,
        away: match.away,
        score: match.legs && match.aggregate
          ? { h: match.aggregate.h, a: match.aggregate.a }
          : match.result,
        winner: match.winner,
        bye: match.bye,
        ...(match.legs ? {
          legs: match.legs,
          aggregate: match.aggregate,
          tiebreak: match.tiebreak
        } : {})
      }))
    })),
    complete: tournament.complete,
    winner: tournament.winner,
    runnerUp: tournament.runnerUp
  };
}

export default function ContinentalTournamentsPage() {
  const game = useGame();
  const views = getAllSeasonViews(game);
  const [confederation, setConfederation] = useState<string>(CONTINENTAL_CONFEDERATIONS[0]);
  const [year, setYear] = useState(game.season.year);
  const [tab, setTab] = useState<Tab>("bracket");
  const seasons = views
    .filter(view => view.continentalTournaments?.[confederation])
    .map(view => ({
      year: view.year,
      label: view.continentalTournaments?.[confederation]?.label ?? view.label
    }));
  const selectedSeason = seasons.find(item => item.year === year) ?? seasons[seasons.length - 1];
  const tournament = selectedSeason
    ? views.find(view => view.year === selectedSeason.year)?.continentalTournaments?.[confederation] ?? null
    : null;
  const history = views
    .map(view => view.continentalTournaments?.[confederation])
    .filter((record): record is ContinentalTournamentSnap => Boolean(record?.complete))
    .reverse();

  return (
    <div>
      <PageHeader
        title="Continental Tournaments"
        subtitle="Non-UEFA champions compete for qualification to the following season's Club World Cup."
        right={
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-navy-200">
              Confederation
              <select
                className="input"
                value={confederation}
                onChange={event => setConfederation(event.target.value)}
              >
                {CONTINENTAL_CONFEDERATIONS.map(code => <option key={code} value={code}>{code}</option>)}
              </select>
            </label>
            {tab === "bracket" && seasons.length > 0 && selectedSeason && (
              <SeasonSelect years={seasons} value={selectedSeason.year} onChange={setYear} />
            )}
          </div>
        }
      />
      <Tabs
        tabs={[
          { id: "bracket", label: "Bracket" },
          { id: "history", label: "History" }
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "bracket" && (
        tournament ? (
          <Panel
            title={`${confederation} · ${tournament.label}`}
            right={
              tournament.complete
                ? <span>Champion: {tournament.winner?.name ?? "Unknown"}</span>
                : <span>Auto-simulates from matchday 31</span>
            }
          >
            {tournament.rounds.length > 0 ? (
              <CupBracketTree cup={tournamentToCup(tournament)} highlightID={game.managerTeam?.ID} />
            ) : (
              <Empty>
                This tournament has not been played yet. Each knockout round simulates automatically on its own matchday, starting at matchday 31.
              </Empty>
            )}
          </Panel>
        ) : (
          <Panel>
            <Empty>
              Continental tournaments begin in the 2027-28 season. Each confederation's full club pool enters a randomly drawn knockout, with one round automatically simulated per matchday starting at matchday 31.
            </Empty>
          </Panel>
        )
      )}

      {tab === "history" && (
        <Panel title={`${confederation} tournament history`}>
          {history.length === 0 ? <Empty>No completed tournaments yet.</Empty> : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Season</th><th>Champion</th><th>Runner-up</th><th>Final score</th><th></th></tr></thead>
                <tbody>
                  {history.map(record => {
                    const final = record.rounds.at(-1)?.matches[0];
                    return (
                      <tr key={record.year}>
                        <td className="font-semibold">{record.label}</td>
                        <td>{record.winner && <TeamLink team={record.winner} />}</td>
                        <td>{record.runnerUp && <TeamLink team={record.runnerUp} />}</td>
                        <td>{final?.home && <>{final.home.name} {formatScore(final.result)} {final.away?.name}</>}</td>
                        <td className="text-right">
                          <button
                            className="btn-ghost btn-sm"
                            onClick={() => { setYear(record.year); setTab("bracket"); }}
                          >
                            View bracket
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
      )}
    </div>
  );
}
