# Soccer Season Simulator

A browser-based soccer manager game built with React, Vite, TypeScript, and Zustand. Choose an English club and
play through league seasons, the FA Cup, European competitions, international windows, scouting, and transfers.
There is no backend; download and upload JSON save files to preserve a game.

## Run locally

```bash
npm install
npm run dev
```

Run `npm run typecheck` to check TypeScript or `npm run build` to create a production build.

## Game features

- Manage a club's senior squad, academy, formation, starting XI, scouting, and free-agent signings.
- Search active players by name, nationality, league, club, overall, potential, and age.
- New games initialize English clubs from their configured training, youth scouting, and youth
  experience ratings. Ownership events can improve or reduce those ratings, within the 1–5 range.
  Generated player potential is capped at 95.
- Continental club tournaments begin in 2027–28. Each non-UEFA confederation runs a randomly drawn,
  automatically simulated knockout with two-legged ties and a one-match final between matchdays 31
  and 32. All five champions qualify for the following season's Club World Cup, along with one
  runner-up selected from the confederations.
- The Club World Cup starts in 2028–29 with eight clubs, a group stage, and semi-finals/final. It can
  be simulated automatically or paused for manual simulation between matchdays 21 and 22. Its
  continental clubs also receive annual regens and have club pages.
- Other clubs independently generate one 17–20-year-old regen with a 70% chance at the start of each season.
  Regens join their club's player list and develop with its facilities.
- Free-agent signing opportunities prefer eligible clubs from the player's primary nationality: those clubs receive
  80% of choices when available; otherwise the existing weighted regional selection applies.
- International call-ups are limited to 3 goalkeepers, 8 defenders, 8 midfielders, and 7 forwards per nation.
  Club and national-team player bonuses use a positional 1-GK / 4-DEF / 3-MID / 3-FWD XI.
- God Mode can add players to free agency or another club through the Add Player page, with potential up
  to 99. The God Mode toggle remains locked until you leave that page.

## Saves

Save files use format version 10. Older saves are migrated when loaded, including club-player source defaults,
duplicate player-ID repair, recalculation of positional club bonuses, and Club World Cup and continental
tournament state initialization.
