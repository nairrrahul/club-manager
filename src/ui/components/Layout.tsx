import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useGame, useGameStore } from "../../store/gameStore";
import { LEAGUE_NAMES, CUP_NAME, SEASON_END_MATCHDAY, seasonDisplay } from "../../engine/constants";
import { COMPETITION_NAMES } from "../../engine/europeanCompetitions";
import { isSeasonComplete } from "../../engine/season";
import { runSearch } from "../search";
import type { SearchResult } from "../search";
import { Modal, NationTag, PlayerLink, PosBadge } from "./common";
import { getYouthPlayersAgingOut } from "../../engine/playerSquad";
import { LoadGameButton, SaveGameButton } from "./SaveLoad";
import { getPendingWindow } from "../../engine/game";

function navClass({ isActive }: { isActive: boolean }): string {
  return `flex items-center gap-2 px-4 py-1.5 text-sm border-l-4 transition-colors ${
    isActive
      ? "bg-navy-700 border-accent-yellow text-white font-semibold"
      : "border-transparent text-navy-200 hover:bg-navy-800 hover:text-white"
  }`;
}

function NavSection(props: { title: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <div className="px-4 pb-1 text-[10px] font-bold uppercase tracking-widest text-navy-400">{props.title}</div>
      {props.children}
    </div>
  );
}

function Sidebar() {
  const game = useGame();
  return (
    <aside className="w-56 shrink-0 bg-navy-900 border-r border-navy-700 flex flex-col overflow-y-auto">
      <div className="px-4 py-4 border-b border-navy-700">
        <div className="text-[10px] uppercase tracking-widest text-accent-yellow font-bold">Manager</div>
        <div className="font-bold leading-tight mt-0.5">{game.managerTeam.Team}</div>
      </div>
      <nav className="py-2 flex-1">
        <NavLink to="/" end className={navClass}>Home</NavLink>
        <NavSection title="Club">
          <NavLink to="/squad" className={navClass}>Squad</NavLink>
          <NavLink to="/academy" className={navClass}>Youth Academy</NavLink>
          <NavLink to="/scouting" className={navClass}>Scouting</NavLink>
          <NavLink to="/free-agents" className={navClass}>Free Agents</NavLink>
          <NavLink to={`/team/${game.managerTeam.ID}`} className={navClass}>Club Info</NavLink>
        </NavSection>
        <NavSection title="Shortlist">
          <NavLink to="/shortlist" className={navClass}>Shortlist</NavLink>
          <NavLink to="/player-search" className={navClass}>Player Search</NavLink>
        </NavSection>
        <NavSection title="Leagues">
          {Object.entries(LEAGUE_NAMES).map(([tier, name]) => (
            <NavLink key={tier} to={`/league/${tier}`} className={navClass}>{name}</NavLink>
          ))}
        </NavSection>
        <NavSection title="International">
          <NavLink to="/rankings" className={navClass}>World Rankings</NavLink>
          <NavLink to="/international" className={navClass}>International Windows</NavLink>
        </NavSection>
        <NavSection title="Cups">
          <NavLink to="/cup" className={navClass}>{CUP_NAME}</NavLink>
        </NavSection>
        <NavSection title="Europe">
          {Object.entries(COMPETITION_NAMES).map(([code, name]) => (
            <NavLink key={code} to={`/europe/${code}`} className={navClass}>{name}</NavLink>
          ))}
        </NavSection>
        {game.godMode && (
          <NavSection title="God Mode">
            <NavLink to="/add-player" className={navClass}>Add Player</NavLink>
          </NavSection>
        )}
      </nav>
      <div className="p-3 border-t border-navy-700 grid grid-cols-2 gap-2">
        <SaveGameButton className="btn-ghost btn-sm" />
        <LoadGameButton className="btn-ghost btn-sm" confirmReplace />
      </div>
    </aside>
  );
}

