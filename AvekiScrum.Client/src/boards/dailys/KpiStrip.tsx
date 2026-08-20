import type { DailyStoryDto } from "../../api/dailys";
import { pct, summarizeStories } from "./dailysLogic";
import "./KpiStrip.css";

interface KpiStripProps {
  stories: DailyStoryDto[];
}

export function KpiStrip({ stories }: KpiStripProps) {
  // Counted by Azure state, so these always add up to the total and always agree with what the
  // Status filter selected - filtering on Closed now really does report every card as klart.
  const { total, done, active, newCount, totalSP, doneSP } = summarizeStories(stories);
  const alerts = stories.filter((s) => s.alertLevel === "Warning" || s.alertLevel === "Critical").length;

  const cards = [
    { label: "Kort totalt", val: total, sub: "i sprinten", accent: "info" as const },
    { label: "Aktiva", val: active, sub: "Active/Resolved", accent: active ? "info" : "muted" as const },
    { label: "Klara", val: done, sub: `av ${total} kort`, accent: done ? "success" : "muted" as const },
    { label: "Ej startade", val: newCount, sub: "i kön", accent: "muted" as const },
    { label: "Story Points", val: totalSP, sub: "sprintkapacitet", accent: "info" as const },
    {
      label: "SP klara",
      val: doneSP,
      sub: `${pct(doneSP, totalSP)}% levererat`,
      accent: doneSP ? "success" : "muted" as const,
      alerts,
    },
  ];

  return (
    <div className="kpi-strip">
      {cards.map((c) => (
        <div className="kpi" key={c.label}>
          <div className={`kpi-accent kpi-accent--${c.accent}`} />
          <div className="kpi-label">{c.label}</div>
          <div className={`kpi-val kpi-val--${c.accent}`}>{c.val}</div>
          <div className="kpi-sub">
            {c.sub}
            {c.alerts ? <span className="kpi-alert"> ⚠ {c.alerts} alerts</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
