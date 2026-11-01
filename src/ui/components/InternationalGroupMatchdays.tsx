import { NationLink } from "./common";

interface InternationalGroupMatch {
  home: string;
  away: string;
  homeGoals: number | null;
  awayGoals: number | null;
}

function Fixture(props: InternationalGroupMatch) {
  const { home, away, homeGoals, awayGoals } = props;
  const played = homeGoals !== null && awayGoals !== null;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-navy-700/60 px-3 py-2 text-sm">
      <div className="flex justify-end"><NationLink code={home} /></div>
      <div className="min-w-16 rounded bg-navy-900 px-2 py-0.5 text-center font-bold tabular-nums">
        {played ? `${homeGoals}-${awayGoals}` : "–"}
      </div>
      <div className="flex items-center gap-2"><NationLink code={away} /></div>
    </div>
  );
}

export function InternationalGroupMatchdays(props: { rounds: InternationalGroupMatch[][] }) {
  return (
    <div className="border-t border-navy-700">
      {props.rounds.map((round, roundIndex) => (
        <details key={roundIndex} className="group border-b border-navy-700/60 last:border-b-0">
          <summary className="list-none cursor-pointer px-3 py-3 text-xs font-bold uppercase tracking-wider text-navy-300 hover:text-white">
            <span className="inline-flex items-center gap-2">
              <span className="text-[10px] transition-transform group-open:rotate-90">▶</span>
              Matchday {roundIndex + 1}
            </span>
          </summary>
          {round.map((match, index) => <Fixture key={index} {...match} />)}
        </details>
      ))}
    </div>
  );
}
