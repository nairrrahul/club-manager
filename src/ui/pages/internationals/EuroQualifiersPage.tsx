import { useState } from "react";
import { getNationName } from "../../../engine/nations";
import { getEuroQualifierStandings } from "../../../engine/international/euroQualifiers";
import type { EuroQualifyingEdition } from "../../../engine/international/euroQualifiers";
import type { CupSnap, TeamRef } from "../../../engine/snapshots";
import { useGame } from "../../../store/gameStore";
import { Empty, NationLink, PageHeader, Panel, SeasonSelect, Tabs } from "../../components/common";
import { CupBracketTree } from "../../components/brackets";
import { InternationalGroupMatchdays } from "../../components/InternationalGroupMatchdays";
import { InternationalGroupTable, InternationalNthPlacedTeamsTable } from "../../components/tables";

type Tab = "main" | "playoffs" | "history";

function MainRound(props: { edition: EuroQualifyingEdition }) {
  const { edition } = props;
  const highlights = edition.hosts.length === 2
    ? { 1: "bg-green-500/10", 2: "bg-yellow-400/10", 3: "bg-yellow-400/10" }
    : { 1: "bg-green-500/10", 2: "bg-green-500/10", 3: "bg-yellow-400/10" };
  return (
    <div className="space-y-5">
      <Panel title={`Main qualifying round · Matchdays ${edition.roundsPlayed}/10`}>
        <p className="px-4 py-3 text-sm text-navy-200">
          Hosts: {edition.hosts.map(getNationName).join(" / ")} · {edition.groupCount} groups ·
          {" "}three playoff paths determine the remaining EURO places.
        </p>
      </Panel>
      <div className="grid items-start gap-4 xl:grid-cols-2">
        {edition.groups.map(group => (
          <Panel key={group.name} title={`Group ${group.name}`}>
            <InternationalGroupTable rows={getEuroQualifierStandings(edition, group)} highlights={highlights} />
            <InternationalGroupMatchdays rounds={group.matches} />
          </Panel>
        ))}
      </div>
      {edition.hosts.length === 2 && (
        <InternationalNthPlacedTeamsTable
          place={2}
          advancingCount={9}
          seedRanks={edition.seedRanks}
          rows={edition.groups.flatMap(group =>
            getEuroQualifierStandings(edition, group)
              .filter(row => row.position === 2)
              .map(row => ({ ...row, group: group.name }))
          )}
        />
      )}
    </div>
  );
}

