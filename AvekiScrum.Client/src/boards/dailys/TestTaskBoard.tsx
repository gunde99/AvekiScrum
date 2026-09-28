import { useEffect, useMemo, useState } from "react";
import { PersonAvatar } from "../../components/PersonAvatar";
import { useToast } from "../../components/Toast";
import { getWorkItemTypeConfig } from "../../components/workitem/workItemTypeConfig";
import { fetchAllPeople, type PersonOption } from "../../api/people";
import { updateWorkItemFields } from "../../api/workitems";
import type { DailyStoryDto } from "../../api/dailys";
import { fullPersonName, type SortDir } from "./dailysLogic";
import {
  ageChangeLabel,
  ageSourceDate,
  buildTestTaskRows,
  classifyTestStatus,
  groupTestTasks,
  matchesTestSearch,
  sortTestTasks,
  statusAge,
  statusBadgeClass,
  testResultFromTags,
  PRIORITY_EMOJI,
  PRIORITY_LABELS,
  TEST_GROUP_MODE_LABELS,
  TEST_SORT_LABELS,
  TEST_STATUS_LABELS,
  TEST_STATUS_ORDER,
  type TestGroupMode,
  type TestSortKey,
  type TestStatusBucket,
  type TestTaskRow,
} from "./testBoardLogic";
import "./TestTaskBoard.css";

/** One extra iteration's stories, folded in alongside allStories - see TestBoard.tsx's iteration
 *  filter, which is the only place that populates this today. */
export interface ExtraTestIteration {
  path: string;
  label: string;
  stories: DailyStoryDto[];
}

interface TestTaskBoardProps {
  allStories: DailyStoryDto[];
  onOpenWorkItem: (id: number) => void;
  onTaskAssigned?: (taskId: number, displayName: string) => void;
  /** Embedded in the daily flow's test-lead turn - a little tighter, no page chrome of its own. */
  embedded?: boolean;
  /** Which sprint allStories itself belongs to - only used to label rows once extraIterations
   *  brings in a second sprint (see showSprintTags below); omitted by the embedded daily-flow use,
   *  which never has extra iterations, so nothing there changes. */
  currentIteration?: { path: string; label: string };
  /** Extra iterations' stories to fold in alongside allStories, from TestBoard.tsx's own iteration
   *  filter. Left undefined/empty everywhere else, which reproduces today's single-iteration board
   *  exactly - this is additive, not a replacement for allStories. */
  extraIterations?: ExtraTestIteration[];
  /** Whether extraIterations' own closed test tasks are included - trims the historical noise an
   *  old, fully-wrapped-up sprint would otherwise dump into the board by default. The *current*
   *  iteration's closed tasks are unaffected either way (existing behaviour, via the status
   *  filter). Ignored when extraIterations is empty. */
  includeClosedFromExtra?: boolean;
}

/**
 * The test board: every test task across the team's sprint, groupable by status, tester,
 * developer (the parent card's owner) or sprint goal, filterable and sortable. Shared between the
 * daily flow's test-lead turn (embedded, with the mood gauge wrapped around it - see DailyFlow.tsx)
 * and its own standalone tab (TestBoard.tsx) - the same board either way, since what a tester needs
 * to see doesn't change just because it's not currently someone's turn to talk.
 */