function SearchBar() {
  const game = useGame();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);

  const results: SearchResult[] = open ? runSearch(game, query) : [];

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const choose = (result: SearchResult) => {
    navigate(result.to);
    setQuery("");
    setOpen(false);
  };

  const kindLabel: Record<SearchResult["kind"], string> = {
    competition: "Competitions", nation: "Nations", team: "Teams", player: "Players"
  };

  return (
    <div ref={wrapper} className="relative w-80 max-w-full">
      <input
        className="input w-full"
        placeholder="Search players, teams, competitions…"
        value={query}
        onChange={event => { setQuery(event.target.value); setOpen(true); setHighlight(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={event => {
          if (event.key === "ArrowDown") { event.preventDefault(); setHighlight(h => Math.min(h + 1, results.length - 1)); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
          else if (event.key === "Enter" && results[highlight]) choose(results[highlight]);
          else if (event.key === "Escape") setOpen(false);
        }}
      />
      {open && query.trim() !== "" && (
        <div className="absolute left-0 right-0 top-full mt-1 panel shadow-xl max-h-[70vh] overflow-y-auto z-40">
          {results.length === 0 && <div className="px-3 py-3 text-sm text-navy-300">No results.</div>}
          {results.map((result, index) => {
            const showHeader = index === 0 || results[index - 1].kind !== result.kind;
            return (
              <div key={result.key}>
                {showHeader && (
                  <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-navy-400">
                    {kindLabel[result.kind]}
                  </div>
                )}
                <button
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => choose(result)}
                  className={`w-full text-left px-3 py-1.5 ${index === highlight ? "bg-navy-600" : ""}`}
                >
                  <div className="text-sm">{result.label}</div>
                  <div className="text-xs text-navy-300">{result.sub}</div>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SimControls() {
  const game = useGame();
  const advance = useGameStore(s => s.advance);
  const finish = useGameStore(s => s.finish);
  const nextSeason = useGameStore(s => s.nextSeason);
  const simulateWindow = useGameStore(s => s.simulateWindow);
  const [count, setCount] = useState("5");
  const { season } = game;
  // With manual windows, an open window must be simulated before play can continue.
  const pendingWindow = getPendingWindow(game);
  const waitingForWindow = pendingWindow !== null && pendingWindow.explicit;
  const complete = isSeasonComplete(season);
  const playoffsDone = season.promotionPlayoffs !== null;

  const parsed = /^\d+$/.test(count) ? Number(count) : 0;

  return (
    <div className="flex items-center gap-2">
      <div className="text-right mr-1">
        <div className="text-[10px] uppercase tracking-widest text-navy-300">Season {seasonDisplay(season.year)}</div>
        <div className="text-sm font-semibold tabular-nums">
          Matchday {season.matchday}<span className="text-navy-300">/{SEASON_END_MATCHDAY}</span>
          {waitingForWindow && <span className="ml-2 text-accent-yellow text-xs font-bold uppercase tracking-wider">International break</span>}
        </div>
      </div>
      {waitingForWindow && (
        <>
          <button className="btn-yellow" onClick={simulateWindow}>Simulate window ▸</button>
          <Link to="/international" className="btn-ghost">View window</Link>
        </>
      )}
      {!waitingForWindow && !complete && (
        <>
          <button className="btn-primary" onClick={() => advance(1)}>Continue ▸</button>
          <div className="flex items-center">
            <input
              className="input w-14 rounded-r-none text-center"
              value={count}
              onChange={event => setCount(event.target.value.replace(/[^\d]/g, ""))}
              aria-label="Matchdays to simulate"
            />
            <button className="btn-ghost rounded-l-none" disabled={parsed < 1} onClick={() => advance(parsed)}>
              Play
            </button>
          </div>
          <button className="btn-ghost" onClick={finish} title="Simulate the rest of the season, including promotion play-offs">
            Finish season
          </button>
        </>
      )}
      {!waitingForWindow && complete && !playoffsDone && (
        <button className="btn-yellow" onClick={finish}>Play promotion play-offs</button>
      )}
      {!waitingForWindow && complete && playoffsDone && (
        <button className="btn-yellow" onClick={nextSeason}>Start next season ▸</button>
      )}
    </div>
  );
}

/** Auto: windows are played as part of Continue. Manual: you press "Simulate window" during each break. */
function WindowModeToggle() {
  const game = useGame();
  const setExplicit = useGameStore(s => s.explicitWindows);
  const manual = game.season.international.explicitWindows;
  return (
    <button
      onClick={() => setExplicit(!manual)}
      title={manual
        ? "International windows are simulated manually. Click to simulate them automatically."
        : "International windows are simulated automatically when you continue. Click to simulate them manually."}
      className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider border ${
        manual
          ? "bg-accent-purple text-white border-accent-purple-light"
          : "bg-navy-800 text-navy-200 border-navy-600 hover:text-white"
      }`}
    >
      ✈ Windows: {manual ? "Manual" : "Auto"}
    </button>
  );
}

/** Off (default): unsigned youth-scouting candidates are lost. On: they become free agents. */
function ScoutFreeAgentToggle() {
  const game = useGame();
  const setAutoSend = useGameStore(s => s.autoSendScouts);
  const on = game.season.freeAgents.autoSendUnsignedScouts === true;
  return (
    <button
      onClick={() => setAutoSend(!on)}
      title={on
        ? "Unsigned youth-scouting candidates are sent to the free agents. Click to discard them instead."
        : "Unsigned youth-scouting candidates are discarded. Click to send them to the free agents instead."}
      className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider border ${
        on
          ? "bg-accent-purple text-white border-accent-purple-light"
          : "bg-navy-800 text-navy-200 border-navy-600 hover:text-white"
      }`}
    >
      Scouts → FA: {on ? "On" : "Off"}
    </button>
  );
}

function GodModeToggle() {
  const game = useGame();
  const godMode = useGameStore(s => s.godMode);
  const locked = useLocation().pathname === "/add-player";
  return (
    <button
      onClick={() => godMode(!game.godMode)}
      disabled={locked}
      title={locked ? "Leave the Add Player page to turn off God Mode" : "Toggle God Mode"}
      className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider border ${
        game.godMode
          ? "bg-accent-yellow text-navy-950 border-accent-yellow"
          : "bg-navy-800 text-navy-200 border-navy-600"
      } ${locked ? "opacity-50 cursor-not-allowed" : "hover:text-white"}`}
    >
      <span className={`w-2 h-2 rounded-full ${game.godMode ? "bg-navy-950" : "bg-navy-500"}`} />
      God Mode
    </button>
  );
}

function Toasts() {
  useGame();
  const toasts = useGameStore(s => s.toasts);
  const dismiss = useGameStore(s => s.dismissToast);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map(toast => setTimeout(() => dismiss(toast.id), toast.kind === "error" ? 7000 : 5000));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-96 max-w-[90vw]">
      {toasts.map(toast => (
        <div
          key={toast.id}
          onClick={() => dismiss(toast.id)}
          className={`rounded-lg px-4 py-3 text-sm shadow-xl cursor-pointer border ${
            toast.kind === "error" ? "bg-navy-800 border-accent-yellow text-white"
            : toast.kind === "info" ? "bg-accent-purple border-accent-purple-light text-white"
            : "bg-navy-700 border-navy-500 text-white"
          }`}
        >
          {toast.kind === "error" && <span className="text-accent-yellow font-bold mr-1.5">!</span>}
          {toast.text}
          {toast.link && (
            <Link
              to={toast.link.to}
              onClick={event => event.stopPropagation()}
              className="link ml-2 font-semibold"
            >
              {toast.link.label}
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}

function AgingOutModal() {
  const game = useGame();
  const open = useGameStore(s => s.agingOutOpen);
  const setOpen = useGameStore(s => s.setAgingOutOpen);
  const promote = useGameStore(s => s.promote);
  const releaseYouth = useGameStore(s => s.releaseYouth);
  const nextSeason = useGameStore(s => s.nextSeason);
  if (!open) return null;

  const players = getYouthPlayersAgingOut(game.managerTeam);
  const squadFull = (game.managerTeam.seniorSquad?.length ?? 0) >= game.managerTeam.maxSeniorSquadSize;

  return (
    <Modal title="Youth players aging out" onClose={() => setOpen(false)} wide>
      <p className="text-sm text-navy-200 mb-3">
        These academy players have reached the aging-out threshold. Each must be promoted to the senior squad or released before the next season can begin.
      </p>
      {squadFull && (
        <p className="text-sm text-accent-yellow mb-3">Your senior squad is full ({game.managerTeam.maxSeniorSquadSize}). Release a senior player to promote.</p>
      )}
      {players.length === 0 ? (
        <div className="text-center py-4">
          <p className="mb-3">All aging-out players have been handled.</p>
          <button className="btn-yellow" onClick={nextSeason}>Start next season ▸</button>
        </div>
      ) : (
        <table className="tbl">
          <thead><tr><th>Name</th><th>Pos</th><th className="num">Age</th><th className="num">OVR</th><th className="num">POT</th><th></th></tr></thead>
          <tbody>
            {players.map(player => (
              <tr key={player.id}>
                <td><PlayerLink id={player.id} name={`${player.firstName} ${player.lastName}`} /></td>
                <td><PosBadge position={player.position} /></td>
                <td className="num">{player.age}</td>
                <td className="num">{player.overall}</td>
                <td className="num">{player.potential}</td>
                <td className="text-right space-x-1">
                  <button className="btn-primary btn-sm" disabled={squadFull} onClick={() => promote(player.id)}>Promote</button>
                  <button className="btn-danger btn-sm" onClick={() => releaseYouth(player.id)}>Release</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

function SeasonSummaryModal() {
  const summary = useGameStore(s => s.seasonSummary);
  const dismiss = useGameStore(s => s.dismissSummary);
  if (!summary) return null;
  return (
    <Modal title={`Welcome to ${summary.newSeasonLabel}`} onClose={dismiss} wide>
      {summary.emergencyPlayers.length > 0 && (
        <div className="mb-5">
          <h3 className="font-semibold mb-1">Emergency signings</h3>
          <p className="text-sm text-navy-200 mb-2">
            These players were added to meet minimum squad requirements.
          </p>
          <table className="tbl">
            <thead><tr><th>Name</th><th>Pos</th><th>Nat</th><th className="num">OVR</th><th className="num">POT</th></tr></thead>
            <tbody>
              {summary.emergencyPlayers.map(player => (
                <tr key={player.id}>
                  <td><PlayerLink id={player.id} name={`${player.firstName} ${player.lastName}`} /></td>
                  <td><PosBadge position={player.position} /></td>
                  <td><NationTag code={player.primaryNationality} label="name" /></td>
                  <td className="num">{player.overall}</td>
                  <td className="num">{player.potential}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div>
        <h3 className="font-semibold mb-1">Club rating changes across the pyramid</h3>
        {summary.overallChanges.length === 0 ? (
          <p className="text-sm text-navy-300">No teams received a seasonal overall change.</p>
        ) : (
          <div className="max-h-72 overflow-y-auto border border-navy-700 rounded">
            <table className="tbl">
              <thead><tr><th>Team</th><th className="num">Old</th><th className="num">New</th><th>Reason</th></tr></thead>
              <tbody>
                {summary.overallChanges.map((change, index) => (
                  <tr key={index}>
                    <td>{change.team}</td>
                    <td className="num">{change.oldOverall}</td>
                    <td className="num font-semibold">{change.newOverall} <span className={change.change > 0 ? "text-accent-yellow" : "text-navy-300"}>({change.change > 0 ? "+" : ""}{change.change})</span></td>
                    <td className="text-xs text-navy-200 whitespace-normal">{change.reasons.join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="mt-5 text-right">
        <button className="btn-yellow" onClick={dismiss}>Continue</button>
      </div>
    </Modal>
  );
}

export function Layout(props: { children: ReactNode }) {
  const game = useGame();
  const gameId = useGameStore(s => s.gameId);
  return (
    <div className="h-full flex">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-6 py-3 bg-navy-900 border-b border-navy-700">
          <SearchBar />
          <div className="flex items-center gap-4">
            <WindowModeToggle />
            <ScoutFreeAgentToggle />
            <GodModeToggle />
            <SimControls />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6" key={`${gameId}-${game.season.year}`}>
          {props.children}
        </main>
      </div>
      <Toasts />
      <AgingOutModal />
      <SeasonSummaryModal />
    </div>
  );
}
