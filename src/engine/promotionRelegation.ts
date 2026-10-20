import tierInformationRaw from "./data/tier_information.json";
import { simulateMatch, parseKOMatchWinner } from "./matchEngine";
import { getLeagueStandings } from "./league";
import { updateFormAfterMatch } from "./form";
import type { Team } from "./team";
import type { LeagueState, PlayoffResult } from "./types";

interface TierInfo {
  UP?: number[];
  DOWN?: number[];
  PLAYOFF?: number[];
}

export const tier_information = tierInformationRaw as unknown as Record<string, TierInfo>;

export function simulatePromotionPlayoffs(leagueStates: Record<string, LeagueState>): Record<string, PlayoffResult> {
  const seasonResults = Object.values(leagueStates)
    .sort((a, b) => a.tier - b.tier)
    .map(league => ({
      seasonResults: getLeagueStandings(league),
      tier: league.tier
    }));

  const results: Record<string, PlayoffResult> = {};

  for (const seasonResult of seasonResults) {
    if (seasonResult.tier === 1) {
      continue;
    }

    const playoffTeams = tier_information[String(seasonResult.tier)].PLAYOFF as number[];

    const teams = seasonResult.seasonResults
      .slice(playoffTeams[0] - 1, playoffTeams[playoffTeams.length - 1])
      .map(teamPos => teamPos.team);

    const match1 = simulateMatch(teams[0], teams[3], true, "LEAGUE");
    updateFormAfterMatch(match1, parseKOMatchWinner(match1));

    const match2 = simulateMatch(teams[1], teams[2], true, "LEAGUE");
    updateFormAfterMatch(match2, parseKOMatchWinner(match2));

    const final = simulateMatch(
      parseKOMatchWinner(match1),
      parseKOMatchWinner(match2),
      true,
      "LEAGUE"
    );

    updateFormAfterMatch(final, parseKOMatchWinner(final));

    results[seasonResult.tier] = {
      semiOne: match1,
      semiTwo: match2,
      final,
      playoffWinner: parseKOMatchWinner(final)
    };
  }

  return results;
}

export function getPromotionPlayoffResults(
  playoffResults: Record<string, PlayoffResult> | null,
  tier: number
): PlayoffResult | null {
  return playoffResults?.[String(tier)] ?? null;
}

interface ProRel {
  UP: Team[] | null;
  DOWN: Team[] | null;
}

export function applyPromotionRelegation(
  leagueStates: Record<string, LeagueState>,
  teamsByTier: Record<string, Team[]>,
  playoffResults: Record<string, PlayoffResult> | null = null
): Record<string, Team[]> {
  const seasonResults = Object.values(leagueStates)
    .sort((a, b) => a.tier - b.tier)
    .map(league => ({
      seasonResults: getLeagueStandings(league),
      tier: league.tier
    }));

  const teamProRel: ProRel[] = seasonResults.map(seasonres => {
    if (seasonres.tier == 1) {
      const teamsDown = tier_information["1"].DOWN as number[];

      return {
        UP: null,
        DOWN: seasonres.seasonResults
          .slice(teamsDown[0] - 1, teamsDown[teamsDown.length - 1])
          .map(teamPos => teamPos.team)
      };
    }

    const teamsUp = tier_information[String(seasonres.tier)].UP as number[];
    const teamsDown = tier_information[String(seasonres.tier)].DOWN as number[] | undefined;

    const initTeamUp = seasonres.seasonResults
      .slice(teamsUp[0] - 1, teamsUp[teamsUp.length - 1])
      .map(teamPos => teamPos.team);

    const playoffWinner = playoffResults?.[String(seasonres.tier)]?.playoffWinner
      ?? simulatePromotionPlayoffs({ [seasonres.tier]: leagueStates[seasonres.tier] })[seasonres.tier].playoffWinner;

    if (seasonres.tier == 5) {
      return {
        UP: [...initTeamUp, playoffWinner],
        DOWN: null
      };
    }

    const teamsDownResult = seasonres.seasonResults
      .slice((teamsDown as number[])[0] - 1, (teamsDown as number[])[(teamsDown as number[]).length - 1])
      .map(teamPos => teamPos.team);

    return {
      UP: [...initTeamUp, playoffWinner],
      DOWN: teamsDownResult
    };
  });

  const tierOneConstTeams = teamsByTier["1"].filter(
    team => !(teamProRel[0].DOWN as Team[]).map(t => t.ID).includes(team.ID)
  );

  const tierTwoConstTeams = teamsByTier["2"].filter(
    team => ![...(teamProRel[1].UP as Team[]), ...(teamProRel[1].DOWN as Team[])]
      .map(t => t.ID)
      .includes(team.ID)
  );

  const tierThreeConstTeams = teamsByTier["3"].filter(
    team => ![...(teamProRel[2].UP as Team[]), ...(teamProRel[2].DOWN as Team[])]
      .map(t => t.ID)
      .includes(team.ID)
  );

  const tierFourConstTeams = teamsByTier["4"].filter(
    team => ![...(teamProRel[3].UP as Team[]), ...(teamProRel[3].DOWN as Team[])]
      .map(t => t.ID)
      .includes(team.ID)
  );

  const tierFiveConstTeams = teamsByTier["5"].filter(
    team => !(teamProRel[4].UP as Team[]).map(t => t.ID).includes(team.ID)
  );

  return {
    "1": [...tierOneConstTeams, ...(teamProRel[1].UP as Team[])].map(team => setTeamTier(team, 1)),
    "2": [...tierTwoConstTeams, ...(teamProRel[0].DOWN as Team[]), ...(teamProRel[2].UP as Team[])].map(team => setTeamTier(team, 2)),
    "3": [...tierThreeConstTeams, ...(teamProRel[1].DOWN as Team[]), ...(teamProRel[3].UP as Team[])].map(team => setTeamTier(team, 3)),
    "4": [...tierFourConstTeams, ...(teamProRel[2].DOWN as Team[]), ...(teamProRel[4].UP as Team[])].map(team => setTeamTier(team, 4)),
    "5": [...tierFiveConstTeams, ...(teamProRel[3].DOWN as Team[])].map(team => setTeamTier(team, 5))
  };
}

function setTeamTier(team: Team, tier: number): Team {
  team.Tier = tier;
  return team;
}
