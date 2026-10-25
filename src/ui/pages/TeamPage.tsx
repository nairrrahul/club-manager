import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useGame, useGameStore } from "../../store/gameStore";
import { getAllSeasonViews, getClubPlayers, getTeamProfile } from "../../engine/game";
import { getNationName } from "../../engine/nations";
import { POSITION_ORDER } from "../../engine/formation";
import { seasonDisplay } from "../../engine/constants";
import type { Player } from "../../engine/types";
import { LEAGUE_NAMES } from "../../engine/constants";
import { COMPETITION_NAMES } from "../../engine/europeanCompetitions";
import { buildTeamFixtures, buildTrophies } from "../../engine/snapshots";
import type { TeamFixture } from "../../engine/snapshots";
import {
  Empty, NationTag, OvrBadge, PageHeader, Panel, PlayerLink, PosBadge, RatingDots, SeasonSelect, ShortlistButton, SortTh, Stat, Tabs, TeamLink,
  compareSortValues
} from "../components/common";
import type { SortState } from "../components/common";
import { ordinal } from "../format";

type Tab = "overview" | "players" | "fixtures" | "history";

function GodRating(props: { label: string; value: number; which: "scouting" | "experience" | "training" }) {
  const setRating = useGameStore(s => s.godRating);
  return (
    <select className="input py-0.5 text-xs" value={props.value} onChange={e => setRating(props.which, Number(e.target.value))} aria-label={`Set ${props.label}`}>
      {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
    </select>
  );
}

function ResultCell(props: { fixture: TeamFixture }) {
  const { result } = props.fixture;
  if (!result) return <span className="text-navy-400">–</span>;
  const tone = result.outcome === "W" ? "text-accent-yellow" : result.outcome === "L" ? "text-navy-300" : "text-white";
  return (
    <span className="tabular-nums">
      <span className={`font-bold mr-1.5 ${tone}`}>{result.outcome}</span>
      {result.gf}-{result.ga}
      {result.pso && <span className="text-navy-300"> ({result.pso.gf}-{result.pso.ga} PSO)</span>}
    </span>
  );
}

interface PlayerRow {
  player: Player;
  extra?: string;
}

/** `shortlist` adds a flag column (used for players who are not on the managed club). */
function PlayersTable(props: { rows: PlayerRow[]; extraLabel?: string; emptyText: string; shortlist?: boolean }) {
  const [sort, setSort] = useState<SortState>({ key: "pos", dir: "asc" });
  const rows = [...props.rows].sort((a, b) => {
    const value = (row: PlayerRow): string | number | null => {
      const p = row.player;
      switch (sort.key) {
        case "pos": return POSITION_ORDER.indexOf(p.position);
        case "name": return `${p.firstName} ${p.lastName}`;
        case "age": return p.age;
        case "ovr": return p.overall;
        case "pot": return p.potential;
        case "nat": return getNationName(p.primaryNationality);
        case "sec": return p.secondaryNationality ? getNationName(p.secondaryNationality) : null;
        default: return row.extra ?? null;
      }
    };
    return compareSortValues(value(a), value(b), sort.dir) || b.player.overall - a.player.overall;
  });
  const onSort = (key: string) => {
    if (sort.key === key) setSort({ key, dir: sort.dir === "asc" ? "desc" : "asc" });
    else setSort({ key, dir: key === "ovr" || key === "pot" ? "desc" : "asc" });
  };
  const dir = (key: string) => (sort.key === key ? sort.dir : null);

  if (rows.length === 0) return <Empty>{props.emptyText}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            {props.shortlist && <th className="w-8"></th>}
            <SortTh label="Pos" sortKey="pos" dir={dir("pos")} onSort={onSort} />
            <SortTh label="Name" sortKey="name" dir={dir("name")} onSort={onSort} />
            <SortTh label="Age" sortKey="age" dir={dir("age")} onSort={onSort} className="num" />
            <SortTh label="OVR" sortKey="ovr" dir={dir("ovr")} onSort={onSort} className="num" />
            <SortTh label="POT" sortKey="pot" dir={dir("pot")} onSort={onSort} className="num" />
            <SortTh label="Nationality" sortKey="nat" dir={dir("nat")} onSort={onSort} />
            <SortTh label="Secondary" sortKey="sec" dir={dir("sec")} onSort={onSort} />
            {props.extraLabel && <SortTh label={props.extraLabel} sortKey="extra" dir={dir("extra")} onSort={onSort} />}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.player.id}>
              {props.shortlist && <td><ShortlistButton playerId={row.player.id} shortlisted={row.player.isShortlisted === true} /></td>}
              <td><PosBadge position={row.player.position} /></td>
              <td><PlayerLink id={row.player.id} name={`${row.player.firstName} ${row.player.lastName}`} /></td>
              <td className="num">{row.player.age}</td>
              <td className="num"><OvrBadge value={row.player.overall} /></td>
              <td className="num text-navy-200">{row.player.potential}</td>
              <td><NationTag code={row.player.primaryNationality} /></td>
              <td>{row.player.secondaryNationality ? <NationTag code={row.player.secondaryNationality} muted /> : <span className="text-navy-400">–</span>}</td>
              {props.extraLabel && <td className="text-xs text-navy-200">{row.extra ?? "–"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlayersTab(props: { teamID: number; isManaged: boolean }) {
  const game = useGame();
  if (props.isManaged) {
    const team = game.managerTeam;
    if (!team) return null;
    return (
      <div className="space-y-6">
        <Panel title={`Senior squad (${team.seniorSquad?.length ?? 0})`}>
          <PlayersTable
            rows={(team.seniorSquad ?? []).map(player => ({ player, extra: player.contractExpiry ? String(player.contractExpiry) : undefined }))}
            extraLabel="Contract"
            emptyText="No senior players."
          />
        </Panel>
        <Panel title={`Youth academy (${team.youthAcademySquad?.length ?? 0})`}>
          <PlayersTable
            rows={(team.youthAcademySquad ?? []).map(player => ({ player }))}
            emptyText="The academy is empty."
          />
        </Panel>
      </div>
    );
  }

  const entries = getClubPlayers(game, props.teamID);
  return (
    <Panel title={`Players (${entries.length})`}>
      <PlayersTable
        rows={entries.map(entry => ({
          player: entry.player,
          extra: entry.source === "regen"
            ? `Regen · ${seasonDisplay(entry.signedYear)}`
            : entry.source === "god-mode"
              ? "Added (God Mode)"
              : `${seasonDisplay(entry.signedYear)} · MD ${entry.signedMatchday}`
        }))}
        extraLabel="Signed"
        emptyText="No players yet. For now, other clubs only add players by signing free agents."
        shortlist
      />
    </Panel>
  );
}

function FixturesTab(props: { teamID: number; isEnglish: boolean }) {
  const game = useGame();
  const views = getAllSeasonViews(game);
  const [year, setYear] = useState(game.season.year);
  const view = views.find(v => v.year === year) ?? views[views.length - 1];
  const fixtures = buildTeamFixtures(view, props.teamID);

  return (
    <div>
      <div className="flex justify-end mb-3">
        <SeasonSelect years={views.map(v => ({ year: v.year, label: v.label }))} value={view.year} onChange={setYear} />
      </div>
      <Panel title={`Fixtures — ${view.label}`}>
        {fixtures.length === 0 ? (
          <Empty>
            {props.isEnglish
              ? "No fixtures recorded for this season."
              : "This club did not take part in a competition this season."}
          </Empty>
        ) : (
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="tbl">
              <thead>
                <tr><th className="num">MD</th><th>Competition</th><th>Stage</th><th></th><th>Opponent</th><th>Result</th></tr>
              </thead>
              <tbody>
                {fixtures.map((fixture, index) => (
                  <tr key={index}>
                    <td className="num text-navy-300">{fixture.matchday > 46 ? "PO" : fixture.matchday}</td>
                    <td><Link to={fixture.link} className="link">{fixture.competition}</Link></td>
                    <td className="text-navy-200 text-xs">{fixture.stage}</td>
                    <td className="text-xs text-navy-300">{fixture.home ? "H" : "A"}</td>
                    <td><TeamLink team={fixture.opponent} /></td>
                    <td>
                      <ResultCell fixture={fixture} />
                      {fixture.note && <span className="ml-2 text-xs text-navy-300">{fixture.note}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function HistoryTab(props: { teamID: number; seasonHistory: { season: string; year: number; tier: number; position: number; status: string; cupFinish: { label: string } | null }[]; isEnglish: boolean }) {
  const game = useGame();
  const trophies = buildTrophies(getAllSeasonViews(game), props.teamID);
  const grouped = new Map<string, string[]>();
  for (const trophy of [...trophies].reverse()) {
    const list = grouped.get(trophy.name) ?? [];
    list.push(trophy.season);
    grouped.set(trophy.name, list);
  }

  return (
    <div className="space-y-6">
      <Panel title={`Trophies (${trophies.length})`}>
        {trophies.length === 0 ? <Empty>No trophies won yet.</Empty> : (
          <div className="divide-y divide-navy-700/60">
            {[...grouped.entries()].map(([name, seasons]) => (
              <div key={name} className="flex items-center gap-4 px-4 py-3">
                <span className="inline-flex w-9 h-9 rounded-full bg-accent-yellow text-navy-950 items-center justify-center font-bold">{seasons.length}</span>
                <div>
                  <div className="font-semibold">{name}</div>
                  <div className="text-xs text-navy-300">{seasons.join(", ")}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {props.isEnglish && (
        <Panel title="Season records">
          {props.seasonHistory.length === 0 ? <Empty>No completed seasons yet.</Empty> : (
            <table className="tbl">
              <thead><tr><th>Season</th><th>League</th><th className="num">Pos</th><th>Outcome</th><th>Cup</th></tr></thead>
              <tbody>
                {[...props.seasonHistory].reverse().map(record => (
                  <tr key={record.year}>
                    <td>{record.season.replace(/^(\d\d)-(\d\d)$/, "20$1-$2")}</td>
                    <td>{LEAGUE_NAMES[record.tier]}</td>
                    <td className="num">{ordinal(record.position)}</td>
                    <td>
                      {record.status === "PROMOTED" ? <span className="text-accent-yellow font-semibold">Promoted</span>
                        : record.status === "RELEGATED" ? <span className="text-navy-300">Relegated</span> : "Stayed"}
                    </td>
                    <td>{record.cupFinish?.label ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}
    </div>
  );
}

export default function TeamPage() {
  const game = useGame();
  const params = useParams();
  const teamID = Number(params.id);
  const [tab, setTab] = useState<Tab>("overview");
  const profile = getTeamProfile(game, teamID);

  if (!profile) return <Navigate to="/" replace />;

  const isEnglish = profile.kind === "ENG";

  // Best players of this club: its signed players (for the managed club: senior squad and academy).
  const clubPlayers: Player[] = profile.isManaged && game.managerTeam
    ? [...(game.managerTeam.seniorSquad ?? []), ...(game.managerTeam.youthAcademySquad ?? [])]
    : getClubPlayers(game, teamID).map(entry => entry.player);
  const bestPlayers = [...clubPlayers]
    .sort((a, b) => b.overall - a.overall || b.potential - a.potential)
    .slice(0, 6);

  return (
    <div>
      <PageHeader
        title={profile.name}
        subtitle={
          isEnglish
            ? `${profile.league ? LEAGUE_NAMES[profile.league.tier] : ""}${profile.isManaged ? " · Your club" : ""}`
            : <span className="inline-flex items-center gap-2">Club · <NationTag code={profile.countrycode} /></span>
        }
        right={profile.isManaged ? <Link to="/squad" className="btn-primary">View squad</Link> : undefined}
      />
      <Tabs
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "players", label: "Players" },
          { id: "fixtures", label: "Fixtures" },
          { id: "history", label: "History" }
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "overview" && (
        <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <Panel title="Ratings">
            <div className="p-5 flex items-center gap-6">
              <OvrBadge value={profile.baseOverall} size="xl" />
              <div>
                <div className="text-xs uppercase tracking-wider text-navy-300">Overall rating</div>
                <div className="text-sm text-navy-200 mt-1">
                  Current form rating: <b className="text-white">{profile.overall}</b>
                </div>
              </div>
            </div>
            <dl className="divide-y divide-navy-700/60 text-sm border-t border-navy-700">
              <div className="flex items-center justify-between px-5 py-2.5">
                <dt className="text-navy-300">Training facilities</dt>
                <dd className="flex items-center gap-3">
                  <RatingDots value={profile.facilityRating} />
                  {profile.isManaged && game.godMode && <GodRating label="training rating" value={profile.facilityRating} which="training" />}
                </dd>
              </div>
              <div className="flex items-center justify-between px-5 py-2.5">
                <dt className="text-navy-300">Youth scouting rating</dt>
                <dd className="flex items-center gap-3">
                  <RatingDots value={profile.scoutingRating} />
                  {profile.isManaged && game.godMode && <GodRating label="scouting rating" value={profile.scoutingRating} which="scouting" />}
                </dd>
              </div>
              <div className="flex items-center justify-between px-5 py-2.5">
                <dt className="text-navy-300">Youth scouting experience</dt>
                <dd className="flex items-center gap-3">
                  <RatingDots value={profile.scoutingExperience} />
                  {profile.isManaged && game.godMode && <GodRating label="scouting experience" value={profile.scoutingExperience} which="experience" />}
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel title={`Season ${game.season.season.replace(/^(\d\d)-(\d\d)$/, "20$1-$2")}`}>
            <div className="p-5 grid grid-cols-2 gap-5">
              {isEnglish && profile.league && (
                <Stat
                  label="League"
                  value={LEAGUE_NAMES[profile.league.tier]}
                  sub={`${ordinal(profile.league.position)} place`}
                />
              )}
              {!isEnglish && <Stat label="Country" value={<NationTag code={profile.countrycode} />} />}
              <Stat
                label={profile.kind === "CON" ? "Continental football" : "European football"}
                value={profile.europe.length > 0 ? profile.europe.map(code => COMPETITION_NAMES[code]).join(", ") : "Not competing"}
              />
              {profile.clubWorldCup && <Stat label="Club World Cup" value="Participating" />}
              {isEnglish && <Stat label="Domestic cup" value="FA Cup" />}
            </div>
            {profile.europe.map(code => (
              <div key={code} className="px-5 pb-4">
                <Link className="link text-sm text-accent-purple-light" to={`/europe/${code}`}>View {COMPETITION_NAMES[code]} →</Link>
              </div>
            ))}
            {profile.clubWorldCup && (
              <div className="px-5 pb-4">
                <Link className="link text-sm text-accent-purple-light" to="/club-world-cup">View Club World Cup →</Link>
              </div>
            )}
            {profile.league && (
              <div className="px-5 pb-4">
                <Link className="link text-sm text-accent-purple-light" to={`/league/${profile.league.tier}`}>View {LEAGUE_NAMES[profile.league.tier]} table →</Link>
              </div>
            )}
          </Panel>
        </div>
        {bestPlayers.length > 0 && (
          <Panel title="Best players" right={<button className="text-xs text-accent-purple-light hover:underline" onClick={() => setTab("players")}>All players</button>}>
            <table className="tbl">
              <tbody>
                {bestPlayers.map(player => (
                  <tr key={player.id}>
                    <td className="w-10"><OvrBadge value={player.overall} /></td>
                    <td><PlayerLink id={player.id} name={`${player.firstName} ${player.lastName}`} /></td>
                    <td><PosBadge position={player.position} /></td>
                    <td className="num text-navy-300">{player.age}</td>
                    <td><NationTag code={player.primaryNationality} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
        </div>
      )}

      {tab === "players" && <PlayersTab teamID={teamID} isManaged={profile.isManaged} />}
      {tab === "fixtures" && <FixturesTab teamID={teamID} isEnglish={isEnglish} />}
      {tab === "history" && <HistoryTab teamID={teamID} seasonHistory={profile.seasonHistory} isEnglish={isEnglish} />}
    </div>
  );
}
