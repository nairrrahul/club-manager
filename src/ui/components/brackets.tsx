import { TeamLink } from "./common";
import { FlagIcon } from "./FlagIcon";
import { isPenaltiesOnly } from "../../engine/snapshots";
import type { CupMatchSnap, CupSnap, EuroRoundSnap, EuroTieSnap, TeamRef } from "../../engine/snapshots";

function TeamRow(props: {
  team: TeamRef | null;
  winner: boolean;
  decided: boolean;
  cells: (string | number)[];
  highlightID?: number;
  showFlag?: boolean;
}) {
  const mine = props.team && props.highlightID === props.team.id;
  return (
    <div
      className={`flex items-center justify-between gap-2 px-2 py-1 ${
        props.winner ? "bg-accent-purple/25 font-semibold" : props.decided ? "text-navy-300" : ""
      } ${mine ? "outline outline-1 outline-accent-yellow -outline-offset-1" : ""}`}
    >
      <span className="truncate">
        {props.team ? (
          <span className="inline-flex items-center gap-1.5">
            {props.showFlag !== false && props.team.countrycode && <FlagIcon code={props.team.countrycode} size={0.85} />}
            <TeamLink team={props.team} />
          </span>
        ) : <span className="text-navy-400">TBD</span>}
      </span>
      <span className="flex gap-2 tabular-nums">
        {props.cells.map((cell, i) => (
          <span key={i} className="w-5 text-right">{cell}</span>
        ))}
      </span>
    </div>
  );
}

export function CupMatchCard(props: { match: CupMatchSnap; highlightID?: number; showFlag?: boolean }) {
  const { match } = props;
  if (match.bye) {
    const team = match.home ?? match.away;
    return (
      <div className="bg-navy-900 border border-navy-700 rounded text-xs w-56">
        <div className="px-2 py-1 flex justify-between">
          <span className="truncate inline-flex items-center gap-1.5">
            {props.showFlag !== false && team?.countrycode && <FlagIcon code={team.countrycode} size={0.85} />}
            {team ? <TeamLink team={team} /> : "TBD"}
          </span>
          <span className="text-navy-300">BYE</span>
        </div>
      </div>
    );
  }
  const decided = match.score !== null;
  const homeWon = decided && match.winner?.id === match.home?.id;
  const awayWon = decided && match.winner?.id === match.away?.id;
  const legs = match.legs;
  const tiebreak = match.tiebreak;
  if (legs && match.aggregate) {
    const homeCells = [
      legs[0]?.h ?? "·",
      legs[1]?.h ?? "·",
      match.aggregate.h
    ];
    const awayCells = [
      legs[0]?.a ?? "·",
      legs[1]?.a ?? "·",
      match.aggregate.a
    ];
    return (
      <div className="bg-navy-900 border border-navy-700 rounded text-xs w-60 overflow-hidden">
        <TeamRow
          team={match.home}
          winner={homeWon}
          decided={decided}
          cells={homeCells}
          highlightID={props.highlightID}
          showFlag={props.showFlag}
        />
        <TeamRow
          team={match.away}
          winner={awayWon}
          decided={decided}
          cells={awayCells}
          highlightID={props.highlightID}
          showFlag={props.showFlag}
        />
        {tiebreak && (
          <div className="px-2 py-0.5 text-[10px] text-navy-300 border-t border-navy-700">
            {isPenaltiesOnly(tiebreak)
              ? `Penalties ${tiebreak.ph}-${tiebreak.pa}`
              : `Tiebreak ${tiebreak.h}-${tiebreak.a}${tiebreak.ph !== undefined ? ` (${tiebreak.ph}-${tiebreak.pa} PSO)` : ""}`}
          </div>
        )}
      </div>
    );
  }
  const pso = match.score && match.score.ph !== undefined && match.score.pa !== undefined;
  return (
    <div className="bg-navy-900 border border-navy-700 rounded text-xs w-56 overflow-hidden">
      <TeamRow
        team={match.home}
        winner={homeWon}
        decided={decided}
        highlightID={props.highlightID}
        showFlag={props.showFlag}
        cells={decided ? [match.score!.h, ...(pso ? [`(${match.score!.ph})`] : [])] : []}
      />
      <TeamRow
        team={match.away}
        winner={awayWon}
        decided={decided}
        highlightID={props.highlightID}
        showFlag={props.showFlag}
        cells={decided ? [match.score!.a, ...(pso ? [`(${match.score!.pa})`] : [])] : []}
      />
    </div>
  );
}

