import type { DailyStoryDto } from "../../api/dailys";
import { pct } from "./dailysLogic";
import "./KpiStrip.css";

interface KpiStripProps {
  stories: DailyStoryDto[];
}

export function KpiStrip({ stories }: KpiStripProps) {
  const total = stories.length;
  const done = stories.filter((s) => s.stage === "Done").length;
  const active = stories.filter((s) => s.stage !== "Done" && s.stage !== "New").length;
  const nw = stories.filter((s) => s.stage === "New").length;
  const totalSP = stories.reduce((a, s) => a + (s.storyPoints || 0), 0);
  const doneSP = stories.filter((s) => s.stage === "Done").reduce((a, s) => a + (s.storyPoints || 0), 0);
  const alerts = stories.filter((s) => s.alertLevel === "Warning" || s.alertLevel === "Critical").length;

  const cards = [
    { label: "Stories totalt", val: total, sub: "i sprinten", accent: "info" as const },
    { label: "Aktiva", val: active, sub: "i arbete", accent: active ? "info" : "muted" as const },
    { label: "Klara", val: done, sub: `av ${total} stories`, accent: done ? "success" : "muted" as const },
    { label: "Ej startade", val: nw, sub: "i kön", accent: "muted" as const },
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
