import { useState } from "react";
import { DailysBoard } from "./boards/dailys/DailysBoard";
import { ReviewBoard } from "./boards/review/ReviewBoard";

type Board = "dailys" | "review";

export default function App() {
  // Plain state rather than a router: there are two boards and no deep links to support yet.
  const [board, setBoard] = useState<Board>("dailys");

  return board === "review" ? (
    <ReviewBoard onNavigate={setBoard} />
  ) : (
    <DailysBoard onNavigate={setBoard} />
  );
}
