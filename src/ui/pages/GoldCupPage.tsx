import { useGame } from "../../store/gameStore";
import InternationalCupPage from "./InternationalCupPage";

export default function GoldCupPage() {
  const editions = useGame().season.international.goldCup.editions;
  return (
    <InternationalCupPage
      title="Gold Cup"
      subtitle=""
      editions={editions}
    />
  );
}
