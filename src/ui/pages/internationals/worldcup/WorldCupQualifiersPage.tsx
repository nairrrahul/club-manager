import { useState } from "react";
import { getConfederation, getNationName } from "../../../../engine/nations";
import type { CupSnap, EuroRoundSnap, EuroTieSnap, TeamRef } from "../../../../engine/snapshots";
import type { WorldCupConfederation, WorldCupEdition, WorldCupPhase } from "../../../../engine/international/worldcup/types";
import { getStandings, rankGroupPlaces } from "../../../../engine/international/worldcup/utils";
import { useGame } from "../../../../store/gameStore";
import InternationalCupPage from "../InternationalCupPage";
import { CupBracketTree, EuroTieCard } from "../../../components/brackets";
import { Empty, NationLink, PageHeader, Panel, SeasonSelect, Tabs } from "../../../components/common";
import { InternationalGroupMatchdays } from "../../../components/InternationalGroupMatchdays";
import { InternationalGroupTable, InternationalNthPlacedTeamsTable } from "../../../components/tables";

type PhaseConfig = { id: string; label: string };

const CONFEDERATION_LABELS: Record<WorldCupConfederation, string> = {
  UEFA: "UEFA",
  CONCACAF: "CONCACAF",
  CONMEBOL: "CONMEBOL",
  OFC: "OFC",
  AFC: "AFC",
  CAF: "CAF",
  ICPO: "Intercontinental playoff"
};

const PHASES: Record<WorldCupConfederation, PhaseConfig[]> = {
  UEFA: [{ id: "UEFAWCQM", label: "Main round" }, { id: "UEFAWCQP", label: "Playoffs" }],
  CONCACAF: [{ id: "CCWCQ1", label: "Round 1" }, { id: "CCWCQ2", label: "Round 2" }, { id: "CCWCQ3", label: "Round 3" }],
  CONMEBOL: [{ id: "SAWCQ", label: "Main round" }],
  OFC: [{ id: "OFCWCQ1", label: "Round 1" }, { id: "OFCWCQ2", label: "Round 2" }, { id: "OFCWCQ3", label: "Round 3" }],
  AFC: [{ id: "AFCWCQ1", label: "Round 1" }, { id: "AFCWCQ2", label: "Round 2" }, { id: "AFCWCQ3", label: "Round 3" }],
  CAF: [{ id: "CAFWCQ", label: "Main round" }, { id: "CAFWCQP", label: "Playoffs" }],
  ICPO: [{ id: "ICPO", label: "Playoff paths" }]
};

function teamRef(code: string, teams: string[]): TeamRef {
  return { id: teams.indexOf(code) + 1, name: code, countrycode: code };
}

function toTie(tie: WorldCupPhase["ties"][number], teams: string[]): EuroTieSnap {
  const home = teamRef(tie.team1, teams);
  const away = teamRef(tie.team2, teams);
  const firstPlayed = tie.firstLeg.homeGoals !== null && tie.firstLeg.awayGoals !== null;
  const secondPlayed = tie.secondLeg.homeGoals !== null && tie.secondLeg.awayGoals !== null;
  const penalties = tie.secondLeg.homePenalties && tie.secondLeg.awayPenalties
    ? {
        h: 0,
        a: 0,
        ph: tie.secondLeg.awayPenalties.filter(kick => kick === "O").length,
        pa: tie.secondLeg.homePenalties.filter(kick => kick === "O").length
      }
    : null;
  return {
    id: tie.id,
    home,
    away,
    bye: false,
    legs: [
      ...(firstPlayed ? [{ matchday: 1, score: { h: tie.firstLeg.homeGoals!, a: tie.firstLeg.awayGoals! } }] : []),
      ...(secondPlayed ? [{ matchday: 2, score: { h: tie.secondLeg.awayGoals!, a: tie.secondLeg.homeGoals! } }] : [])
    ],
    aggregate: firstPlayed && secondPlayed
      ? { h: tie.firstLeg.homeGoals! + tie.secondLeg.awayGoals!, a: tie.firstLeg.awayGoals! + tie.secondLeg.homeGoals! }
      : null,
    tiebreak: penalties,
    winner: tie.winner ? tie.winner === tie.team1 ? home : away : null
  };
}

