import { Navigate, Route, Routes } from "react-router-dom";
import { useGameStore } from "./store/gameStore";
import { Layout } from "./ui/components/Layout";
import TeamSelect from "./ui/pages/TeamSelect";
import Home from "./ui/pages/Home";
import Squad from "./ui/pages/main/Squad";
import Academy from "./ui/pages/main/Academy";
import PlayerPage from "./ui/pages/main/PlayerPage";
import LeaguePage from "./ui/pages/LeaguePage";
import CupPage from "./ui/pages/CupPage";
import EuropePage from "./ui/pages/european_comp/EuropePage";
import TeamPage from "./ui/pages/main/TeamPage";
import Scouting from "./ui/pages/main/Scouting";
import FreeAgents from "./ui/pages/main/FreeAgents";
import Shortlist from "./ui/pages/main/Shortlist";
import PlayerSearch from "./ui/pages/main/PlayerSearch";
import Rankings from "./ui/pages/internationals/Rankings";
import NationPage from "./ui/pages/internationals/NationPage";
import International from "./ui/pages/internationals/International";
import AddPlayer from "./ui/pages/godmode/AddPlayer";
import AddTeam from "./ui/pages/godmode/AddTeam";
import ClubWorldCupPage from "./ui/pages/internationals/ClubWorldCupPage";
import ContinentalTournamentsPage from "./ui/pages/internationals/ContinentalTournamentsPage";
import NationsLeaguePage from "./ui/pages/internationals/NationsLeaguePage";
import GoldCupPage from "./ui/pages/internationals/GoldCupPage";
import GoldCupPlayoffPage from "./ui/pages/internationals/GoldCupPlayoffPage";
import CopaAmericaPage from "./ui/pages/internationals/CopaAmericaPage";
import AfconPage from "./ui/pages/internationals/AfconPage";
import AfconQualifiersPage from "./ui/pages/internationals/AfconQualifiersPage";
import AfcCupPage from "./ui/pages/internationals/AfcCupPage";
import AfcCupQualifiersPage from "./ui/pages/internationals/AfcCupQualifiersPage";
import OfcCupPage from "./ui/pages/internationals/OfcCupPage";
import OfcCupQualifiersPage from "./ui/pages/internationals/OfcCupQualifiersPage";
import EuroPage from "./ui/pages/internationals/EuroPage";
import EuroQualifiersPage from "./ui/pages/internationals/EuroQualifiersPage";
import WorldCupQualifiersPage, { WorldCupPage } from "./ui/pages/internationals/worldcup/WorldCupQualifiersPage";

export default function App() {
  useGameStore(state => state.tick);
  const game = useGameStore(state => state.game);

  if (!game) return <TeamSelect />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/squad" element={game.managerTeam ? <Squad /> : <Navigate to="/" replace />} />
        <Route path="/academy" element={game.managerTeam ? <Academy /> : <Navigate to="/" replace />} />
        <Route path="/scouting" element={game.managerTeam ? <Scouting /> : <Navigate to="/" replace />} />
        <Route path="/free-agents" element={game.managerTeam ? <FreeAgents /> : <Navigate to="/" replace />} />
        <Route path="/shortlist" element={<Shortlist />} />
        <Route path="/player-search" element={<PlayerSearch />} />
        <Route path="/rankings" element={<Rankings />} />
        <Route path="/nation/:code" element={<NationPage />} />
        <Route path="/international" element={<International />} />
        <Route path="/nations-league/:confederation" element={<NationsLeaguePage />} />
        <Route path="/gold-cup" element={<GoldCupPage />} />
        <Route path="/gold-cup-playoff" element={<GoldCupPlayoffPage />} />
        <Route path="/copa-america" element={<CopaAmericaPage />} />
        <Route path="/afcon" element={<AfconPage />} />
        <Route path="/afcon-qualifiers" element={<AfconQualifiersPage />} />
        <Route path="/afc-cup" element={<AfcCupPage />} />
        <Route path="/afc-cup-qualifiers" element={<AfcCupQualifiersPage />} />
        <Route path="/ofc-cup" element={<OfcCupPage />} />
        <Route path="/ofc-cup-qualifiers" element={<OfcCupQualifiersPage />} />
        <Route path="/euro" element={<EuroPage />} />
        <Route path="/euro-qualifiers" element={<EuroQualifiersPage />} />
        <Route path="/world-cup" element={<WorldCupPage />} />
        <Route path="/world-cup-qualifiers/UEFA" element={<WorldCupQualifiersPage confederation="UEFA" />} />
        <Route path="/world-cup-qualifiers/CONCACAF" element={<WorldCupQualifiersPage confederation="CONCACAF" />} />
        <Route path="/world-cup-qualifiers/CONMEBOL" element={<WorldCupQualifiersPage confederation="CONMEBOL" />} />
        <Route path="/world-cup-qualifiers/OFC" element={<WorldCupQualifiersPage confederation="OFC" />} />
        <Route path="/world-cup-qualifiers/AFC" element={<WorldCupQualifiersPage confederation="AFC" />} />
        <Route path="/world-cup-qualifiers/CAF" element={<WorldCupQualifiersPage confederation="CAF" />} />
        <Route path="/world-cup-intercontinental-playoff" element={<WorldCupQualifiersPage confederation="ICPO" />} />
        <Route path="/add-player" element={game.godMode ? <AddPlayer /> : <Navigate to="/" replace />} />
        <Route path="/add-team" element={game.godMode ? <AddTeam /> : <Navigate to="/" replace />} />
        <Route path="/player/:id" element={<PlayerPage />} />
        <Route path="/league/:tier" element={<LeaguePage />} />
        <Route path="/cup" element={<CupPage />} />
        <Route path="/club-world-cup" element={<ClubWorldCupPage />} />
        <Route path="/club-world-cup/continental" element={<ContinentalTournamentsPage />} />
        <Route path="/europe/:code" element={<EuropePage />} />
        <Route path="/team/:id" element={<TeamPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
