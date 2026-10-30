import { useState } from "react";
import { getNationName } from "../../engine/nations";
import { getInternationalCupStandings } from "../../engine/goldCup";
import type { GoldCupEdition } from "../../engine/goldCup";
import { seasonDisplay } from "../../engine/constants";
import { Empty, NationLink, PageHeader, Panel, SeasonSelect, Tabs } from "../components/common";
import { CupBracketTree } from "../components/brackets";
import { InternationalGroupTable } from "../components/tables";
import type { CupSnap, TeamRef } from "../../engine/snapshots";

type Tab = "draw" | "groups" | "knockout" | "history";

interface InternationalCupPageProps {
  title: string;
  subtitle: string;
  editions: GoldCupEdition[];
}

function Fixture(props: { home: string; away: string; goalsHome: number | null; goalsAway: number | null }) {
  const { home, away, goalsHome, goalsAway } = props;
  const played = goalsHome !== null && goalsAway !== null;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-3 py-2 border-b border-navy-700/60 text-sm">
      <div className="flex justify-end"><NationLink code={home} /></div>
      <div className="text-center font-bold tabular-nums bg-navy-900 rounded px-2 py-0.5 min-w-16">
        {played ? `${goalsHome}-${goalsAway}` : "–"}
      </div>
      <div className="flex items-center gap-2"><NationLink code={away} /></div>
    </div>
  );
}

function GroupPanel(props: { edition: GoldCupEdition; group: GoldCupEdition["groups"][number] }) {
  const rows = getInternationalCupStandings(props.edition, props.group);
  return (
    <Panel title={`Group ${props.group.name}`}>
      <InternationalGroupTable rows={rows} highlights={{ 1: "bg-green-500/10", 2: "bg-green-500/10" }} />
      <div className="border-t border-navy-700">
        {props.group.matches.map((round, roundIndex) => (
          <details key={roundIndex} className="group border-b last:border-b-0 border-navy-700/60">
            <summary className="cursor-pointer list-none px-3 py-3 text-xs font-bold uppercase tracking-wider text-navy-300 hover:text-white">
              <span className="inline-flex items-center gap-2">
                <span className="text-[10px] transition-transform group-open:rotate-90">▶</span>
                Matchday {roundIndex + 1}
              </span>
            </summary>
            {round.map((match, index) => (
              <Fixture key={index} home={match.home} away={match.away} goalsHome={match.homeGoals} goalsAway={match.awayGoals} />
            ))}
          </details>
        ))}
      </div>
    </Panel>
  );
}

