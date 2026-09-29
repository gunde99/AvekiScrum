import "./PlannerPanel.css";

const PLANNER_URL = "https://planner.cloud.microsoft/webui/plan/yNIigqf0DES3l0ZtgrMx5JcAE8Kl/view/board?tid=48e7c764-137b-4c2b-8521-8e0e1f19f10b";

// A fixed, non-"_blank" window name: browsers reuse and focus an already-open tab/window opened
// under the same name instead of opening a new one - exactly what lets Miro click this link ahead
// of the meeting to let Planner's own slow load finish, then jump straight back to that same tab
// once the agenda reaches this step, instead of piling up a fresh tab every time.
//
// This only works without rel="noopener"/"noreferrer": per the HTML spec, either of those forces a
// brand-new top-level browsing context on every click, ignoring the named-window lookup entirely -
// which is exactly the "opens a new tab every time" bug this had at first. Safe to drop here since
// the target is a fixed, hardcoded, trusted Microsoft URL, not anything user-supplied.
const PLANNER_WINDOW_NAME = "aveki-planner-board";

/**
 * Microsoft Planner refuses to be framed (it sends X-Frame-Options: Deny on every page, including
 * the board view) - there is no supported way to embed it inline, and no public API to make an
 * embedded instance jump to a specific bucket either. So instead of a broken/blank iframe, this is
 * a clean launcher card: one click opens the real board in its own tab.
 */
export function PlannerPanel() {
  return (
    <div className="tcb-planner">
      <div className="tcb-planner__icon">📋</div>
      <div className="tcb-planner__title">Aktivitetsboarden</div>
      <p className="tcb-planner__desc">Microsoft Planner tillåter inte inbäddning av sina sidor, så boarden öppnas i ett eget fönster.</p>
      <a className="wi-btn wi-btn--primary tcb-planner__open" href={PLANNER_URL} target={PLANNER_WINDOW_NAME}>
        Öppna aktivitetsboarden ↗
      </a>
    </div>
  );
}
