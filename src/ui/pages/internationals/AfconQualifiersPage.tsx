import { useState } from "react";
import { getNationName } from "../../../engine/nations";
import { seasonDisplay } from "../../../engine/constants";
import { getAfconQualifierStandings } from "../../../engine/international/afcon";
import type { AfconQualifyingEdition } from "../../../engine/international/afcon";
import type { GoldCupPlayoffTie } from "../../../engine/international/goldCup";
import { useGame } from "../../../store/gameStore";
import { EuroTieCard } from "../../components/brackets";
import { Empty, NationLink, PageHeader, Panel, SeasonSelect, Tabs } from "../../components/common";
import { InternationalGroupMatchdays } from "../../components/InternationalGroupMatchdays";
import { InternationalGroupTable } from "../../components/tables";
import type { EuroRoundSnap, EuroTieSnap, TeamRef } from "../../../engine/snapshots";

type Tab = "preliminary" | "main" | "history";

function toTeamRef(code: string, id: number): TeamRef {
  return { id, name: code, countrycode: code };
}

function toTie(tie: GoldCupPlayoffTie): EuroTieSnap {
  const home = toTeamRef(tie.team1, 1);
  const away = toTeamRef(tie.team2, 2);
  const firstPlayed = tie.firstLeg.homeGoals !== null && tie.firstLeg.awayGoals !== null;
  const secondPlayed = tie.secondLeg.homeGoals !== null && tie.secondLeg.awayGoals !== null;
  const aggregate = firstPlayed && secondPlayed
    ? {
        h: tie.firstLeg.homeGoals! + tie.secondLeg.awayGoals!,
        a: tie.firstLeg.awayGoals! + tie.secondLeg.homeGoals!
      }
    : null;
  const legs = [
    ...(firstPlayed ? [{ matchday: 1, score: { h: tie.firstLeg.homeGoals!, a: tie.firstLeg.awayGoals! } }] : []),
    ...(secondPlayed ? [{ matchday: 2, score: { h: tie.secondLeg.awayGoals!, a: tie.secondLeg.homeGoals! } }] : [])
  ];
  return {
    id: tie.id,
    home,
    away,
    bye: false,
    legs,
    aggregate,
    tiebreak: tie.penalties
      ? {
          h: 0,
          a: 0,
          ph: tie.penalties.home.filter(kick => kick === "O").length,
          pa: tie.penalties.away.filter(kick => kick === "O").length
        }
      : null,
    winner: tie.winner ? tie.winner === tie.team1 ? home : away : null
  };
}

function Preliminary(props: { edition: AfconQualifyingEdition }) {
  const { edition } = props;
  if (edition.preliminaryTies.length === 0) {
    return <Panel title="Preliminary round"><Empty>No preliminary ties are required for this edition.</Empty></Panel>;
  }
  const round: EuroRoundSnap = {
    key: "CAFQP",
    label: `AFCON ${edition.suffix} preliminary round`,
    matchdays: [1, 2],
    ties: edition.preliminaryTies.map(toTie)
  };
  return (
    <Panel title={`Preliminary round · ${edition.preliminaryComplete ? "Complete" : "Scheduled"}`}>
      <div className="flex flex-col items-center gap-3 p-3">
        {edition.preliminaryTies.map((tie, index) => (
          <div key={tie.id} className="flex flex-col items-center gap-1">
            <span className="text-xs font-bold uppercase tracking-wider text-navy-300">Tie {index + 1}</span>
            <EuroTieCard tie={toTie(tie)} round={round} nationTeams />
          </div>
        ))}
      </div>
      <div className="border-t border-navy-700 p-3 text-sm text-navy-200">
        {edition.preliminaryComplete
          ? <>Qualified winners: {edition.preliminaryTies.map(tie => tie.winner && <span key={tie.id} className="mr-3"><NationLink code={tie.winner} /></span>)}</>
          : "The winners join the remaining teams in the main qualifying round."}
      </div>
    </Panel>
  );
}

function MainRound(props: { edition: AfconQualifyingEdition }) {
  const { edition } = props;
  if (!edition.mainGroups) {
    return <Panel title="Main qualifying round"><Empty>The main round draw will be made after the preliminary round.</Empty></Panel>;
  }
  return (
    <div className="space-y-5">
      <Panel title={`Main qualifying round · Matchdays ${edition.mainRoundsPlayed}/6`}>
        <p className="px-4 py-3 text-sm text-navy-200">
          The 12 group winners and the best {12 - edition.hosts.length} runners-up qualify alongside {edition.hosts.length} host{edition.hosts.length === 1 ? "" : "s"}.
        </p>
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        {edition.mainGroups.map(group => {
          const rows = getAfconQualifierStandings(edition, group);
          return (
            <Panel key={group.name} title={`Group ${group.name}`}>
              <InternationalGroupTable rows={rows} highlights={{ 1: "bg-green-500/10", 2: "bg-yellow-400/10" }} />
              <InternationalGroupMatchdays rounds={group.matches} />
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

function EditionHistory(props: { editions: AfconQualifyingEdition[]; onSelect: (year: number) => void }) {
  if (props.editions.length === 0) return <Panel><Empty>No AFCON qualifying editions are available yet.</Empty></Panel>;
  return (
    <Panel title="AFCON qualifying history">
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Season</th><th>Hosts</th><th>Preliminary</th><th>Main round</th><th></th></tr></thead>
          <tbody>
            {[...props.editions].sort((a, b) => b.year - a.year).map(edition => (
              <tr key={edition.id}>
                <td className="font-semibold">{seasonDisplay(edition.year)}</td>
                <td>{edition.hosts.map(getNationName).join(" / ")}</td>
                <td>{edition.preliminaryComplete ? "Complete" : "In progress"}</td>
                <td>{edition.completed ? `${edition.mainQualifiers.length} teams qualified` : `${edition.mainRoundsPlayed}/6 matchdays`}</td>
                <td className="text-right"><button className="btn-ghost btn-sm" onClick={() => props.onSelect(edition.year)}>View edition</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export default function AfconQualifiersPage() {
  const editions = useGame().season.international.afcon.qualifyingEditions;
  const latest = [...editions].sort((a, b) => b.year - a.year)[0] ?? null;
  const [tab, setTab] = useState<Tab>("preliminary");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const selected = editions.find(edition => edition.year === (selectedYear ?? latest?.year)) ?? latest;
  const years = [...editions].map(edition => ({
    year: edition.year,
    label: `${edition.year+1}`
  }));
  const uniqueYears = [...new Map(years.map(item => [item.year, item])).values()];

  return (
    <div>
      <PageHeader
        title="AFCON Qualifiers"
        subtitle={selected
          ? `${selected.year+1} · Hosts: ${selected.hosts.map(getNationName).join(" / ")}`
          : "Two-round qualification for the Africa Cup of Nations"}
        right={selected && uniqueYears.length > 1
          ? <SeasonSelect years={uniqueYears} value={selected.year} onChange={setSelectedYear} />
          : undefined}
      />
      <Tabs
        tabs={[
          { id: "preliminary", label: "Preliminary round" },
          { id: "main", label: "Main round" },
          { id: "history", label: "History" }
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "preliminary" && (selected
        ? <Preliminary edition={selected} />
        : <Panel><Empty>AFCON qualifying has not started yet.</Empty></Panel>
      )}
      {tab === "main" && (selected
        ? <MainRound edition={selected} />
        : <Panel><Empty>AFCON qualifying has not started yet.</Empty></Panel>
      )}
      {tab === "history" && <EditionHistory editions={editions} onSelect={year => { setSelectedYear(year); setTab("main"); }} />}
    </div>
  );
}