function bracketSnapshot(phase: WorldCupPhase, pathIndex: number): CupSnap {
  const path = phase.paths[pathIndex];
  const roundLabels: Record<number, string[]> = {
    1: ["Final"],
    2: ["Semi-finals", "Final"],
    3: ["Quarter-finals", "Semi-finals", "Final"],
    4: ["Round of 16", "Quarter-finals", "Semi-finals", "Final"]
  };
  const labels = roundLabels[path.bracket.rounds.length];
  return {
    rounds: path.bracket.rounds.map((matches, roundIndex) => ({
      round: roundIndex + 1,
      label: labels?.[roundIndex] ?? `Round ${roundIndex + 1}`,
      matchday: roundIndex + 1,
      matches: matches.map(match => {
        const result = path.results[match.id];
        const homePenalties = result?.homePenalties;
        const awayPenalties = result?.awayPenalties;
        return {
          id: match.id,
          home: match.player1?.team ? teamRef(match.player1.team, path.teams) : null,
          away: match.player2?.team ? teamRef(match.player2.team, path.teams) : null,
          score: result ? {
            h: result.homeGoals,
            a: result.awayGoals,
            ...(homePenalties && awayPenalties ? {
              ph: homePenalties.filter(kick => kick === "O").length,
              pa: awayPenalties.filter(kick => kick === "O").length
            } : {})
          } : null,
          winner: match.winner ? teamRef(match.winner, path.teams) : null,
          bye: !match.player1?.team || !match.player2?.team
        };
      })
    })),
    complete: phase.playoffComplete,
    winner: path.bracket.rounds.at(-1)?.[0]?.winner
      ? teamRef(path.bracket.rounds.at(-1)![0].winner!, path.teams)
      : null,
    runnerUp: null
  };
}

function PhaseContent(props: { phase: WorldCupPhase | undefined; edition: WorldCupEdition; phaseName: string; phaseLabel: string }) {
  const { phase, edition } = props;
  if (!phase) return <Panel><Empty>{props.phaseLabel} has not started yet.</Empty></Panel>;
  const ranks = edition.seedRanks;
  const hasGroups = phase.groups.length > 0;
  const hasKnockout = phase.paths.length > 0 || phase.ties.length > 0;
  return (
    <div className="space-y-5">
      {hasGroups && (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {phase.groups.map(group => (
            <Panel key={group.name} title={`Group ${group.name}`}>
              <InternationalGroupTable
                rows={getStandings(group, ranks)}
                highlights={getPhaseHighlights(props.edition, props.phaseName)}
              />
              <InternationalGroupMatchdays rounds={group.matches} />
            </Panel>
          ))}
        </div>
      )}
      {phase.ties.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-2">
          {phase.ties.map((tie, index) => {
            const teams = [
              ...Object.values(edition.regions).flatMap(region => region.teams),
              ...edition.intercontinental.teams
            ];
            const snap = toTie(tie, teams);
            const round: EuroRoundSnap = { key: "WCQ", label: props.phaseLabel, matchdays: [1, 2], ties: [snap] };
            return <Panel key={tie.id} title={`Tie ${index + 1}`}><div className="flex justify-center p-3"><EuroTieCard tie={snap} round={round} nationTeams /></div></Panel>;
          })}
        </div>
      )}
      {phase.paths.map((path, index) => (
        <Panel key={path.name} title={props.phaseName === "UEFAWCQP" ? `Path ${String.fromCharCode(65 + index)}` : path.name}>
          <div className={props.phaseName === "UEFAWCQP" ? "grid gap-3 p-3 lg:grid-cols-[minmax(190px,1fr)_minmax(0,2fr)]" : ""}>
            {props.phaseName === "UEFAWCQP" && (
              <div className="flex h-full flex-col rounded-md border border-navy-600/70 bg-navy-900/40 px-2">
                {path.teams.map((code, seedIndex) => (
                  <div key={code} className={`flex min-h-0 flex-1 items-center justify-between gap-3 px-1 text-sm ${seedIndex > 0 ? "border-t border-navy-700/60" : ""}`}>
                    <span><span className="mr-2 text-navy-300">Seed {seedIndex + 1}</span><NationLink code={code} /></span>
                    {phase.bottomSeeds.includes(code) &&
                      <span className="rounded bg-navy-600 px-2 py-0.5 text-xs font-bold text-white">NL</span>}
                  </div>
                ))}
              </div>
            )}
            <div className={props.phaseName === "UEFAWCQP" ? "min-w-0 rounded-md border border-navy-600/70 bg-navy-900/40 p-2" : ""}>
              <CupBracketTree cup={bracketSnapshot(phase, index)} nationTeams showFlag />
            </div>
          </div>
        </Panel>
      ))}
      {props.phaseName === "CAFWCQ" && edition.hosts.some(host => getConfederation(host) === "CAF") && (
        <InternationalNthPlacedTeamsTable
          place={2}
          advancingCount={4}
          seedRanks={edition.seedRanks}
          rows={rankGroupPlaces(phase.groups, 2, ranks, true)}
        />
      )}
      {!hasGroups && !hasKnockout && (
        <Panel><Empty>{props.phaseLabel} draw has not been made yet.</Empty></Panel>
      )}
    </div>
  );
}

function getPhaseHighlights(edition: WorldCupEdition, phaseName: string): Record<number, string> {
  const region = phaseName === "ICPO"
    ? edition.intercontinental
    : Object.values(edition.regions).find(item => item.phases[phaseName]);
  const phase = region?.phases[phaseName];
  if (!phase) return {};
  const hostCount = edition.hosts.filter(host => getConfederation(host) === region?.confederation).length;
  const green = "bg-green-500/10";
  const yellow = "bg-yellow-400/10";
  if (phaseName === "SAWCQ") {
    const direct = Math.max(0, 6 - hostCount);
    return Object.fromEntries([
      ...Array.from({ length: direct }, (_, index) => [index + 1, green]),
      ...Array.from({ length: hostCount ? 2 : 1 }, (_, index) => [direct + index + 1, yellow])
    ]);
  }
  if (phaseName === "CAFWCQ") return { 1: green, 2: yellow };
  if (phaseName === "CCWCQ2" || phaseName === "AFCWCQ2" || phaseName === "OFCWCQ2") return { 1: green, 2: green };
  if (phaseName === "UEFAWCQM") return { 1: green, 2: yellow };
  if (phaseName === "CCWCQ3" || phaseName === "AFCWCQ3") {
    return hostCount ? { 1: green, 2: yellow } : { 1: green, 2: green, 3: yellow };
  }
  return {};
}

