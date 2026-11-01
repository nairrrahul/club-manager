import { useState } from "react";
import { getNationName } from "../../../engine/nations";
import { getOfcCupQualifierStandings } from "../../../engine/international/ofcCup";
import type { OfcCupQualifyingEdition } from "../../../engine/international/ofcCup";
import { useGame } from "../../../store/gameStore";
import { Empty, PageHeader, Panel, SeasonSelect, Tabs } from "../../components/common";
import { InternationalGroupMatchdays } from "../../components/InternationalGroupMatchdays";
import { InternationalGroupTable } from "../../components/tables";

type Tab = "main" | "history";

function MainRound(props: { edition: OfcCupQualifyingEdition }) {
  const { edition } = props;
  return (
    <div className="space-y-5">
      <Panel title={`Main qualifying round · Matchdays ${edition.roundsPlayed}/10`}>
        <p className="px-4 py-3 text-sm text-navy-200">
          The top three teams in each group and the best fourth-place team qualify for the OFC Cup, alongside the host.
        </p>
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        {edition.groups.map(group => (
          <Panel key={group.name} title={`Group ${group.name}`}>
            <InternationalGroupTable rows={getOfcCupQualifierStandings(edition, group)} />
            <InternationalGroupMatchdays rounds={group.matches} />
          </Panel>
        ))}
      </div>
    </div>
  );
}

function EditionHistory(props: { editions: OfcCupQualifyingEdition[]; onSelect: (year: number) => void }) {
  if (props.editions.length === 0) return <Panel><Empty>No OFC Cup qualifying editions are available yet.</Empty></Panel>;
  return (
    <Panel title="OFC Cup qualifying history">
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Year</th><th>Host</th><th>Qualifying teams</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {[...props.editions].sort((a, b) => b.year - a.year).map(edition => (
              <tr key={edition.id}>
                <td className="font-semibold">{edition.year + 1}</td>
                <td>{edition.hosts.map(getNationName).join(" / ")}</td>
                <td>{edition.teams.length}</td>
                <td>{edition.completed ? `${edition.qualifiers.length} teams qualified` : `${edition.roundsPlayed}/10 matchdays`}</td>
                <td className="text-right">
                  <button className="btn-ghost btn-sm" onClick={() => props.onSelect(edition.year)}>View edition</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export default function OfcCupQualifiersPage() {
  const editions = useGame().season.international.ofcCup.qualifyingEditions;
  const latest = [...editions].sort((a, b) => b.year - a.year)[0] ?? null;
  const [tab, setTab] = useState<Tab>("main");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const selected = editions.find(edition => edition.year === (selectedYear ?? latest?.year)) ?? latest;
  const years = [...new Set(editions.map(edition => edition.year))].sort((a, b) => a - b);

  return (
    <div>
      <PageHeader
        title="OFC Cup Qualifiers"
        subtitle={selected
          ? `${selected.year + 1} · Host: ${selected.hosts.map(getNationName).join(" / ")}`
          : "Two-group qualification for the OFC Cup"}
        right={selected && years.length > 1
          ? <SeasonSelect years={years.map(year => ({ year, label: String(year + 1) }))} value={selected.year} onChange={setSelectedYear} />
          : undefined}
      />
      <Tabs
        tabs={[
          { id: "main", label: "Main round" },
          { id: "history", label: "History" }
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "main" && (selected
        ? <MainRound edition={selected} />
        : <Panel><Empty>OFC Cup qualifying has not started yet.</Empty></Panel>
      )}
      {tab === "history" && (
        <EditionHistory editions={editions} onSelect={year => { setSelectedYear(year); setTab("main"); }} />
      )}
    </div>
  );
}
