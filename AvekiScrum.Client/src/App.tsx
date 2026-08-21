import { useState } from "react";
import { DailysBoard } from "./boards/dailys/DailysBoard";
import { ReviewBoard } from "./boards/review/ReviewBoard";
import { LandingPage, type AppKey } from "./landing/LandingPage";
import { SupportApp } from "./support/SupportApp";
import type { NavigableBoardId } from "./components/BoardShell";

type Route = { app: "landing" } | { app: "scrum"; board: NavigableBoardId } | { app: "support" };

export default function App() {
  // Plain state rather than a router: two apps, a handful of views, and no deep links to support
  // yet. Swap for a real router the moment someone wants to send a colleague a link to a view.
  const [route, setRoute] = useState<Route>({ app: "landing" });

  function open(app: AppKey) {
    setRoute(app === "scrum" ? { app: "scrum", board: "dailys" } : { app: "support" });
  }

  const home = () => setRoute({ app: "landing" });

  if (route.app === "landing") return <LandingPage onPick={open} />;
  if (route.app === "support") return <SupportApp onHome={home} />;

  const navigate = (board: NavigableBoardId) => setRoute({ app: "scrum", board });
  return route.board === "review" ? (
    <ReviewBoard onNavigate={navigate} onHome={home} />
  ) : (
    <DailysBoard onNavigate={navigate} onHome={home} />
  );
}