function History(props: { editions: WorldCupEdition[]; confederation: WorldCupConfederation; onSelect: (year: number) => void }) {
  const rows = [...props.editions].sort((a, b) => b.year - a.year);
  if (!rows.length) return <Panel><Empty>No World Cup qualifying editions are available yet.</Empty></Panel>;
  return (
    <Panel title={`${CONFEDERATION_LABELS[props.confederation]} World Cup qualifying history`}>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Year</th><th>Hosts</th><th>Qualifiers</th><th>Status</th><th></th></tr></thead>
          <tbody>{rows.map(edition => {
            const region = props.confederation === "ICPO" ? edition.intercontinental : edition.regions[props.confederation];
            const phases = Object.values(region.phases);
            return (
              <tr key={edition.id}>
                <td className="font-semibold">{edition.year + 1}</td>
                <td>{edition.hosts.map(getNationName).join(" / ")}</td>
                <td>{region.qualified.length + region.intercontinental.length}</td>
                <td>{phases.some(phase => !phase.completed) ? "In progress" : phases.length ? "Complete" : "Not started"}</td>
                <td className="text-right"><button className="btn-ghost btn-sm" onClick={() => props.onSelect(edition.year)}>View edition</button></td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </Panel>
  );
}

export default function WorldCupQualifiersPage(props: { confederation: WorldCupConfederation }) {
  const editions = useGame().season.international.worldCup.editions;
  const latest = [...editions].sort((a, b) => b.year - a.year)[0] ?? null;
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [tab, setTab] = useState(PHASES[props.confederation][0]?.id ?? "history");
  const selected = editions.find(edition => edition.year === (selectedYear ?? latest?.year)) ?? latest;
  const phases = PHASES[props.confederation];
  const region = selected
    ? props.confederation === "ICPO" ? selected.intercontinental : selected.regions[props.confederation]
    : null;
  const tabs = [...phases.map(phase => ({ id: phase.id, label: phase.label })), { id: "history", label: "History" }];
  const activeTab = tabs.some(item => item.id === tab) ? tab : tabs[0]?.id ?? "history";

  return (
    <div>
      <PageHeader
        title={`${CONFEDERATION_LABELS[props.confederation]} World Cup Qualifiers`}
        subtitle={selected ? `${selected.year + 1} · Hosts: ${selected.hosts.map(getNationName).join(" / ")}` : "Qualification for the FIFA World Cup"}
        right={selected && editions.length > 1
          ? <SeasonSelect years={editions.map(edition => ({ year: edition.year, label: String(edition.year + 1) }))} value={selected.year} onChange={setSelectedYear} />
          : undefined}
      />
      <Tabs tabs={tabs} value={activeTab} onChange={setTab} />
      {activeTab === "history"
        ? <History editions={editions} confederation={props.confederation} onSelect={year => { setSelectedYear(year); setTab(tabs[0]?.id ?? "history"); }} />
        : selected && region
          ? <PhaseContent phase={region.phases[activeTab]} edition={selected} phaseName={activeTab} phaseLabel={phases.find(phase => phase.id === activeTab)?.label ?? activeTab} />
          : <Panel><Empty>World Cup qualifying has not started yet.</Empty></Panel>}
    </div>
  );
}

export function WorldCupPage() {
  const editions = useGame().season.international.worldCup.editions.flatMap(edition => {
    const tournament = edition.tournament;
    if (!tournament) return [];
    return [{
      id: tournament.id,
      year: tournament.year,
      windowId: "WC",
      windowMatchday: 1,
      hosts: tournament.hosts,
      teams: tournament.teams,
      pots: tournament.pots,
      seedRanks: tournament.seedRanks,
      groups: tournament.groups,
      knockout: tournament.knockout?.map(round => ({
        label: round.label,
        matches: round.matches
      })) ?? null,
      completed: tournament.completed,
      winner: tournament.winner,
      runnerUp: tournament.runnerUp,
      semifinalists: tournament.semifinalists,
      playoffTeams: tournament.playoffTeams
    }];
  });
  return (
    <InternationalCupPage
      title="World Cup"
      subtitle="The FIFA World Cup"
      editions={editions}
      groupHighlights={{ 1: "bg-green-500/10", 2: "bg-green-500/10", 3: "bg-yellow-400/10" }}
      nthPlaceAdvancement={{ place: 3, advancingCount: 8, tieBreakers: ["goalsFor", "goalDifference"] }}
      groupQualifiedByConfederation
    />
  );
}