function Playoffs(props: {
  edition: EuroQualifyingEdition;
  windows: ReturnType<typeof useGame>["season"]["international"]["windows"];
}) {
  const { edition } = props;
  const matches = props.windows.flatMap(window => window.rounds.flatMap(round => round.matches))
    .filter(match => match.euroQualifierId === edition.id && match.euroStage === "playoff")
    .sort((a, b) => (a.euroPathRound ?? 0) - (b.euroPathRound ?? 0) ||
      (a.euroPath ?? "").localeCompare(b.euroPath ?? "") ||
      (a.euroPathMatch ?? 0) - (b.euroPathMatch ?? 0));
  if (!edition.completed) {
    return <Panel><Empty>The play-off draw will be made after the main qualifying round.</Empty></Panel>;
  }
  const toTeamRef = (code: string | null): TeamRef | null => code === null ? null : ({
    id: edition.playoffTeams.indexOf(code) + 1,
    name: getNationName(code),
    countrycode: code
  });
  const paths = edition.playoffPaths.map(path => {
    const bracket: CupSnap = {
      rounds: path.bracket.rounds.map((round, roundIndex) => ({
        round: roundIndex + 1,
        label: roundIndex === 0 ? "Semi-finals" : "Final",
        matchday: roundIndex + 1,
        matches: round.map((bracketMatch, matchIndex) => {
          const fixture = matches.find(match =>
            match.euroPath === path.name &&
            match.euroPathRound === roundIndex + 1 &&
            match.euroPathMatch === matchIndex
          );
          const home = bracketMatch.player1?.team ?? fixture?.home ?? null;
          const away = bracketMatch.player2?.team ?? fixture?.away ?? null;
          return {
            id: bracketMatch.id,
            home: toTeamRef(home),
            away: toTeamRef(away),
            score: fixture && fixture.homeGoals !== null && fixture.awayGoals !== null
              ? {
                  h: fixture.homeGoals,
                  a: fixture.awayGoals,
                  ...(fixture.homePenalties && fixture.awayPenalties
                    ? {
                        ph: fixture.homePenalties.filter(kick => kick === "O").length,
                        pa: fixture.awayPenalties.filter(kick => kick === "O").length
                      }
                    : {})
                }
              : null,
            winner: toTeamRef(bracketMatch.winner),
            bye: false
          };
        })
      })),
      complete: edition.playoffComplete,
      winner: null,
      runnerUp: null
    };
    return { path, bracket };
  });
  return (
    <div className="space-y-4">
      <Panel title={`EURO Qualifying Play-offs · ${edition.playoffComplete ? "Complete" : "Scheduled"}`}>
        <p className="px-4 py-3 text-sm text-navy-200">
          Three paths. Each path winner qualifies for the EURO. Teams marked NL were selected from the Nations League aggregate ranking and are bottom seeds.
        </p>
      </Panel>
      <div className="space-y-4">
        {paths.map(({ path, bracket }) => (
          <Panel key={path.name} title={`Path ${path.name}`}>
            <div className="grid gap-3 p-3 lg:grid-cols-[minmax(190px,1fr)_minmax(0,2fr)]">
              <div className="flex h-full flex-col rounded-md border border-navy-600/70 bg-navy-900/40 px-2">
                {path.teams.map((code, index) => (
                  <div key={code} className={`flex min-h-0 flex-1 items-center justify-between gap-3 px-1 text-sm ${index > 0 ? "border-t border-navy-700/60" : ""}`}>
                    <span><span className="mr-2 text-navy-300">Seed {index + 1}</span><NationLink code={code} /></span>
                    {edition.playoffBottomSeeds.includes(code) &&
                      <span className="rounded bg-navy-600 px-2 py-0.5 text-xs font-bold text-white">NL</span>}
                  </div>
                ))}
              </div>
              <div className="min-w-0 rounded-md border border-navy-600/70 bg-navy-900/40 p-2">
                <CupBracketTree cup={bracket} nationTeams showFlag />
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function History(props: { editions: EuroQualifyingEdition[]; onSelect: (year: number) => void }) {
  if (props.editions.length === 0) return <Panel><Empty>No EURO qualifying editions are available yet.</Empty></Panel>;
  return (
    <Panel title="EURO qualifying history">
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>EURO year</th><th>Hosts</th><th>Groups</th><th>Direct qualifiers</th><th>Play-offs</th><th></th></tr></thead>
          <tbody>
            {[...props.editions].sort((a, b) => b.tournamentYear - a.tournamentYear).map(edition => (
              <tr key={edition.id}>
                <td className="font-semibold">{edition.tournamentYear+1}</td>
                <td>{edition.hosts.map(getNationName).join(" / ")}</td>
                <td>{edition.groupCount}</td>
                <td>{edition.directQualifiers.length || "In progress"}</td>
                <td>{edition.playoffComplete ? "Complete" : edition.completed ? "Scheduled" : "Not drawn"}</td>
                <td className="text-right">
                  <button className="btn-ghost btn-sm" onClick={() => props.onSelect(edition.tournamentYear)}>View edition</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export default function EuroQualifiersPage() {
  const game = useGame();
  const editions = game.season.international.euroQualifiers.editions;
  const latest = [...editions].sort((a, b) => b.tournamentYear - a.tournamentYear)[0] ?? null;
  const [tab, setTab] = useState<Tab>("main");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const selected = editions.find(edition => edition.tournamentYear === (selectedYear ?? latest?.tournamentYear)) ?? latest;
  const years = [...new Set(editions.map(edition => edition.tournamentYear))].sort((a, b) => a - b);

  return (
    <div>
      <PageHeader
        title="EURO Qualifiers"
        subtitle={selected
          ? `${selected.tournamentYear} · Hosts: ${selected.hosts.map(getNationName).join(" / ")}`
          : "Main round and qualifying play-offs for the UEFA EURO"}
        right={selected && years.length > 1
          ? <SeasonSelect years={years.map(year => ({ year, label: String(year) }))} value={selected.tournamentYear} onChange={setSelectedYear} />
          : undefined}
      />
      <Tabs
        tabs={[
          { id: "main", label: "Main round" },
          { id: "playoffs", label: "Play-offs" },
          { id: "history", label: "History" }
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "main" && (selected
        ? <MainRound edition={selected} />
        : <Panel><Empty>EURO qualifying has not started yet.</Empty></Panel>
      )}
      {tab === "playoffs" && (selected
        ? <Playoffs edition={selected} windows={game.season.international.windows} />
        : <Panel><Empty>EURO qualifying has not started yet.</Empty></Panel>
      )}
      {tab === "history" && (
        <History editions={editions} onSelect={year => { setSelectedYear(year); setTab("main"); }} />
      )}
    </div>
  );
}
