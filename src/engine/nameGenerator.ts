import baseProbsRaw from "./data/name_info/base_probs.json";
import dualNatsRaw from "./data/name_info/dual_nats.json";
import nationInfoRaw from "./data/name_info/nation_info.json";
import { fullMappings } from "./data/name_info/groups";
import { generateNameSplit } from "fifa-name-generator";

const BASE_PROBS = baseProbsRaw as Record<string, number>;
const DUAL_NATIONALITIES = dualNatsRaw as unknown as Record<string, Record<string, number>>;
const NATION_INFO = nationInfoRaw as unknown as Record<string, { threeLetterCode: string }>;
const FULL_MAPPINGS = fullMappings;

function getNationByCode(code: string): [string, { threeLetterCode: string }] | null {
  return Object.entries(NATION_INFO).find(
    ([, info]) => info.threeLetterCode === code
  ) ?? null;
}

function getRandomNationality(probabilities: Record<string, number> | undefined): string | null {
  const entries = Object.entries(probabilities ?? {});
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);

  if (total <= 0) {
    return null;
  }

  let random = Math.random() * total;

  for (const [code, weight] of entries) {
    if (random < weight) {
      return code;
    }

    random -= weight;
  }

  return entries[entries.length - 1][0];
}

export function getRandomNationCode(): string {
  const codes = Object.values(NATION_INFO)
    .map(info => info.threeLetterCode);

  return codes[Math.floor(Math.random() * codes.length)];
}

function getSecondaryNationality(primaryCode: string): string | null {
  const probabilities = DUAL_NATIONALITIES[primaryCode];

  if (!probabilities) {
    return null;
  }

  const selected = getRandomNationality(probabilities);

  if (!selected) {
    return null;
  }

  // Direct three-letter nationality code.
  if (selected.length === 3) {
    return selected === primaryCode ? null : selected;
  }

  // GENERAL means any nationality other than the primary nationality.
  if (selected === "GENERAL") {
    let secondary = getRandomNationCode();

    while (secondary === primaryCode) {
      secondary = getRandomNationCode();
    }

    return secondary;
  }

  // Continent/group mapping.
  const group = FULL_MAPPINGS[primaryCode]?.[selected];

  if (!group) {
    throw new Error(
      `No nationality mapping found for ${primaryCode} -> ${selected}.`
    );
  }

  const secondary = getRandomNationality(group);

  if (!secondary || secondary === primaryCode) {
    throw new Error(
      `Invalid secondary nationality generated for ${primaryCode}: ${secondary}`
    );
  }

  return secondary;
}

export interface GeneratedName {
  firstName: string;
  lastName: string;
  primaryNationality: string;
  secondaryNationality: string | null;
}

export function generatePlayerName(primaryCode: string): GeneratedName {
  if (typeof primaryCode !== "string") {
    throw new Error("Primary nationality must be a three-letter code.");
  }

  const nationality = primaryCode.toUpperCase();
  const nation = getNationByCode(nationality);

  if (!nation) {
    throw new Error(`Unknown nationality code: ${nationality}.`);
  }

  const secondaryNationality =
    Math.random() <= (BASE_PROBS[nationality] ?? 0)
      ? getSecondaryNationality(nationality)
      : null;

  const generated = secondaryNationality
    ? generateNameSplit(nationality, secondaryNationality)
    : generateNameSplit(nationality);

  return {
    firstName: generated.firstName,
    lastName: generated.lastName,
    primaryNationality: nationality,
    secondaryNationality
  };
}
