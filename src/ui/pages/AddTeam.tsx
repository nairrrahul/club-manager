import { useState } from "react";
import { useGameStore } from "../../store/gameStore";
import type { GodAddTeamInput } from "../../engine/game";
import { europeanTeamPool } from "../../engine/europeanCompetitions";
import { getConfederation, getCountriesByRegion, getNationName, REGIONS } from "../../engine/nations";
import { NationTag, OvrBadge, PageHeader, Panel, TeamLink } from "../components/common";

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

export default function AddTeam() {
  const game = useGameStore(state => state.game);
  const addTeam = useGameStore(state => state.godAddTeam);
  const [form, setForm] = useState<TeamForm>(initialForm);
  const [error, setError] = useState<string | null>(null);

  if (!game?.godMode) return null;

  const confederation = getConfederation(form.countryCode);
  const showConferenceOnly = confederation === "UEFA" && !namedEuropeanPools.has(form.countryCode);
  const customTeams = game.season.customTeams;

  const update = (key: keyof TeamForm, value: string | boolean) => {
    setForm(current => ({
      ...current,
      [key]: value,
      ...(key === "countryCode" ? { conferenceLeagueOnly: false } : {})
    }));
    setError(null);
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
          <button type="submit" className="btn-primary">Add team</button>
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
    </div>
  );
}
