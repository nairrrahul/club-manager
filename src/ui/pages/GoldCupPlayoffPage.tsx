import { useState } from "react";
import { useGame } from "../../store/gameStore";
import { findLatestGoldCupPlayoff, playoffAggregate } from "../../engine/goldCup";
import type { GoldCupPlayoffEdition, GoldCupPlayoffTie } from "../../engine/goldCup";
import { seasonDisplay } from "../../engine/constants";
import { Empty, NationLink, PageHeader, Panel, SeasonSelect, Tabs } from "../components/common";
import { EuroTieCard } from "../components/brackets";
import type { EuroRoundSnap, EuroTieSnap, TeamRef } from "../../engine/snapshots";

type Tab = "current" | "history";

function toTeamRef(code: string, id: number): TeamRef {
  return { id, name: code, countrycode: code };
}

function toEuroTie(tie: GoldCupPlayoffTie): EuroTieSnap {
  const team1 = toTeamRef(tie.team1, 1);
  const team2 = toTeamRef(tie.team2, 2);
  const aggregate = tie.firstLeg.homeGoals === null || tie.firstLeg.awayGoals === null ||
    tie.secondLeg.homeGoals === null || tie.secondLeg.awayGoals === null
    ? null
    : playoffAggregate(tie);
  const legs = [
    tie.firstLeg.homeGoals === null || tie.firstLeg.awayGoals === null
      ? null
      : { matchday: 1, score: { h: tie.firstLeg.homeGoals, a: tie.firstLeg.awayGoals } },
    tie.secondLeg.homeGoals === null || tie.secondLeg.awayGoals === null
      ? null
      : { matchday: 2, score: { h: tie.secondLeg.awayGoals, a: tie.secondLeg.homeGoals } }
  ].filter((leg): leg is NonNullable<typeof leg> => leg !== null);
  return {
    id: tie.id,
    home: team1,
    away: team2,
    bye: false,
    legs,
    aggregate: aggregate ? { h: aggregate.team1, a: aggregate.team2 } : null,
    tiebreak: tie.penalties
      ? {
          h: 0,
          a: 0,
          ph: tie.penalties.home.filter(kick => kick === "O").length,
          pa: tie.penalties.away.filter(kick => kick === "O").length
        }
      : null,
    winner: tie.winner ? tie.winner === tie.team1 ? team1 : team2 : null
  };
}

function EditionView(props: { edition: GoldCupPlayoffEdition }) {
  const { edition } = props;
  const round: EuroRoundSnap = {
    key: "GCPO",
    label: "Gold Cup Playoff",
    matchdays: [1, 2],
    ties: edition.ties.map(toEuroTie)
  };
  return (
    <div className="space-y-5">
      <Panel title={`Playoff ties · ${edition.completed ? "Complete" : "Scheduled"}`}>
        <div className="flex flex-col items-center gap-3 p-3">
          {edition.ties.map((tie, index) => (
            <div key={tie.id} className="flex flex-col items-center gap-1">
              <span className="text-xs font-bold uppercase tracking-wider text-navy-300">Tie {index + 1}</span>
              <EuroTieCard tie={toEuroTie(tie)} round={round} nationTeams />
            </div>
          ))}
        </div>
      </Panel>
      <Panel title={`Qualified from the playoff · ${edition.qualifiers.length}/7`}>
        {edition.qualifiers.length === 0
          ? <Empty>The seven qualifiers will be confirmed after the second legs.</Empty>
          : <div className="flex flex-wrap gap-x-4 gap-y-2 p-3">{edition.qualifiers.map(code => <NationLink key={code} code={code} />)}</div>}
      </Panel>
    </div>
  );
}

export default function GoldCupPlayoffPage() {
  const editions = useGame().season.international.goldCup.playoffEditions;
  const latest = findLatestGoldCupPlayoff({ playoffEditions: editions, editions: [] });
  const [tab, setTab] = useState<Tab>("current");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const year = selectedYear ?? latest?.year ?? 2026;
  const selected = editions.find(edition => edition.year === year) ?? latest;
  const years = [...new Set(editions.map(edition => edition.year))].sort((a, b) => a - b);
  if (!years.includes(year)) years.push(year);

  return (
    <div>
      <PageHeader
        title="Gold Cup Playoff"
        subtitle={selected
          ? `${seasonDisplay(selected.year)} · ${selected.completed ? `${selected.qualifiers.length} teams qualified` : "Home-and-away qualification ties"}`
          : "Home-and-away qualification ties for the Gold Cup"}
        right={years.length > 1 ? <SeasonSelect years={years.map(value => ({ year: value, label: String(value) }))} value={year} onChange={setSelectedYear} /> : undefined}
      />
      <Tabs
        tabs={[
          { id: "current", label: "Current edition" },
          { id: "history", label: "History" }
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "current" && (selected
        ? <EditionView edition={selected} />
        : <Panel><Empty>The Gold Cup playoff has not started yet.</Empty></Panel>
      )}
      {tab === "history" && (
        selected
          ? <EditionView edition={selected} />
          : <Panel><Empty>No Gold Cup playoff editions are available yet.</Empty></Panel>
      )}
    </div>
  );
}
