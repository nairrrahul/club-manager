import { useState } from "react";
import { useGame, useGameStore } from "../../store/gameStore";
import { REGIONS, getCountriesByRegion, getNationName } from "../../engine/nations";
import { POSITION_ORDER } from "../../engine/formation";
import {
  MAX_ACTIVE_MISSIONS, LAST_SCOUT_SEND_MATCHDAY, getActiveMissionCount, getPlayerPotentialRange,
  getScoutSendBlockReason, getUnexpiredMissions
} from "../../engine/youthScouting";
import { Empty, NationTag, OvrBadge, PageHeader, Panel, PosBadge, RatingDots } from "../components/common";
import type { Position } from "../../engine/types";

function GodSelect(props: { value: number; which: "scouting" | "experience" | "training"; label: string }) {
  const setRating = useGameStore(s => s.godRating);
  return (
    <label className="flex items-center gap-2 text-xs text-navy-200">
      {props.label}
      <select className="input py-0.5 text-xs" value={props.value} onChange={e => setRating(props.which, Number(e.target.value))}>
        {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  );
}

const MAX_SCOUT_POSITIONS = 3;

function SendScout() {
  const game = useGame();
  const scout = useGameStore(s => s.scout);
  const team = game.managerTeam;
  const [region, setRegion] = useState("");
  const [country, setCountry] = useState("");
  const [positions, setPositions] = useState<Position[]>([]);

  const countries = region ? getCountriesByRegion(region) : [];
  const blockReason = getScoutSendBlockReason(team, game.season.matchday);
  const canSend = blockReason === null && country !== "";

  const togglePosition = (position: Position) =>
    setPositions(current =>
      current.includes(position)
        ? current.filter(p => p !== position)
        : current.length >= MAX_SCOUT_POSITIONS ? current : [...current, position]
    );

  return (
    <Panel title="Send a scout">
      <div className="p-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-navy-300 text-xs uppercase tracking-wider">Region</span>
            <select
              className="input w-full mt-1"
              value={region}
              onChange={e => { setRegion(e.target.value); setCountry(""); }}
            >
              <option value="">Select a region…</option>
              {REGIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-navy-300 text-xs uppercase tracking-wider">Country</span>
            <select
              className="input w-full mt-1"
              value={country}
              disabled={!region}
              onChange={e => setCountry(e.target.value)}
            >
              <option value="">{region ? "Select a country…" : "Choose a region first"}</option>
              {countries.map(item => <option key={item.code} value={item.code}>{item.name} ({item.code})</option>)}
            </select>
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-navy-300 text-xs uppercase tracking-wider">
              Positions to scout <span className="normal-case tracking-normal">(optional, max {MAX_SCOUT_POSITIONS} — leave empty for any position)</span>
            </span>
            {positions.length > 0 && (
              <button className="text-xs text-accent-purple-light hover:underline" onClick={() => setPositions([])}>Clear</button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {POSITION_ORDER.map(position => (
              <button
                key={position}
                onClick={() => togglePosition(position)}
                disabled={!positions.includes(position) && positions.length >= MAX_SCOUT_POSITIONS}
                className={`rounded px-2.5 py-1 text-xs font-bold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  positions.includes(position)
                    ? "bg-accent-yellow text-navy-950 border-accent-yellow"
                    : "bg-navy-900 border-navy-600 text-navy-100 hover:border-accent-purple"
                }`}
              >
                {position}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            className="btn-primary"
            disabled={!canSend}
            onClick={() => {
              if (scout(country, positions)) { setCountry(""); }
            }}
          >
            Send scout{country ? ` to ${getNationName(country)}` : ""}
          </button>
          {blockReason && <span className="text-xs text-accent-yellow">{blockReason}</span>}
        </div>
        <p className="text-xs text-navy-300">
          Missions take 4 matchdays. You can have up to {MAX_ACTIVE_MISSIONS} out at once, send several on the same matchday, and none after matchday {LAST_SCOUT_SEND_MATCHDAY}.
        </p>
      </div>
    </Panel>
  );
}

export default function Scouting() {
  const game = useGame();
  const sign = useGameStore(s => s.sign);
  const team = game.managerTeam;
  const missions = getUnexpiredMissions(team, game.season.matchday);
  const academyFull = (team.youthAcademySquad?.length ?? 0) >= team.maxYouthAcademySquadSize;

  return (
    <div>
      <PageHeader
        title="Youth Scouting"
        subtitle={`Active missions ${getActiveMissionCount(team)}/${MAX_ACTIVE_MISSIONS} · Academy ${team.youthAcademySquad?.length ?? 0}/${team.maxYouthAcademySquadSize}`}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <SendScout />

          <Panel title="Missions & reports">
            {missions.length === 0 ? (
              <Empty>No active scouting missions or returned reports.</Empty>
            ) : (
              <div className="divide-y divide-navy-700">
                {missions.map(mission => {
                  const candidates = mission.candidates.filter(candidate =>
                    (team.scoutedPlayers ?? []).some(p => p.id === candidate.id) ||
                    (team.youthAcademySquad ?? []).some(p => p.id === candidate.id)
                  );
                  return (
                    <div key={mission.id} className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-semibold">
                          <NationTag code={mission.countryCode} label="name" /> <span className="text-navy-300 font-normal text-sm">· mission {mission.id}</span>
                        </div>
                        <span className={`text-xs font-bold rounded px-2 py-0.5 ${mission.returned ? "bg-accent-yellow text-navy-950" : "bg-navy-600 text-white"}`}>
                          {mission.returned ? "Returned — sign before next matchday" : `Returns on matchday ${mission.returnMatchday}`}
                        </span>
                      </div>
                      {!mission.returned ? (
                        <p className="text-sm text-navy-300">
                          The scout is abroad. {mission.returnMatchday - game.season.matchday} matchday{mission.returnMatchday - game.season.matchday === 1 ? "" : "s"} to go.
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="tbl">
                            <thead>
                              <tr><th>Pos</th><th>Name</th><th className="num">Age</th><th>Nationality</th><th>Secondary</th><th className="num">OVR</th><th className="num">POT range</th><th>Status</th></tr>
                            </thead>
                            <tbody>
                              {candidates.map(player => {
                                const signed = (team.youthAcademySquad ?? []).some(p => p.id === player.id);
                                const range = getPlayerPotentialRange(player);
                                return (
                                  <tr key={player.id}>
                                    <td><PosBadge position={player.position} /></td>
                                    <td>{player.firstName} {player.lastName}</td>
                                    <td className="num">{player.age}</td>
                                    <td><NationTag code={player.primaryNationality} /></td>
                                    <td>{player.secondaryNationality ? <NationTag code={player.secondaryNationality} muted /> : <span className="text-navy-400">–</span>}</td>
                                    <td className="num"><OvrBadge value={player.overall} /></td>
                                    <td className="num">
                                      <span className="inline-flex items-center gap-1.5">
                                        <OvrBadge value={range.lower} />
                                        <span className="text-navy-300">–</span>
                                        <OvrBadge value={range.upper} />
                                      </span>
                                    </td>
                                    <td className="text-right">
                                      {signed
                                        ? <span className="text-xs font-bold text-accent-yellow">SIGNED</span>
                                        : <button className="btn-primary btn-sm" disabled={academyFull} onClick={() => sign(player.id)}>Sign to academy</button>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          {academyFull && <p className="text-xs text-accent-yellow mt-2">The youth academy is full ({team.maxYouthAcademySquadSize}).</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="px-4 pb-3 text-xs text-navy-300">
              Returned reports are only available on their return matchday.{" "}
              {game.season.freeAgents.autoSendUnsignedScouts === true
                ? "Unsigned candidates join the free agents when the next matchday is played."
                : "Unsigned candidates are discarded when the next matchday is played."}
            </p>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Scouting network">
            <dl className="divide-y divide-navy-700/60 text-sm">
              <div className="flex items-center justify-between px-4 py-2.5">
                <dt className="text-navy-300">Scouting rating</dt><dd><RatingDots value={team.scoutingRating} /></dd>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <dt className="text-navy-300">Scouting experience</dt><dd><RatingDots value={team.scoutingExperience} /></dd>
              </div>
            </dl>
            <p className="px-4 py-3 text-xs text-navy-300 border-t border-navy-700">
              Scouting rating raises the potential of the players found; experience raises how developed they already are.
            </p>
          </Panel>
          {game.godMode && (
            <Panel title="God Mode">
              <div className="p-4 space-y-3">
                <GodSelect label="Scouting rating" which="scouting" value={team.scoutingRating} />
                <GodSelect label="Scouting experience" which="experience" value={team.scoutingExperience} />
                <GodSelect label="Training rating" which="training" value={team.facilityRating} />
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
