import { useState } from "react";
import { DailysBoard } from "./boards/dailys/DailysBoard";
import { ReviewBoard } from "./boards/review/ReviewBoard";
import { LandingPage, type AppKey, type TeamKey } from "./landing/LandingPage";
import { SupportApp } from "./support/SupportApp";
import type { NavigableBoardId } from "./components/BoardShell";

type Route =
  | { app: "landing" }
  | { app: "scrum"; board: NavigableBoardId; team: TeamKey }
  | { app: "support" };

export default function App() {
  // Plain state rather than a router: two apps, a handful of views, and no deep links to support
  // yet. Swap for a real router the moment someone wants to send a colleague a link to a view.
  const [route, setRoute] = useState<Route>({ app: "landing" });

  function open(app: AppKey, team?: TeamKey) {
    // The team comes from the start page's second step. Syd is the fallback for the one caller
    // that has no team to give - support - and is never actually used by it.
    setRoute(app === "scrum" ? { app: "scrum", board: "dailys", team: team ?? "Syd" } : { app: "support" });
  }

  const home = () => setRoute({ app: "landing" });

  if (route.app === "landing") return <LandingPage onPick={open} />;
  if (route.app === "support") return <SupportApp onHome={home} />;

  const navigate = (board: NavigableBoardId) => setRoute({ ...route, board });
  return route.board === "review" ? (
    <ReviewBoard onNavigate={navigate} onHome={home} />
  ) : (
    // Keyed on the team so switching from the start page remounts the board rather than leaving
    // the previous team's fetched state in place.
    <DailysBoard key={route.team} initialTeam={route.team} onNavigate={navigate} onHome={home} />
  );
}
