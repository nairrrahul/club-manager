import hostOptionsRaw from "../../data/intl/tournament_hosts.json";
import { getConfederation } from "../../nations";
import { getFixedInternationalCompetitionHosts } from "../internationalCompetitionsUtils";
import type { WorldCupConfederation } from "./types";

const hostOptions = (hostOptionsRaw as Record<string, string[]>).WC ?? [];
const allConfederations: WorldCupConfederation[] = ["UEFA", "CONCACAF", "CONMEBOL", "OFC", "AFC", "CAF"];

export function getWorldCupHostConfederations(hosts: string[]): WorldCupConfederation[] {
  return [...new Set(hosts.map(getConfederation).filter((value): value is WorldCupConfederation =>
    allConfederations.includes(value as WorldCupConfederation)
  ))];
}

export function chooseWorldCupHosts(
  year: number,
  previousEditions: { hosts: string[]; blockedConfederations: WorldCupConfederation[] }[]
): {
  hosts: string[];
  blockedConfederations: WorldCupConfederation[];
} {
  const blocked = new Set<WorldCupConfederation>(
    previousEditions.slice(-2).flatMap(edition =>
      edition.blockedConfederations.length > 0
        ? edition.blockedConfederations
        : getWorldCupHostConfederations(edition.hosts)
    )
  );
  const fixedHosts = getFixedInternationalCompetitionHosts("WC", year + 1);
  if (fixedHosts) {
    if (fixedHosts.some(host => getConfederation(host) === null)) {
        throw new Error(`World Cup ${year} has an unknown fixed host.`);
    }
    return { hosts: fixedHosts, blockedConfederations: getWorldCupHostConfederations(fixedHosts) };
  }
  const eligible = hostOptions.filter(option => {
    const hosts = option.split("|");
    const confederations = getWorldCupHostConfederations(hosts);
    return hosts.length > 0 && hosts.every(host => getConfederation(host) !== null) &&
      confederations.every(confederation => !blocked.has(confederation));
  });
  if (eligible.length === 0) throw new Error("No eligible World Cup host configuration avoids recent host confederations.");
  const hosts = eligible[Math.floor(Math.random() * eligible.length)].split("|");
  return { hosts, blockedConfederations: getWorldCupHostConfederations(hosts) };
}
