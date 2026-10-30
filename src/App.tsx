import { Navigate, Route, Routes } from "react-router-dom";
import { useGameStore } from "./store/gameStore";
import { Layout } from "./ui/components/Layout";
import TeamSelect from "./ui/pages/TeamSelect";
import Home from "./ui/pages/Home";
import Squad from "./ui/pages/Squad";
import Academy from "./ui/pages/Academy";
import PlayerPage from "./ui/pages/PlayerPage";
import LeaguePage from "./ui/pages/LeaguePage";
import CupPage from "./ui/pages/CupPage";
import EuropePage from "./ui/pages/EuropePage";
import TeamPage from "./ui/pages/TeamPage";
import Scouting from "./ui/pages/Scouting";
import FreeAgents from "./ui/pages/FreeAgents";
import Shortlist from "./ui/pages/Shortlist";
import PlayerSearch from "./ui/pages/PlayerSearch";
import Rankings from "./ui/pages/Rankings";
import NationPage from "./ui/pages/NationPage";
import International from "./ui/pages/International";
import AddPlayer from "./ui/pages/AddPlayer";
import AddTeam from "./ui/pages/AddTeam";
import ClubWorldCupPage from "./ui/pages/ClubWorldCupPage";
import ContinentalTournamentsPage from "./ui/pages/ContinentalTournamentsPage";
import NationsLeaguePage from "./ui/pages/NationsLeaguePage";
import GoldCupPage from "./ui/pages/GoldCupPage";
import GoldCupPlayoffPage from "./ui/pages/GoldCupPlayoffPage";
import CopaAmericaPage from "./ui/pages/CopaAmericaPage";

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
