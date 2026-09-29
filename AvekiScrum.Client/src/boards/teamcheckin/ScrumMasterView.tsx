import { useEffect, useState } from "react";
import { fetchSprints, type DeveloperTeamId } from "../../api/dailys";
import { fetchSprintGoals, type SprintGoal } from "../../api/sprintGoals";
import { fetchCrossTeamTaggedItems } from "../../api/teamCheckIn";
import type { ProductBacklogItem } from "../../api/refinement";
import { toRelationRef } from "../refinement/refinementLogic";
import { WorkItemRefCard } from "../../components/workitem/WorkItemRefCard";
import { useWorkItemModals } from "../../components/workitem/useWorkItemModals";
import "./ScrumMasterView.css";

type SprintWeek = "week1" | "later";

/** First 7 calendar days of the sprint - both teams share the same sprint cadence, so either
 *  team's current sprint answers this the same way. No current sprint found -> fall back to the
 *  "later" view, since listing whatever's tagged is still a reasonable default. */
function resolveSprintWeek(startDateIso: string | undefined): SprintWeek {
  if (!startDateIso) return "later";
  const days = (Date.now() - new Date(startDateIso).getTime()) / (1000 * 60 * 60 * 24);
  return days < 7 ? "week1" : "later";
}

/**
 * The Scrum Master's own agenda step - the one role this board has real content for so far (see
 * RolePlaceholderPanel for the rest). Week 1 of a sprint: every sprint goal, one team at a time.
 * Any other week: work items tagged "Berör både teamen" in the current sprint, across both teams.
 */
export function ScrumMasterView() {
  const [week, setWeek] = useState<SprintWeek>("later");
  const [goalsTeam, setGoalsTeam] = useState<DeveloperTeamId>("Nord");
  const [goalsByTeam, setGoalsByTeam] = useState<Record<DeveloperTeamId, SprintGoal[]>>({ Nord: [], Syd: [] });
  const [items, setItems] = useState<ProductBacklogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fixed team, independent of the Nord/Syd goals toggle below - only used by the Validering
  // sub-flow, which this glance-only view doesn't exercise per item.
  const { setOpenWorkItemId, modals } = useWorkItemModals({ team: "Nord" });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSprints("Nord")
      .then(async (sprints) => {
        if (cancelled) return;
        const current = sprints.find((s) => s.isCurrent) ?? sprints[0];
        const resolvedWeek = resolveSprintWeek(current?.startDate);
        setWeek(resolvedWeek);

        if (resolvedWeek === "week1") {
          const [nord, syd] = await Promise.all([fetchSprintGoals("Nord"), fetchSprintGoals("Syd")]);
          if (cancelled) return;
          setGoalsByTeam({ Nord: nord, Syd: syd });
        } else {
          const backlog = await fetchCrossTeamTaggedItems();
          if (cancelled) return;
          setItems(backlog.items);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Kunde inte hämta data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p className="dailys-board__status">Hämtar…</p>;
  if (error) return <p className="dailys-board__status dailys-board__status--error">Fel: {error}</p>;

  if (week === "week1") {
    const goals = goalsByTeam[goalsTeam];
    return (
      <div className="tcb-sm">
        <div className="tcb-sm__hint">Vecka 1 - sprintmål</div>
        <div className="tcb-sm__team-toggle" role="group" aria-label="Team">
          {(["Nord", "Syd"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={"dailys-board__tab" + (goalsTeam === t ? " dailys-board__tab--active" : "")}
              onClick={() => setGoalsTeam(t)}
            >
              Team {t}
            </button>
          ))}
        </div>
        {goals.length === 0 ? (
          <p className="dailys-board__status">Inga sprintmål hittades för Team {goalsTeam}.</p>
        ) : (
          <div className="tcb-sm__goals">
            {goals.map((g) => (
              <div className="tcb-sm__goal" key={g.id}>
                <div className="tcb-sm__goal-title">
                  Sprintmål {g.number} - {g.title}
                </div>
                {g.description && <p className="tcb-sm__goal-desc">{g.description}</p>}
                {g.owners.length > 0 && <div className="tcb-sm__goal-owners">Ansvarig: {g.owners.join(", ")}</div>}
              </div>
            ))}
          </div>
        )}
        {modals}
      </div>
    );
  }

  return (
    <div className="tcb-sm">
      <div className="tcb-sm__hint">Kort taggade "Berör både teamen" i aktuell sprint</div>
      {items.length === 0 ? (
        <p className="dailys-board__status">Inga kort taggade "Berör både teamen" just nu.</p>
      ) : (
        <div className="tcb-sm__cards">
          {items.map((item) => (
            <WorkItemRefCard key={item.id} item={toRelationRef(item)} onOpen={() => setOpenWorkItemId(item.id)} />
          ))}
        </div>
      )}
      {modals}
    </div>
  );
}