function DrawResults(props: { title: string; edition: GoldCupEdition }) {
  const { edition } = props;
  const hosts = new Set(edition.hosts);
  return (
    <div className="space-y-5">
      <Panel title={`Qualified teams · ${edition.teams.length}`}>
        <div className="flex flex-wrap gap-x-4 gap-y-2 p-3">
          {edition.teams.map(code => <NationLink key={code} code={code} />)}
        </div>
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={`${props.title} pots`}>
          <div className="divide-y divide-navy-700/60">
            {edition.pots.map((pot, index) => (
              <details key={index} className="group" open={index === 0}>
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-3 text-xs font-bold uppercase tracking-wider text-navy-300 hover:text-white">
                  <span className="text-[10px] transition-transform group-open:rotate-90">▶</span>
                  Pot {index + 1}
                </summary>
                <div className="divide-y divide-navy-700/40">
                  {pot.map(code => (
                    <div key={code} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <NationLink code={code} />
                      {hosts.has(code) && (
                        <span className="rounded bg-amber-400 px-2 py-0.5 text-xs font-bold text-black">Host</span>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </Panel>
        <Panel title="Groups drawn">
          <div className="grid max-w-[52rem] grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {edition.groups.map(group => (
              <table key={group.name} className="tbl w-full max-w-64 overflow-hidden rounded border border-navy-600">
                <thead>
                  <tr><th>Group {group.name}</th></tr>
                </thead>
                <tbody>
                  {group.teams.map(code => (
                    <tr key={code}><td><NationLink code={code} /></td></tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function toTeamRef(code: string, edition: GoldCupEdition): TeamRef {
  return { id: edition.teams.indexOf(code) + 1, name: code, countrycode: code };
}

function toCupSnap(edition: GoldCupEdition): CupSnap {
  return {
    rounds: (edition.knockout ?? []).map((round, roundIndex) => ({
      round: roundIndex + 1,
      label: round.label,
      matchday: edition.windowMatchday,
      matches: round.matches.map(match => ({
        id: match.id,
        home: toTeamRef(match.home, edition),
        away: toTeamRef(match.away, edition),
        score: match.fixture.homeGoals === null || match.fixture.awayGoals === null
          ? null
          : {
              h: match.fixture.homeGoals,
              a: match.fixture.awayGoals,
              ...(match.fixture.homePenalties && match.fixture.awayPenalties
                ? {
                    ph: match.fixture.homePenalties.filter(kick => kick === "O").length,
                    pa: match.fixture.awayPenalties.filter(kick => kick === "O").length
                  }
                : {})
            },
        winner: match.winner ? toTeamRef(match.winner, edition) : null,
        bye: false
      }))
    })),
    complete: edition.completed,
    winner: edition.winner ? toTeamRef(edition.winner, edition) : null,
    runnerUp: edition.runnerUp ? toTeamRef(edition.runnerUp, edition) : null
  };
}

function getSemifinalLosers(edition: GoldCupEdition): string[] {
  const semiFinals = edition.knockout?.find(round => round.label === "Semi-finals");
  if (!semiFinals) return edition.semifinalists;
  return semiFinals.matches.flatMap(match => {
    if (!match.winner) return [];
    return [match.winner === match.home ? match.away : match.home];
  });
}

function HistoryTable(props: { title: string; editions: GoldCupEdition[]; onSelect: (year: number) => void }) {
  const completed = [...props.editions].filter(edition => edition.completed).sort((a, b) => b.year - a.year);
  if (completed.length === 0) return <Panel><Empty>No completed {props.title} editions yet.</Empty></Panel>;
  return (
    <Panel title={`${props.title} history`}>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Year</th><th>Hosts</th><th>Winner</th><th>Runner-up</th><th>Semi-finalists</th><th></th></tr></thead>
          <tbody>
            {completed.map(edition => (
              <tr key={edition.id}>
                <td className="font-semibold">{edition.year + 1}</td>
                <td>{edition.hosts.map(getNationName).join(" / ")}</td>
                <td>{edition.winner && <NationLink code={edition.winner} />}</td>
                <td>{edition.runnerUp && <NationLink code={edition.runnerUp} />}</td>
                <td><div className="flex flex-wrap gap-x-3 gap-y-1">
                  {getSemifinalLosers(edition).map(code => <NationLink key={code} code={code} />)}
                </div></td>
                <td className="text-right"><button className="btn-ghost btn-sm" onClick={() => props.onSelect(edition.year)}>View edition</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export default function InternationalCupPage(props: InternationalCupPageProps) {
  const { title, subtitle, editions } = props;
  const latest = editions.at(-1) ?? null;
  const [tab, setTab] = useState<Tab>("groups");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const year = selectedYear ?? latest?.year ?? 2026;
  const selected = editions.find(edition => edition.year === year) ?? latest;
  const years = [...new Set(editions.map(edition => edition.year))].sort((a, b) => a - b);
  if (!years.includes(year)) years.push(year);

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={selected
          ? `${selected.year+1} · ${selected.completed ? `Champions: ${getNationName(selected.winner)}` : selected.knockout ? "Knockout stage" : "Group stage"} · Hosts: ${selected.hosts.map(getNationName).join(" / ")}`
          : subtitle}
        right={years.length > 1 ? <SeasonSelect years={years.map(value => ({ year: value, label: String(value+1) }))} value={year} onChange={setSelectedYear} /> : undefined}
      />
      <Tabs
        tabs={[
          { id: "draw", label: "Draw Results" },
          { id: "groups", label: "Group Stage" },
          { id: "knockout", label: "Knockout bracket" },
          { id: "history", label: "History" }
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "draw" && (!selected
        ? <Panel><Empty>The {title} draw has not been made yet.</Empty></Panel>
        : <DrawResults title={title} edition={selected} />
      )}
      {tab === "groups" && (!selected
        ? <Panel><Empty>The {title} group stage has not been drawn yet.</Empty></Panel>
        : <div className="space-y-5">
          <div className="grid gap-4 xl:grid-cols-2">{selected.groups.map(group => <GroupPanel key={group.name} edition={selected} group={group} />)}</div>
        </div>
      )}
      {tab === "knockout" && (!selected?.knockout
        ? <Panel><Empty>The knockout bracket is drawn after all group matches have been played.</Empty></Panel>
        : <CupBracketTree cup={toCupSnap(selected)} nationTeams showFlag />
      )}
      {tab === "history" && <HistoryTable
        title={title}
        editions={editions}
        onSelect={selectedEditionYear => { setSelectedYear(selectedEditionYear); setTab("groups"); }}
      />}
    </div>
  );
}