/** Full single-elimination tree: one column per round, matches vertically centred. */
export function CupBracketTree(props: { cup: CupSnap; highlightID?: number; showFlag?: boolean }) {
  return (
    <div className="overflow-auto max-h-[75vh] pb-2">
      <div className="flex gap-6 min-w-max">
        {props.cup.rounds.map(round => (
          <div key={round.round} className="flex flex-col">
            <div className="text-center mb-2 sticky top-0 bg-navy-950 py-1 z-10">
              <div className="text-sm font-semibold">{round.label}</div>
              <div className="text-[11px] text-navy-300">Matchday {round.matchday}</div>
            </div>
            <div className="flex flex-col justify-around flex-1 gap-2">
              {round.matches.map(match => (
                <CupMatchCard key={match.id} match={match} highlightID={props.highlightID} showFlag={props.showFlag} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EuroTieCard(props: { tie: EuroTieSnap; round: EuroRoundSnap; highlightID?: number }) {
  const { tie } = props;
  if (tie.bye) {
    const team = tie.home ?? tie.away;
    return (
      <div className="bg-navy-900 border border-navy-700 rounded text-xs w-60">
        <div className="px-2 py-1 flex justify-between">
          <span className="truncate inline-flex items-center gap-1.5">
            {team?.countrycode && <FlagIcon code={team.countrycode} size={0.85} />}
            {team ? <TeamLink team={team} /> : "TBD"}
          </span>
          <span className="text-navy-300">BYE</span>
        </div>
      </div>
    );
  }

  const decided = tie.winner !== null;
  const twoLegs = props.round.matchdays.length === 2;
  const homeCells: (string | number)[] = [];
  const awayCells: (string | number)[] = [];
  tie.legs.forEach(leg => {
    homeCells.push(leg.score.h);
    awayCells.push(leg.score.a);
  });
  if (twoLegs && tie.legs.length < 2) {
    for (let i = tie.legs.length; i < 2; i++) { homeCells.push("·"); awayCells.push("·"); }
  }
  if (tie.aggregate) {
    homeCells.push(tie.aggregate.h);
    awayCells.push(tie.aggregate.a);
  }
  if (!twoLegs && tie.legs[0]?.score.ph !== undefined) {
    homeCells.push(`(${tie.legs[0].score.ph})`);
    awayCells.push(`(${tie.legs[0].score.pa})`);
  }

  return (
    <div className="bg-navy-900 border border-navy-700 rounded text-xs w-60 overflow-hidden">
      <TeamRow team={tie.home} winner={decided && tie.winner?.id === tie.home?.id} decided={decided} cells={homeCells} highlightID={props.highlightID} />
      <TeamRow team={tie.away} winner={decided && tie.winner?.id === tie.away?.id} decided={decided} cells={awayCells} highlightID={props.highlightID} />
      {tie.tiebreak && (
        <div className="px-2 py-0.5 text-[10px] text-navy-300 border-t border-navy-700">
          {isPenaltiesOnly(tie.tiebreak)
            ? `Penalties ${tie.tiebreak.ph}-${tie.tiebreak.pa}`
            : `Tiebreak ${tie.tiebreak.h}-${tie.tiebreak.a}${tie.tiebreak.ph !== undefined ? ` (${tie.tiebreak.ph}-${tie.tiebreak.pa} PSO)` : ""}`}
        </div>
      )}
    </div>
  );
}

export function EuroBracketTree(props: { rounds: EuroRoundSnap[]; highlightID?: number }) {
  return (
    <div className="overflow-auto max-h-[75vh] pb-2">
      <div className="flex gap-6 min-w-max">
        {props.rounds.map(round => (
          <div key={round.key} className="flex flex-col">
            <div className="text-center mb-2 sticky top-0 bg-navy-950 py-1 z-10">
              <div className="text-sm font-semibold">{round.label}</div>
              <div className="text-[11px] text-navy-300">
                Matchday{round.matchdays.length > 1 ? "s" : ""} {round.matchdays.join(" / ")}
              </div>
            </div>
            <div className="flex flex-col justify-around flex-1 gap-2">
              {round.ties.map(tie => (
                <EuroTieCard key={tie.id} tie={tie} round={round} highlightID={props.highlightID} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
