import { useEffect, useState } from "react";
import { fetchSprints, type DeveloperTeamId } from "../../api/dailys";
import { fetchSprintGoals, fetchSprintGoalsWikiUrl, setSprintGoalsWikiUrl, type SprintGoal } from "../../api/sprintGoals";
import { fetchCrossTeamTaggedItems } from "../../api/teamCheckIn";
import type { ProductBacklogItem } from "../../api/refinement";
import { toRelationRef } from "../refinement/refinementLogic";
import { WorkItemRefCard } from "../../components/workitem/WorkItemRefCard";
import { useWorkItemModals } from "../../components/workitem/useWorkItemModals";
import { useToast } from "../../components/Toast";
import { prefetchReleaseData, prefetchTestData } from "./teamCheckInPrefetch";
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

/** Wiki checklist rows sometimes already start with their own ☐/☑/[ ]/- marker; strip it so the
 *  rendered checkbox isn't doubled up - same helper as DailyFlow's GoalTurn. */
function stripLeadingMarker(text: string): string {
  return text.replace(/^\s*(?:[☐☑☒✓✔]|\[[ xX]?\]|[-*])\s*/, "");
}

/**
 * The Scrum Master's own agenda step - the one role this board has real content for so far (see
 * RolePlaceholderPanel for the rest). Week 1 of a sprint: every sprint goal, one team at a time, in
 * full (description, owners, expert, deliverables, Definition of Done, sub-goals). Any other week:
 * work items tagged "Berör både teamen" in the current sprint, across both teams.
 */
export function ScrumMasterView() {
  const { showToast } = useToast();
  const [week, setWeek] = useState<SprintWeek>("later");
  const [goalsTeam, setGoalsTeam] = useState<DeveloperTeamId>("Nord");
  const [goalsByTeam, setGoalsByTeam] = useState<Record<DeveloperTeamId, SprintGoal[]>>({ Nord: [], Syd: [] });
  const [items, setItems] = useState<ProductBacklogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The wiki page changes every sprint - editable inline instead of needing a config-file edit.
  const [wikiUrl, setWikiUrl] = useState("");
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);

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

        // Warms up Release/Test-ansvarig's own (heavy) data now that this step's own load is done,
        // so it's already in flight - often already finished - by the time the agenda gets there.
        // Fire-and-forget: a failure here just means that step starts cold, same as before; it'll
        // report its own error normally when it awaits the same promise itself.
        prefetchTestData().catch(() => {});
        prefetchReleaseData().catch(() => {});
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

  useEffect(() => {
    if (week !== "week1") return;
    let cancelled = false;
    fetchSprintGoalsWikiUrl(goalsTeam)
      .then((url) => !cancelled && setWikiUrl(url))
      .catch(() => !cancelled && setWikiUrl(""));
    return () => {
      cancelled = true;
    };
  }, [week, goalsTeam]);

  async function saveWikiUrl() {
    setSavingUrl(true);
    try {
      await setSprintGoalsWikiUrl(goalsTeam, urlDraft.trim());
      setWikiUrl(urlDraft.trim());
      setEditingUrl(false);
      const goals = await fetchSprintGoals(goalsTeam);
      setGoalsByTeam((prev) => ({ ...prev, [goalsTeam]: goals }));
      showToast("Sprintmål-länken uppdaterad.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Kunde inte spara länken.", "error");
    } finally {
      setSavingUrl(false);
    }
  }

  if (loading) return <p className="dailys-board__status">Hämtar…</p>;
  if (error) return <p className="dailys-board__status dailys-board__status--error">Fel: {error}</p>;

  if (week === "week1") {
    const goals = goalsByTeam[goalsTeam];
    return (
      <div className="tcb-sm">
        <div className="tcb-sm__head">
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
        </div>

        <div className="tcb-sm__wikiurl">
          {editingUrl ? (
            <>
              <input
                type="text"
                className="tcb-sm__wikiurl-input"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                placeholder="https://dev.azure.com/.../_wiki/wikis/.../Sprint-X-(...)"
                autoFocus
              />
              <button type="button" className="wi-btn wi-btn--primary" onClick={() => void saveWikiUrl()} disabled={savingUrl}>
                {savingUrl ? "Sparar…" : "Spara"}
              </button>
              <button type="button" className="wi-btn" onClick={() => setEditingUrl(false)} disabled={savingUrl}>
                Avbryt
              </button>
            </>
          ) : (
            <>
              <span className="tcb-sm__wikiurl-label">Wiki-länk ({goalsTeam}):</span>
              <span className="tcb-sm__wikiurl-value" title={wikiUrl}>
                {wikiUrl || "(ingen inställd)"}
              </span>
              <button
                type="button"
                className="wi-btn"
                onClick={() => {
                  setUrlDraft(wikiUrl);
                  setEditingUrl(true);
                }}
              >
                Ändra
              </button>
            </>
          )}
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
                {(g.owners.length > 0 || g.expert) && (
                  <div className="tcb-sm__goal-meta">
                    {g.owners.length > 0 && <span>Ansvarig: {g.owners.join(", ")}</span>}
                    {g.expert && <span>Sakkunnig: {g.expert}</span>}
                  </div>
                )}
                {g.deliverables.length > 0 && (
                  <div className="tcb-sm__goal-section">
                    <div className="tcb-sm__goal-section-title">Delleverans</div>
                    <ul className="tcb-sm__checklist">
                      {g.deliverables.map((d) => (
                        <li key={d.id} className={d.done ? "tcb-sm__checklist-done" : ""}>
                          {d.done ? "☑" : "☐"} {stripLeadingMarker(d.text)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {g.definitionOfDone.length > 0 && (
                  <div className="tcb-sm__goal-section">
                    <div className="tcb-sm__goal-section-title">Definition of Done</div>
                    <ul className="tcb-sm__checklist">
                      {g.definitionOfDone.map((d) => (
                        <li key={d.id} className={d.checked ? "tcb-sm__checklist-done" : ""}>
                          {d.checked ? "☑" : "☐"} {stripLeadingMarker(d.text)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {g.subGoals.length > 0 && (
                  <div className="tcb-sm__goal-section">
                    <div className="tcb-sm__goal-section-title">Delmål</div>
                    <div className="tcb-sm__subgoals">
                      {g.subGoals.map((s) => (
                        <div className="tcb-sm__subgoal" key={s.id}>
                          <div className="tcb-sm__subgoal-title">{s.title}</div>
                          {s.description && <p className="tcb-sm__subgoal-desc">{s.description}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
