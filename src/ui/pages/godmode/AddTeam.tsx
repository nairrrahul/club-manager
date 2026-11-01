import { useRef, useState } from "react";
import { useGameStore } from "../../../store/gameStore";
import { TEAM_DIRECTORY } from "../../../engine/game";
import type { GodAddTeamInput } from "../../../engine/game";
import { europeanTeamPool } from "../../../engine/europeanCompetitions";
import { getConfederation, getCountriesByRegion, getNationName, REGIONS } from "../../../engine/nations";
import { Modal, NationTag, OvrBadge, PageHeader, Panel, TeamLink } from "../../components/common";

interface TeamForm {
  name: string;
  countryCode: string;
  overall: string;
  facilityRating: string;
  scoutingRating: string;
  scoutingExperience: string;
  conferenceLeagueOnly: boolean;
}

const initialForm: TeamForm = {
  name: "",
  countryCode: "",
  overall: "60",
  facilityRating: "3",
  scoutingRating: "3",
  scoutingExperience: "3",
  conferenceLeagueOnly: false
};

const countryOptions = REGIONS.map(region => ({
  ...region,
  countries: getCountriesByRegion(region.id).filter(country => country.code !== "ENG")
}));
const namedEuropeanPools = new Set(Object.keys(europeanTeamPool).filter(
  code => code !== "OTHER" && code !== "OTHER_UECL"
));
const countries = REGIONS.flatMap(region => getCountriesByRegion(region.id));
const countryByCode = new Map(countries.map(country => [country.code.toUpperCase(), country.code]));
const countryByName = new Map(countries.map(country => [country.name.trim().toLocaleLowerCase(), country.code]));
const csvColumns = ["name", "country", "overall", "facility", "scouting", "experience", "conf_league"];

function isConferenceLeagueEligible(countryCode: string): boolean {
  return getConfederation(countryCode) === "UEFA" && !namedEuropeanPools.has(countryCode);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  const csv = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < csv.length; index++) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        value += '"';
        index++;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"' && value.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(value.trim());
      value = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && csv[index + 1] === "\n") index++;
      row.push(value.trim());
      if (row.some(cell => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  row.push(value.trim());
  if (row.some(cell => cell !== "")) rows.push(row);
  return rows;
}

function parseTeamCsv(text: string): GodAddTeamInput[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new Error("The CSV is empty.");
  const columnIndexes = new Map(header.map((column, index) => [column.toLocaleLowerCase(), index]));
  const missingColumns = csvColumns.filter(column => !columnIndexes.has(column));
  if (missingColumns.length) {
    throw new Error(`Missing required CSV column${missingColumns.length === 1 ? "" : "s"}: ${missingColumns.join(", ")}.`);
  }
  if (rows.length === 0) throw new Error("The CSV has no team rows to import.");

  const errors: string[] = [];
  const teams: GodAddTeamInput[] = [];
  const getCell = (row: string[], column: string) => row[columnIndexes.get(column)!] ?? "";
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const name = getCell(row, "name");
    const countryInput = getCell(row, "country");
    const countryCode = countryByCode.get(countryInput.toUpperCase()) ??
      countryByName.get(countryInput.toLocaleLowerCase());
    const conferenceLeagueOnly = Boolean(countryCode && isConferenceLeagueEligible(countryCode)) &&
      getCell(row, "conf_league") !== "";
    const ratingInputs = ["overall", "facility", "scouting", "experience"].map(column => getCell(row, column));
    const ratings = ratingInputs.map(Number);

    if (!name) errors.push(`Row ${rowNumber}: team name is required.`);
    if (!countryCode || countryCode === "ENG") {
      errors.push(`Row ${rowNumber}: "${countryInput}" is not a valid non-English country name or code.`);
    }
    if (ratings.some((rating, ratingIndex) =>
      ratingInputs[ratingIndex] === "" || !Number.isInteger(rating)
    )) {
      errors.push(`Row ${rowNumber}: overall, facility, scouting, and experience must be whole numbers.`);
    } else if (
      ratings[0] < 20 || ratings[0] > 99 ||
      ratings.slice(1).some(rating => rating < 1 || rating > 5)
    ) {
      errors.push(`Row ${rowNumber}: overall must be 20–99; facility, scouting, and experience must be 1–5.`);
    }
    if (name && countryCode && countryCode !== "ENG" &&
      ratings.every(Number.isInteger) && ratings[0] >= 20 && ratings[0] <= 99 &&
      ratings.slice(1).every(rating => rating >= 1 && rating <= 5)) {
      teams.push({
        name,
        countryCode,
        overall: ratings[0],
        facilityRating: ratings[1],
        scoutingRating: ratings[2],
        scoutingExperience: ratings[3],
        conferenceLeagueOnly
      });
    }
  });
  if (errors.length) throw new Error(errors.join("\n"));
  return teams;
}

