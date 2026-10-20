import { useMemo, useState } from "react";
import teamsJson from "../../engine/data/teams.json";
import { useGameStore } from "../../store/gameStore";
import { LEAGUE_NAMES } from "../../engine/constants";
import { OvrBadge } from "../components/common";
import { normalizeText } from "../format";
import { LoadGameButton } from "../components/SaveLoad";

interface RawTeam { ID: number; Team: string; Overall: number; Tier: number }

export default function TeamSelect() {
  const startGame = useGameStore(s => s.startGame);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<RawTeam | null>(null);

  const tiers = useMemo(() => {
    const teams = teamsJson as RawTeam[];
    const query = normalizeText(filter.trim());
    const byTier: Record<number, RawTeam[]> = {};
    for (const team of teams) {
      if (query && !normalizeText(team.Team).includes(query)) continue;
      (byTier[team.Tier] ??= []).push(team);
    }
    for (const list of Object.values(byTier)) list.sort((a, b) => b.Overall - a.Overall || a.Team.localeCompare(b.Team));
    return byTier;
  }, [filter]);

  return (
    <div className="min-h-full bg-navy-950">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-widest text-accent-yellow">Soccer Season Simulator</div>
            <LoadGameButton className="btn-ghost" label="Load saved game" />
          </div>
          <h1 className="text-4xl font-bold mt-1">Choose your club</h1>
          <p className="text-navy-200 mt-2 max-w-2xl">
            Pick any team in the English pyramid to manage. You'll receive a generated 25-player squad and take charge from matchday 0 of the 2026-27 season.
          </p>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <input
            className="input w-72"
            placeholder="Filter teams…"
            value={filter}
            onChange={event => setFilter(event.target.value)}
          />
          <div className="flex-1" />
          {selected && (
            <div className="flex items-center gap-3 panel px-4 py-2">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-navy-300">Selected</div>
                <div className="font-semibold">{selected.Team}</div>
              </div>
              <button className="btn-yellow" onClick={() => startGame(selected.ID)}>Start managing ▸</button>
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Object.keys(LEAGUE_NAMES).map(tierKey => {
            const tier = Number(tierKey);
            const teams = tiers[tier] ?? [];
            if (teams.length === 0) return null;
            return (
              <section key={tier} className="panel overflow-hidden">
                <div className="panel-title">{LEAGUE_NAMES[tier]}</div>
                <ul>
                  {teams.map(team => (
                    <li key={team.ID}>
                      <button
                        onClick={() => setSelected(team)}
                        onDoubleClick={() => startGame(team.ID)}
                        className={`w-full flex items-center justify-between px-4 py-1.5 text-sm text-left border-b border-navy-700/60 ${
                          selected?.ID === team.ID ? "bg-accent-purple/30" : "hover:bg-navy-700/60"
                        }`}
                      >
                        <span>{team.Team}</span>
                        <OvrBadge value={team.Overall} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
