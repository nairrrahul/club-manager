import { create } from "zustand";
import {
  createGame, simulate, finishSeason, startNextSeason, promotePlayer, releaseSenior, releaseYouth,
  setFormation, setXIMode, setXISlot, sendScout, signScouted, setGodMode, setGodRating,
  godChangePosition, canStartNextSeason, signFreeAgent, simulateWindow, setExplicitWindows,
  toggleShortlist, setAutoSendScouts, godAddPlayer, findPlayer, simulateClubWorldCup,
  setExplicitClubWorldCup
} from "../engine/game";
import type { ActionResult, Game, GodAddPlayerInput, SeasonSummary } from "../engine/game";
import { gameFromSave, gameToSave, saveFileName, verifySave } from "../engine/save";
import type { SaveFile } from "../engine/save";
import type { Position } from "../engine/types";

export interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  text: string;
  link?: { to: string; label: string };
}

interface GameStore {
  game: Game | null;
  /** Bumped whenever a different game is started/loaded so every page remounts fresh. */
  gameId: number;
  /** Bumped after every mutation so subscribed components re-render. */
  tick: number;
  toasts: Toast[];
  seasonSummary: SeasonSummary | null;
  agingOutOpen: boolean;

  startGame: (teamID: number) => void;
  notify: (kind: Toast["kind"], text: string) => void;
  /** Builds and verifies a save. Returns null (and raises an error toast) if it cannot be saved losslessly. */
  exportSave: () => { filename: string; json: string } | null;
  /** Replaces the current game with a parsed save file. Returns an error message, or null on success. */
  loadSave: (file: SaveFile) => string | null;
  dismissToast: (id: number) => void;
  dismissSummary: () => void;
  setAgingOutOpen: (open: boolean) => void;

  advance: (count: number) => void;
  finish: () => void;
  nextSeason: () => void;

  promote: (playerID: string) => void;
  releaseSenior: (playerID: string) => void;
  releaseYouth: (playerID: string) => void;
  formation: (formation: string) => void;
  xiMode: (mode: "auto" | "manual") => void;
  xiSlot: (slot: number, playerID: string) => ActionResult;

  scout: (countryCode: string, positions: Position[]) => boolean;
  sign: (playerID: string) => void;
  signFreeAgent: (playerID: string) => void;
  /** Plays the open international window. */
  /** Adds/removes a player from the shortlist (silent). */
  toggleShortlist: (playerID: string) => void;
  /** Unsigned youth-scouting candidates become free agents instead of being discarded. */
  autoSendScouts: (enabled: boolean) => void;
  simulateWindow: () => void;
  simulateClubWorldCup: () => void;
  /** true = windows must be simulated explicitly; false = they are played automatically when continuing. */
  explicitWindows: (explicit: boolean) => void;
  explicitClubWorldCup: (explicit: boolean) => void;

  godMode: (enabled: boolean) => void;
  godRating: (which: "scouting" | "experience" | "training", rating: number) => void;
  godPosition: (playerID: string, position: Position) => void;
  godAddPlayer: (input: GodAddPlayerInput) => ActionResult & { playerID?: string };
}

let toastId = 1;