export default function AddTeam() {
  const game = useGameStore(state => state.game);
  const addTeam = useGameStore(state => state.godAddTeam);
  const csvInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<TeamForm>(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    teams: GodAddTeamInput[];
    duplicates: GodAddTeamInput[];
  } | null>(null);

  if (!game?.godMode) return null;

  const confederation = getConfederation(form.countryCode);
  const showConferenceOnly = confederation === "UEFA" && !namedEuropeanPools.has(form.countryCode);
  const customTeams = game.season.customTeams;
  const existingTeamKeys = new Set([...TEAM_DIRECTORY.values()].map(team =>
    `${team.countrycode}\u0000${team.name.trim().toLocaleLowerCase()}`
  ));
  const duplicateInCountry = form.name.trim() !== "" && Boolean(form.countryCode) &&
    existingTeamKeys.has(`${form.countryCode}\u0000${form.name.trim().toLocaleLowerCase()}`);

  const update = (key: keyof TeamForm, value: string | boolean) => {
    setForm(current => ({
      ...current,
      [key]: value,
      ...(key === "countryCode" ? { conferenceLeagueOnly: false } : {})
    }));
    setError(null);
    setImportMessage(null);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input: GodAddTeamInput = {
      name: form.name,
      countryCode: form.countryCode,
      overall: Number(form.overall),
      facilityRating: Number(form.facilityRating),
      scoutingRating: Number(form.scoutingRating),
      scoutingExperience: Number(form.scoutingExperience),
      conferenceLeagueOnly: form.conferenceLeagueOnly
    };
    const result = addTeam(input);
    if (!result.ok) {
      setError(result.error ?? "Unable to add team.");
      return;
    }
    setError(null);
    setForm(current => ({ ...initialForm, countryCode: current.countryCode }));
  };

  const completeImport = (inputs: GodAddTeamInput[]) => {
    for (const input of inputs) {
      const result = addTeam(input);
      if (!result.ok) {
        setError(`Could not import "${input.name}": ${result.error ?? "Unable to add team."}`);
        return;
      }
    }
    setImportMessage(`Imported ${inputs.length} team${inputs.length === 1 ? "" : "s"}.`);
    setError(null);
  };

  const importCsv = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setImportMessage(null);
    try {
      const inputs = parseTeamCsv(await file.text());
      const knownTeams = new Set(existingTeamKeys);
      const duplicates: GodAddTeamInput[] = [];
      for (const input of inputs) {
        const key = `${input.countryCode}\u0000${input.name.trim().toLocaleLowerCase()}`;
        if (knownTeams.has(key)) duplicates.push(input);
        knownTeams.add(key);
      }
      if (duplicates.length > 0) setPendingImport({ teams: inputs, duplicates });
      else completeImport(inputs);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to import the CSV file.");
    }
  };

  return (
    <div>
      <PageHeader
        title="Add Team"
        subtitle="Create a club in any non-English country. New clubs join the appropriate European or continental competition pool and can generate regens."
      />
      <Panel title="Team details">
        <form onSubmit={submit} className="p-5 space-y-5 max-w-3xl">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm text-navy-200">
              Team name
              <input className="input w-full mt-1" value={form.name} onChange={event => update("name", event.target.value)} required maxLength={80} />
              {duplicateInCountry && (
                <span className="mt-1 block text-xs text-accent-yellow">
                  A team with this name already exists in {getNationName(form.countryCode)}. You can still add it.
                </span>
              )}
            </label>
            <label className="block text-sm text-navy-200">
              Country
              <div className="flex items-center gap-3 mt-1">
                <select className="input min-w-0 flex-1" value={form.countryCode} onChange={event => update("countryCode", event.target.value)} required>
                  <option value="" disabled>Select a country</option>
                  {countryOptions.map(region => (
                    <optgroup key={region.id} label={region.label}>
                      {region.countries.map(country => (
                        <option key={country.code} value={country.code}>{country.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {form.countryCode && <NationTag code={form.countryCode} noLink label="code" />}
              </div>
            </label>
            <label className="block text-sm text-navy-200">
              Base team overall
              <input className="input w-full mt-1" type="number" min="20" max="99" step="1" value={form.overall} onChange={event => update("overall", event.target.value)} required />
            </label>
            <label className="block text-sm text-navy-200">
              Facilities
              <select className="input w-full mt-1" value={form.facilityRating} onChange={event => update("facilityRating", event.target.value)}>
                {[1, 2, 3, 4, 5].map(rating => <option key={rating} value={rating}>{rating}</option>)}
              </select>
            </label>
            <label className="block text-sm text-navy-200">
              Youth scouting
              <select className="input w-full mt-1" value={form.scoutingRating} onChange={event => update("scoutingRating", event.target.value)}>
                {[1, 2, 3, 4, 5].map(rating => <option key={rating} value={rating}>{rating}</option>)}
              </select>
            </label>
            <label className="block text-sm text-navy-200">
              Youth experience
              <select className="input w-full mt-1" value={form.scoutingExperience} onChange={event => update("scoutingExperience", event.target.value)}>
                {[1, 2, 3, 4, 5].map(rating => <option key={rating} value={rating}>{rating}</option>)}
              </select>
            </label>
          </div>
          {showConferenceOnly && (
            <label className="flex items-start gap-2 rounded px-2 py-2 text-sm hover:bg-navy-800">
              <input
                type="checkbox"
                className="mt-0.5 accent-accent-purple"
                checked={form.conferenceLeagueOnly}
                onChange={event => update("conferenceLeagueOnly", event.target.checked)}
              />
              <span>Conference League Only</span>
            </label>
          )}
          {form.countryCode && (
            <p className="text-xs text-navy-300">
              Competition region: {getNationName(form.countryCode)} · {confederation}
              {confederation === "UEFA" && !showConferenceOnly && " · Uses its country's European competition allocation"}
              {showConferenceOnly && ` · ${form.conferenceLeagueOnly ? "Conference League pool" : "General UEFA pool"}`}
            </p>
          )}
          {error && <p role="alert" className="text-sm text-accent-yellow border border-accent-yellow/40 rounded-md px-3 py-2">{error}</p>}
          {importMessage && <p role="status" className="text-sm text-navy-100">{importMessage}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn-primary">Add team</button>
            <input
              ref={csvInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void importCsv(file);
              }}
            />
            <button type="button" className="btn-ghost" onClick={() => csvInput.current?.click()}>
              Batch Import
            </button>
          </div>
          <p className="text-xs text-navy-400">
            CSV columns: name, country, overall, facility, scouting, experience, conf_league. Country may be a three-letter code or full name. For UEFA countries without a dedicated pool, any non-empty conf_league value adds the team to the Conference League pool.
          </p>
        </form>
      </Panel>
      <Panel title={`Added teams (${customTeams.length})`} >
        {customTeams.length === 0 ? (
          <p className="p-4 text-sm text-navy-300">No teams have been added yet.</p>
        ) : (
          <div className="divide-y divide-navy-700">
            {customTeams.map(team => (
              <div key={team.ID} className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
                <div>
                  <TeamLink team={{ id: team.ID, name: team.Team }} className="font-semibold" />
                  <span className="ml-2"><NationTag code={team.countrycode ?? null} label="name" /></span>
                  <span className="ml-2 text-xs text-navy-400">ID {team.ID}</span>
                </div>
                <OvrBadge value={team.BaseOverall} />
              </div>
            ))}
          </div>
        )}
      </Panel>
      {pendingImport && (
        <Modal title="Duplicate team names found">
          <>
            <div className="space-y-3">
              <p>
                These imported teams have the same name and country as a club already in the save or earlier in this CSV:
              </p>
              <ul className="max-h-60 list-disc space-y-1 overflow-y-auto pl-5">
                {pendingImport.duplicates.map((team, index) => (
                  <li key={`${team.countryCode}-${team.name}-${index}`}>
                    {team.name} — {getNationName(team.countryCode)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setPendingImport(null)}>Go Back</button>
              <button
                className="btn-yellow"
                onClick={() => {
                  const teams = pendingImport.teams;
                  setPendingImport(null);
                  completeImport(teams);
                }}
              >
                Continue
              </button>
            </div>
          </>
        </Modal>
      )}
    </div>
  );
}