export function TestTaskBoard({
  allStories,
  onOpenWorkItem,
  onTaskAssigned,
  embedded,
  currentIteration,
  extraIterations,
  includeClosedFromExtra,
}: TestTaskBoardProps) {
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [busyTaskId, setBusyTaskId] = useState<number | null>(null);
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  // The prop is a point-in-time snapshot from the sprint fetch - a priority change is applied
  // straight to Azure but only reflected back here optimistically, the same way pickerFor's
  // assignedTo change relies on onTaskAssigned patching the parent's own copy instead of a refetch.
  const [priorityOverrides, setPriorityOverrides] = useState<Map<number, number>>(new Map());
  const [priorityEditingFor, setPriorityEditingFor] = useState<number | null>(null);
  const [busyPriorityTaskId, setBusyPriorityTaskId] = useState<number | null>(null);
  const [groupMode, setGroupMode] = useState<TestGroupMode>("status");
  const [sortKey, setSortKey] = useState<TestSortKey>("changed");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<TestStatusBucket> | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [collapsedInitialized, setCollapsedInitialized] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    fetchAllPeople()
      .then((p) => !cancelled && setPeople(p))
      .catch(() => !cancelled && setPeople([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const all = useMemo(() => {
    const primaryRows = buildTestTaskRows(allStories).map((r) => ({
      ...r,
      sprintLabel: currentIteration?.label,
      sprintPath: currentIteration?.path,
    }));
    // An older, long-finished sprint is mostly closed tasks - folding all of it in by default would
    // bury the very "still lingering, forgot about it" cards the iteration filter exists to surface.
    const extraRows = (extraIterations ?? []).flatMap((it) => {
      const rows = buildTestTaskRows(it.stories).map((r) => ({ ...r, sprintLabel: it.label, sprintPath: it.path }));
      return includeClosedFromExtra ? rows : rows.filter((r) => (r.status || "").trim().toLowerCase() !== "closed");
    });
    const rows = [...primaryRows, ...extraRows];
    if (priorityOverrides.size === 0) return rows;
    return rows.map((r) => (priorityOverrides.has(r.id) ? { ...r, priority: priorityOverrides.get(r.id)! } : r));
  }, [allStories, currentIteration, extraIterations, includeClosedFromExtra, priorityOverrides]);

  // Only worth a badge once the rows actually span more than one sprint - a plain single-iteration
  // board (every embedded use, and the standalone one until someone opens the iteration filter)
  // renders exactly as it did before this existed.
  const showSprintTags = useMemo(() => new Set(all.map((r) => r.sprintLabel).filter(Boolean)).size > 1, [all]);

  const availableStatuses = useMemo(() => {
    const present = new Set(all.map(classifyTestStatus));
    return TEST_STATUS_ORDER.filter((b) => present.has(b));
  }, [all]);

  const visible = useMemo(() => {
    const activeStatuses = statusFilter ?? new Set(availableStatuses);
    return all.filter((row) => activeStatuses.has(classifyTestStatus(row)) && matchesTestSearch(row, search));
  }, [all, statusFilter, availableStatuses, search]);

  const groups = useMemo(() => {
    const g = groupTestTasks(visible, groupMode);
    return g.map((group) => ({ ...group, tasks: sortTestTasks(group.tasks, sortKey, sortDir) }));
  }, [visible, groupMode, sortKey, sortDir]);

  // Seeded once per mount from each group's own "collapse by default" - after that the person's
  // own clicks win, including across a group-mode switch (re-collapsing "Klart" every time you
  // change how it's grouped would undo the one click that opened it).
  useEffect(() => {
    if (collapsedInitialized) return;
    const initial = new Set(groups.filter((g) => g.collapsedByDefault).map((g) => g.key));
    if (initial.size > 0) setCollapsed(initial);
    setCollapsedInitialized(true);
  }, [groups, collapsedInitialized]);

  function toggleGroup(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleStatus(bucket: TestStatusBucket) {
    setStatusFilter((prev) => {
      const base = prev ?? new Set(availableStatuses);
      const next = new Set(base);
      if (next.has(bucket)) next.delete(bucket);
      else next.add(bucket);
      return next;
    });
  }

  function toggleSort(key: TestSortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  async function handleAssign(task: TestTaskRow, person: PersonOption) {
    setBusyTaskId(task.id);
    try {
      await updateWorkItemFields(task.id, { assignedTo: person.email });
      showToast(`#${task.id} tilldelad ${person.displayName}.`, "success");
      onTaskAssigned?.(task.id, person.displayName);
    } catch (err) {
      showToast(`Kunde inte tilldela #${task.id}: ${err instanceof Error ? err.message : "Okänt fel"}`, "error");
    } finally {
      setBusyTaskId(null);
    }
  }

  async function handlePriorityChange(task: TestTaskRow, priority: number) {
    setBusyPriorityTaskId(task.id);
    try {
      await updateWorkItemFields(task.id, { priority });
      setPriorityOverrides((prev) => new Map(prev).set(task.id, priority));
      showToast(`#${task.id} satt till P${priority}.`, "success");
    } catch (err) {
      showToast(`Kunde inte ändra prioritet för #${task.id}: ${err instanceof Error ? err.message : "Okänt fel"}`, "error");
    } finally {
      setBusyPriorityTaskId(null);
    }
  }

  const unassignedCount = visible.filter((t) => !t.assignedTo).length;

  // A freshly-mounted <select> only focuses on its own - opening the actual dropdown still took a
  // second click. showPicker() (Chrome/Edge 121+, Firefox 130+) opens it immediately; where it
  // isn't available the select is still focused and usable via click or keyboard as before.
  function openPickerOnMount(el: HTMLSelectElement | null) {
    if (!el) return;
    el.focus();
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
      } catch {
        // Thrown when the browser doesn't consider this a user-gesture-driven call (or on an
        // unsupported platform) - the select is already focused, so nothing is actually lost.
      }
    }
  }

  return (
    <div className={"test-board" + (embedded ? " test-board--embedded" : "")}>
      <div className="test-board__toolbar">
        <div className="test-board__group" role="group" aria-label="Gruppera på">
          <span className="test-board__group-label">Gruppera på</span>
          <div className="test-board__group-body">
            {(Object.keys(TEST_GROUP_MODE_LABELS) as TestGroupMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={"test-board__tab" + (mode === groupMode ? " test-board__tab--active" : "")}
                onClick={() => setGroupMode(mode)}
              >
                {TEST_GROUP_MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        </div>

        <div className="test-board__group" role="group" aria-label="Sortera på">
          <span className="test-board__group-label">Sortera</span>
          <div className="test-board__group-body">
            {(Object.keys(TEST_SORT_LABELS) as TestSortKey[]).map((key) => (
              <button
                key={key}
                type="button"
                className={"test-board__tab" + (key === sortKey ? " test-board__tab--active" : "")}
                onClick={() => toggleSort(key)}
              >
                {TEST_SORT_LABELS[key]}
                {key === sortKey && <span className="test-board__sort-arrow">{sortDir === "asc" ? " ▲" : " ▼"}</span>}
              </button>
            ))}
          </div>
        </div>

        <input
          type="search"
          className="test-board__search"
          placeholder="Sök titel, #id…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {availableStatuses.length > 1 && (
        <div className="test-board__statusbar">
          {availableStatuses.map((bucket) => {
            const active = (statusFilter ?? new Set(availableStatuses)).has(bucket);
            const count = all.filter((r) => classifyTestStatus(r) === bucket).length;
            return (
              <button
                key={bucket}
                type="button"
                className={
                  "test-board__status" +
                  (statusBadgeClass(bucket) ? ` test-board__status--${statusBadgeClass(bucket)}` : "") +
                  (active ? " test-board__status--active" : "")
                }
                onClick={() => toggleStatus(bucket)}
                title={TEST_STATUS_LABELS[bucket]}
              >
                <span className="test-board__status-count">{count}</span>
                <span className="test-board__status-label">{TEST_STATUS_LABELS[bucket]}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="test-board__summary">
        <span className="df-stat">
          <strong>{visible.length}</strong> test-tasks
        </span>
        <span className="df-stat">
          <strong>{unassignedCount}</strong> utan ägare
        </span>
        {all.length !== visible.length && <span className="df-hint">{all.length - visible.length} dolda av filter</span>}
      </div>

      {visible.length === 0 ? (
        <p className="daily-flow__empty">Inga test-tasks matchar urvalet.</p>
      ) : (
        groups.map((group) => {
          const isCollapsed = collapsed.has(group.key);
          return (
            <div key={group.key} className="test-board__group-section">
              <button type="button" className="test-board__group-header" onClick={() => toggleGroup(group.key)}>
                <span className={"test-board__chevron" + (isCollapsed ? "" : " test-board__chevron--open")}>▶</span>
                {group.label} ({group.tasks.length})
              </button>
              {!isCollapsed && (
                <ul className="daily-flow__list test-board__task-list">
                  {group.tasks.map((t) => {
                    const bucket = classifyTestStatus(t);
                    const verdict = testResultFromTags(t.tags);
                    const age = statusAge(ageSourceDate(t, bucket), ageChangeLabel(bucket));
                    return (
                      <li key={t.id}>
                        <div className="df-row df-row--test">
                          <span
                            className={
                              "daily-flow__list-status" +
                              (statusBadgeClass(bucket) ? ` daily-flow__list-status--${statusBadgeClass(bucket)}` : "")
                            }
                          >
                            {verdict === "notok" ? "Test ej OK" : verdict === "ok" ? "Test OK" : t.status || "Ny"}
                          </span>
                          <button
                            type="button"
                            className="daily-flow__list-id df-row__id"
                            onClick={() => onOpenWorkItem(t.id)}
                            title="Öppna testkortet"
                          >
                            #{t.id}
                          </button>
                          <span className="test-board__priority">
                            <button
                              type="button"
                              className={"test-board__priority-btn" + (t.priority ? ` test-board__priority-btn--p${t.priority}` : "")}
                              onClick={() => setPriorityEditingFor(priorityEditingFor === t.id ? null : t.id)}
                              disabled={busyPriorityTaskId === t.id}
                              title="Klicka för att ändra prioritet"
                            >
                              {t.priority ? `${PRIORITY_EMOJI[t.priority]} P${t.priority}` : "– Prio"}
                            </button>
                            {priorityEditingFor === t.id && (
                              <select
                                className="df-assign__select"
                                ref={openPickerOnMount}
                                defaultValue={t.priority ?? ""}
                                onBlur={() => setPriorityEditingFor(null)}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setPriorityEditingFor(null);
                                  if (value) void handlePriorityChange(t, Number(value));
                                }}
                              >
                                <option value="">– Ingen –</option>
                                {[1, 2, 3, 4].map((p) => (
                                  <option key={p} value={p}>
                                    {PRIORITY_EMOJI[p]} {PRIORITY_LABELS[p]}
                                  </option>
                                ))}
                              </select>
                            )}
                          </span>
                          <span className="df-row__person">
                            <button
                              type="button"
                              className="df-assign"
                              onClick={() => setPickerFor(pickerFor === t.id ? null : t.id)}
                              title="Välj testare"
                              disabled={busyTaskId === t.id}
                            >
                              <PersonAvatar name={t.assignedTo} size={20} />
                              <span className="test-board__person-copy">
                                <small>Testare</small>
                                <span className={"daily-flow__list-owner" + (t.assignedTo ? "" : " df-assign__empty")}>
                                  {busyTaskId === t.id ? "Sparar…" : fullPersonName(t.assignedTo) || "Ej tilldelad"}
                                </span>
                              </span>
                            </button>
                            {pickerFor === t.id && (
                              <select
                                className="df-assign__select"
                                ref={openPickerOnMount}
                                defaultValue=""
                                onBlur={() => setPickerFor(null)}
                                onChange={(e) => {
                                  const person = people.find((p) => p.email === e.target.value);
                                  setPickerFor(null);
                                  if (person) void handleAssign(t, person);
                                }}
                              >
                                <option value="">– välj testare –</option>
                                {people.map((p) => (
                                  <option key={p.email} value={p.email}>
                                    {p.displayName}
                                  </option>
                                ))}
                              </select>
                            )}
                          </span>
                          <span
                            className="df-row__person test-board__developer"
                            title={"Huvudkortets utvecklare: " + (fullPersonName(t.storyDeveloper) || "Ej tilldelad")}
                          >
                            <PersonAvatar name={t.storyDeveloper} size={20} />
                            <span className="test-board__person-copy">
                              <small>Utvecklare</small>
                              <span className={"daily-flow__list-owner" + (t.storyDeveloper ? "" : " df-assign__empty")}>
                                {fullPersonName(t.storyDeveloper) || "Ej tilldelad"}
                              </span>
                            </span>
                          </span>
                          <span className={`test-board__status-age test-board__status-age--${age.tone}`} title={age.title}>
                            <small>{bucket === "assignedNotStarted" ? "Sedan tilldelning" : "I statusen"}</small>
                            <strong>{age.text}</strong>
                          </span>
                          <span className="df-row__title" title={`${t.title} (${t.storyTitle})`}>
                            {showSprintTags && t.sprintLabel && (
                              <span className="test-board__sprint-tag" title={`Från ${t.sprintLabel}`}>
                                {t.sprintLabel}
                              </span>
                            )}
                            <span>{t.title}</span>
                            <button
                              type="button"
                              className="daily-flow__list-parent daily-flow__list-parent--link"
                              onClick={() => onOpenWorkItem(t.storyId)}
                              title={`Öppna #${t.storyId} ${t.storyTitle}`}
                            >
                              <span className="test-board__story-icon" style={{ color: getWorkItemTypeConfig(t.storyType).color }}>
                                {getWorkItemTypeConfig(t.storyType).icon}
                              </span>
                              <span className="test-board__story-id">#{t.storyId}</span> {t.storyTitle}
                            </button>
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