export const useGameStore = create<GameStore>()((set, get) => {
  const pushToast = (kind: Toast["kind"], text: string, link?: Toast["link"]) => {
    const toast: Toast = { id: toastId++, kind, text, link };
    set(state => ({ toasts: [...state.toasts.slice(-3), toast] }));
  };

  /** Runs a mutation, refreshes subscribers and surfaces the result as a toast. */
  const act = (fn: (game: Game) => ActionResult, quiet = false): ActionResult => {
    const game = get().game;
    if (!game) return { ok: false, error: "No game in progress." };
    const result = fn(game);
    game.version++;

    // Surface engine notices (the terminal printed these while simulating).
    for (const notice of game.season.notices.splice(0)) {
      if (notice.kind === "scout-return") {
        pushToast(
          "info",
          `Youth scouting mission to ${notice.countryCode} returned ${notice.candidateCount} candidates (matchday ${notice.matchday}). Sign them before the next matchday.`
        );
      }
    }

    if (result.ok && result.message && !quiet) pushToast("success", result.message);
    if (!result.ok && result.error) pushToast("error", result.error);
    set(state => ({ tick: state.tick + 1 }));
    return result;
  };

  return {
    game: null,
    gameId: 0,
    tick: 0,
    toasts: [],
    seasonSummary: null,
    agingOutOpen: false,

    startGame: teamID => {
      const game = createGame(teamID);
      set(state => ({ game, gameId: state.gameId + 1, tick: 0, toasts: [], seasonSummary: null, agingOutOpen: false }));
    },
    notify: (kind, text) => pushToast(kind, text),
    exportSave: () => {
      const game = get().game;
      if (!game) return null;
      try {
        const file = gameToSave(game);
        // Prove the save is lossless before letting the user download it.
        const problem = verifySave(game, file);
        if (problem) {
          pushToast("error", `Save cancelled: the saved copy did not match the live game (${problem}). Nothing was written.`);
          return null;
        }
        return { filename: saveFileName(game), json: JSON.stringify(file) };
      } catch (error) {
        pushToast("error", `Save cancelled: ${(error as Error).message}`);
        return null;
      }
    },
    loadSave: file => {
      try {
        const game = gameFromSave(file);
        set(state => ({ game, gameId: state.gameId + 1, tick: state.tick + 1, toasts: [], seasonSummary: null, agingOutOpen: false }));
        pushToast("success", `Loaded ${file.meta.team} — season ${file.meta.season}, matchday ${file.meta.matchday}.`);
        return null;
      } catch (error) {
        return (error as Error).message;
      }
    },
    dismissToast: id => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),
    dismissSummary: () => set({ seasonSummary: null }),
    setAgingOutOpen: open => set({ agingOutOpen: open }),

    advance: count => { act(game => simulate(game, count)); },
    finish: () => { act(game => finishSeason(game)); },
    nextSeason: () => {
      const game = get().game;
      if (!game) return;
      const check = canStartNextSeason(game);
      if (!check.ok && check.agingOut.length > 0 && game.season.promotionPlayoffs) {
        set({ agingOutOpen: true });
        return;
      }
      let summary: SeasonSummary | undefined;
      act(g => {
        const out = startNextSeason(g);
        summary = out.summary;
        return out.result;
      });
      if (summary) set({ seasonSummary: summary, agingOutOpen: false });
    },

    promote: id => { act(game => promotePlayer(game, id)); },
    releaseSenior: id => { act(game => releaseSenior(game, id)); },
    releaseYouth: id => { act(game => releaseYouth(game, id)); },
    formation: formation => { act(game => setFormation(game, formation)); },
    xiMode: mode => { act(game => setXIMode(game, mode)); },
    xiSlot: (slot, id) => act(game => setXISlot(game, slot, id), true),

    scout: (code, positions) => act(game => sendScout(game, code, positions)).ok,
    sign: id => { act(game => signScouted(game, id)); },
    signFreeAgent: id => { act(game => signFreeAgent(game, id)); },
    toggleShortlist: id => { act(game => toggleShortlist(game, id)); },
    autoSendScouts: enabled => { act(game => setAutoSendScouts(game, enabled)); },
    simulateWindow: () => { act(game => simulateWindow(game)); },
    simulateClubWorldCup: () => { act(game => simulateClubWorldCup(game)); },
    explicitWindows: explicit => { act(game => setExplicitWindows(game, explicit)); },
    explicitClubWorldCup: explicit => { act(game => setExplicitClubWorldCup(game, explicit)); },

    godMode: enabled => {
      act(game => { setGodMode(game, enabled); return { ok: true, message: enabled ? "God Mode enabled." : "God Mode disabled." }; });
    },
    godRating: (which, rating) => { act(game => setGodRating(game, which, rating)); },
    godPosition: (id, position) => { act(game => godChangePosition(game, id, position)); },
    godAddPlayer: input => {
      let playerID: string | undefined;
      const result = act(game => {
        const created = godAddPlayer(game, input);
        playerID = created.playerID;
        return created;
      }, true);
      if (result.ok && playerID) {
        const game = get().game;
        const player = game ? findPlayer(game, playerID)?.player : null;
        pushToast(
          "success",
          result.message ?? `Added ${player ? `${player.firstName} ${player.lastName}` : "player"}.`,
          { to: `/player/${encodeURIComponent(playerID)}`, label: "View player" }
        );
      }
      return { ...result, playerID };
    }
  };
});

/** Returns the live game and subscribes the caller to every state change. */
export function useGame(): Game {
  useGameStore(state => state.tick);
  const game = useGameStore.getState().game;
  if (!game) throw new Error("No game in progress.");
  return game;
}
