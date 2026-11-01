import { useGame } from "../../../store/gameStore";
import InternationalCupPage from "./InternationalCupPage";

export default function AfconPage() {
  const editions = useGame().season.international.afcon.editions;
  return (
    <InternationalCupPage
      title="AFCON"
      subtitle="Africa Cup of Nations"
      editions={editions}
      afconHighlights
    />
  );
}
