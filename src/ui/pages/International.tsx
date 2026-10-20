import { useState } from "react";
import { useGame } from "../../store/gameStore";
import { seasonDisplay } from "../../engine/constants";
import type { InternationalMatch, WindowRecord } from "../../engine/international";
import { Empty, NationLink, PageHeader, Panel, SeasonSelect } from "../components/common";

function change(value: number | null): string {
  if (value === null) return "";
  const text = Math.abs(value).toFixed(2);
  return value > 0 ? `+${text}` : value < 0 ? `-${text}` : text;
}

function FixtureRow(props: { match: InternationalMatch }) {
  const { match } = props;
  const played = match.homeGoals !== null && match.awayGoals !== null;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-3 py-1.5 border-b border-navy-700/60 text-sm">
      <div className="flex items-center justify-end gap-2">
        {played && <span className={`text-xs tabular-nums ${match.homeChange! > 0 ? "text-accent-yellow" : "text-navy-300"}`}>{change(match.homeChange)}</span>}
        <NationLink code={match.home} />
      </div>
      <div className="min-w-[4.5rem] text-center font-bold tabular-nums bg-navy-900 rounded px-2 py-0.5">
        {played ? `${match.homeGoals}-${match.awayGoals}` : "–"}
      </div>
      <div className="flex items-center gap-2">
        <NationLink code={match.away} />
        {played && <span className={`text-xs tabular-nums ${match.awayChange! > 0 ? "text-accent-yellow" : "text-navy-300"}`}>{change(match.awayChange)}</span>}
      </div>
    </div>
  );
}

function WindowView(props: { window: WindowRecord }) {
  const { window } = props;
  const played = window.status === "played";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm text-navy-200">
        <span className="font-semibold text-white">{window.label}</span>
        <span>{window.windowId === "IW6" ? "After the season" : `After matchday ${window.afterMatchday}`}</span>
        <span className={`text-xs font-bold rounded px-2 py-0.5 ${played ? "bg-navy-600 text-white" : "bg-accent-yellow text-navy-950"}`}>
          {played ? "Played" : "Scheduled"}
        </span>
      </div>
      {window.rounds.map((round, index) => (
        <Panel
          key={index}
          title={`Friendlies — set ${index + 1}`}
          right={round.leftOut ? <span className="text-navy-300 flex items-center gap-1.5">No match: <NationLink code={round.leftOut} /></span> : undefined}
        >
          <div className="max-h-[60vh] overflow-y-auto">
            {round.matches.map((match, i) => <FixtureRow key={i} match={match} />)}
          </div>
        </Panel>
      ))}
    </div>
  );
}

export default function International() {
  const game = useGame();
  const windows = game.season.international.windows;
  const years = [...new Set(windows.map(window => window.year))];
  if (!years.includes(game.season.year)) years.push(game.season.year);
  years.sort((a, b) => a - b);

  const [year, setYear] = useState(years[years.length - 1]);
  const ofYear = windows.filter(window => window.year === year);
  const [windowId, setWindowId] = useState<string | null>(null);
  const selected = ofYear.find(window => window.windowId === windowId) ?? ofYear[ofYear.length - 1] ?? null;

  return (
    <div>
      <PageHeader
        title="International Windows"
        subtitle="Friendlies played during the international breaks"
        right={
          <SeasonSelect
            years={years.map(y => ({ year: y, label: seasonDisplay(y) }))}
            value={year}
            onChange={y => { setYear(y); setWindowId(null); }}
          />
        }
      />

      {ofYear.length === 0 ? (
        <Panel>
          <Empty>No international window has taken place in {seasonDisplay(year)} yet. The first window follows matchday 2.</Empty>
        </Panel>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {ofYear.map(window => (
              <button
                key={window.windowId}
                onClick={() => setWindowId(window.windowId)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium border ${
                  selected?.windowId === window.windowId
                    ? "bg-accent-purple border-accent-purple-light text-white"
                    : "bg-navy-900 border-navy-600 text-navy-100 hover:border-accent-purple"
                }`}
              >
                {window.windowId === "IW6" ? "Post-season" : `After MD ${window.afterMatchday}`}
                {window.status === "scheduled" && <span className="ml-1.5 text-accent-yellow">●</span>}
              </button>
            ))}
          </div>
          {selected && <WindowView key={`${selected.year}-${selected.windowId}`} window={selected} />}
        </>
      )}
    </div>
  );
}
