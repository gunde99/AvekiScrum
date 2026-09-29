import { useState } from "react";
import { CombinedTestView } from "./CombinedTestView";
import { ReleaseOpenItemsView } from "./ReleaseOpenItemsView";
import "./ReleaseTestView.css";

type Tab = "test" | "release";

/** Release/Test-ansvarigs agenda step: two clearly separate tabs - a live test board and a
 *  "what's still open in old sprints" release check. Different questions, different data shapes,
 *  no reason to force them into one screen. */
export function ReleaseTestView() {
  const [tab, setTab] = useState<Tab>("test");

  return (
    <div className="tcb-rt">
      <div className="wi-tabs tcb-rt__tabs">
        <button type="button" className={"wi-tabs__item" + (tab === "test" ? " wi-tabs__item--active" : "")} onClick={() => setTab("test")}>
          Test
        </button>
        <button type="button" className={"wi-tabs__item" + (tab === "release" ? " wi-tabs__item--active" : "")} onClick={() => setTab("release")}>
          Release
        </button>
      </div>
      {tab === "test" ? <CombinedTestView /> : <ReleaseOpenItemsView />}
    </div>
  );
}
