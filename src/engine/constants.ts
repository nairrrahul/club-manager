export const SEASON_START_YEAR = 2026;
export const SEASON_END_MATCHDAY = 46;

export const LEAGUE_NAMES: Record<number, string> = {
  1: "Premier League",
  2: "Championship",
  3: "League One",
  4: "League Two",
  5: "National League"
};

export const CUP_NAME = "FA Cup";

/** "26-27" style label used by the engine, formatted for display as "2026-27". */
export function seasonDisplay(year: number): string {
  return `${year}-${String(year + 1).slice(-2)}`;
}

export const EUROPEAN_START_YEAR = 2027;
