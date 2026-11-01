import { useGame } from "../../../store/gameStore";
import InternationalCupPage from "./InternationalCupPage";

export default function EuroPage() {
  const editions = useGame().season.international.euro.editions;
  return (
    <InternationalCupPage
      title="UEFA EURO"
      subtitle="UEFA European Championship"
      editions={editions}
      groupHighlights={{ 1: "bg-green-500/10", 2: "bg-green-500/10", 3: "bg-yellow-400/10" }}
    />
  );
}
