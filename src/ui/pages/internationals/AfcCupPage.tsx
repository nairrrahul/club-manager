import { useGame } from "../../../store/gameStore";
import InternationalCupPage from "./InternationalCupPage";

export default function AfcCupPage() {
  const editions = useGame().season.international.afcCup.editions;
  return (
    <InternationalCupPage
      title="Asian Cup"
      subtitle="Asian Cup"
      editions={editions}
      afconHighlights
      nthPlaceAdvancement={{ place: 3, advancingCount: 4 }}
    />
  );
}
