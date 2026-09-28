import { useState } from "react";
import { DailysBoard } from "./boards/dailys/DailysBoard";
import { ReviewBoard } from "./boards/review/ReviewBoard";
import { TestBoard } from "./boards/test/TestBoard";
import { RefinementBoard } from "./boards/refinement/RefinementBoard";
import { LandingPage, type AppKey, type TeamKey } from "./landing/LandingPage";
import { SupportApp } from "./support/SupportApp";
import { DocumentationApp } from "./documentation/DocumentationApp";
import { TestingApp } from "./testing/TestingApp";
import type { NavigableBoardId } from "./components/BoardShell";

type Route =
  | { app: "landing" }
  | { app: "scrum"; board: NavigableBoardId; team: TeamKey }
  | { app: "support" }
  | { app: "documentation" }
  | { app: "testing" };

const NAVIGABLE_BOARDS: readonly NavigableBoardId[] = ["dailys", "review", "test", "refinement"];

/**
 * `?board=dailys` skips the landing page and opens straight into that board - see vice-SM.bat,
 * which opens the client at exactly that URL for a colleague who only ever needs the Daily board.
 * No `team` param on purpose: the header's own Team toggle (Nord/Syd) already switches after
 * landing, and threading a second query param through a .bat file's `&`-as-command-separator is
 * more trouble than it's worth for a one-click fix.
 */
function initialRoute(): Route {
  const parameters = new URLSearchParams(window.location.search);
  if (parameters.get("app") === "testing") return { app: "testing" };
  const board = parameters.get("board");
  return NAVIGABLE_BOARDS.includes(board as NavigableBoardId)
    ? { app: "scrum", board: board as NavigableBoardId, team: "Syd" }
    : { app: "landing" };
}

export default function App() {
  // Plain state rather than a router: three apps, a handful of views, and no deep links yet. Swap
  // for a real router the moment someone wants to send a colleague a link to a view.
  const [route, setRoute] = useState<Route>(initialRoute);

  function open(app: AppKey, team?: TeamKey) {
    // The team comes from the start page's second step. Syd is the fallback for the callers that
    // have no team to give - support and documentation - and is never actually used by either.
    setRoute(app === "scrum" ? { app: "scrum", board: "dailys", team: team ?? "Syd" } : { app });
  }

  const home = () => {
    history.replaceState({}, "", window.location.pathname);
    setRoute({ app: "landing" });
  };

  if (route.app === "landing") return <LandingPage onPick={open} />;
  if (route.app === "support") return <SupportApp onHome={home} />;
  if (route.app === "documentation") return <DocumentationApp onHome={home} />;
  if (route.app === "testing") return <TestingApp onHome={home} />;

  const navigate = (board: NavigableBoardId) => setRoute({ ...route, board });
  // Owned here rather than by each board, so switching team from any board's header carries over
  // to the others instead of resetting to Syd the moment you change tabs.
  const changeTeam = (team: TeamKey) => setRoute({ ...route, team });
  if (route.board === "review") return <ReviewBoard team={route.team} onTeamChange={changeTeam} onNavigate={navigate} onHome={home} />;
  if (route.board === "test") return <TestBoard team={route.team} onTeamChange={changeTeam} onNavigate={navigate} onHome={home} />;
  if (route.board === "refinement") return <RefinementBoard team={route.team} onTeamChange={changeTeam} onNavigate={navigate} onHome={home} />;
  return <DailysBoard team={route.team} onTeamChange={changeTeam} onNavigate={navigate} onHome={home} />;
}
