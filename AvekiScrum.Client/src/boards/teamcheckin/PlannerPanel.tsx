import "./PlannerPanel.css";

const PLANNER_URL = "https://planner.cloud.microsoft/webui/plan/ALag4dZ-RkqdozqBxshNd5cAC2u4/view/board?tid=48e7c764-137b-4c2b-8521-8e0e1f19f10b";

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
      <a className="wi-btn wi-btn--primary tcb-planner__open" href={PLANNER_URL} target="_blank" rel="noreferrer">
        Öppna aktivitetsboarden ↗
      </a>
    </div>
  );
}
