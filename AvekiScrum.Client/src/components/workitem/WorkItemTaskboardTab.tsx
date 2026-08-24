import { useState } from "react";
import {
  fetchWorkItemDetail,
  updateWorkItemFields,
  type ClassificationOptions,
  type WorkItemDetail,
  type WorkItemRelationRef,
} from "../../api/workitems";
import type { PersonOption } from "../../api/people";
import { useToast } from "../Toast";
import { NewWorkItemForm } from "./NewWorkItemForm";
import { WorkItemRefCard } from "./WorkItemRefCard";
import "./WorkItemTaskboardTab.css";

interface WorkItemTaskboardTabProps {
  detail: WorkItemDetail;
  onOpenRelation: (item: WorkItemRelationRef, relationLabel: string) => void;
  onCreated: (detail: WorkItemDetail) => void;
  people: PersonOption[];
  /** The process template's own states, so the lanes match what Azure will accept. */
  classification: ClassificationOptions | null;
}

/** Used when the process template can't be read - the states this project's Tasks actually use. */
const FALLBACK_STATES = ["New", "Active", "Closed"];

/** Never a lane: a removed task is in the recycle bin, not a column to drag things into. */
const HIDDEN_STATES = new Set(["Removed"]);

/**
 * Left to right in the order work actually moves. The process template hands them back in its own
 * order (alphabetical, as it turns out), and a board that reads Active → Closed → New asks you to
 * translate every time you look at it.
 */
const WORKFLOW_ORDER = ["New", "Proposed", "To Do", "Active", "In Progress", "Doing", "Resolved", "Done", "Closed"];

function inWorkflowOrder(states: string[]): string[] {
  const rank = (state: string) => {
    const index = WORKFLOW_ORDER.findIndex((s) => s.toLowerCase() === state.toLowerCase());
    // Anything the list doesn't know goes last, keeping its own relative order.
    return index < 0 ? WORKFLOW_ORDER.length : index;
  };
  return [...states].sort((a, b) => rank(a) - rank(b));
}

export function WorkItemTaskboardTab({
  detail,
  onOpenRelation,
  onCreated,
  people,
  classification,
}: WorkItemTaskboardTabProps) {
  const { showToast } = useToast();
  const [movingId, setMovingId] = useState<number | null>(null);
  const [dragOverState, setDragOverState] = useState<string | null>(null);

  const tasks = detail.children.filter((c) => c.type === "Task");

  // Every lane, always - an empty column is what tells you the state exists and can be dragged
  // into. Before this the board only drew the states that happened to be occupied, so a card could
  // never be moved anywhere new.
  const templateStates = classification?.fieldOptions?.["Task"]?.["System.State"] ?? [];
  const known = templateStates.length > 0 ? templateStates : FALLBACK_STATES;
  const lanes = inWorkflowOrder([
    ...known.filter((s) => !HIDDEN_STATES.has(s)),
    // A task sitting in a state the template no longer offers still has to be visible somewhere.
    ...[...new Set(tasks.map((t) => t.state))].filter((s) => !HIDDEN_STATES.has(s) && !known.includes(s)),
  ]);

  async function moveTask(taskId: number, targetState: string) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.state === targetState) return;

    setMovingId(taskId);
    try {
      await updateWorkItemFields(taskId, { state: targetState });
      // Refetch the parent rather than patching the child in place: the story's own state and its
      // roll-up can change as a consequence, and guessing at that is how the two drift apart.
      onCreated(await fetchWorkItemDetail(detail.id));
      showToast(`Task #${taskId} flyttad till "${targetState}".`, "success");
    } catch (err) {
      showToast(
        `Kunde inte flytta #${taskId}: ${err instanceof Error ? err.message : "Okänt fel"}`,
        "error",
      );
    } finally {
      setMovingId(null);
    }
  }

  return (
    <div className="wi-taskboard-tab">
      <NewWorkItemForm source={detail} linkKind="child" types={["Task"]} people={people} onCreated={onCreated} />
      {tasks.length === 0 && <p className="wi-empty-state">Inga tasks under det här kortet.</p>}
      <div className="wi-taskboard">
        {lanes.map((state) => {
          const inState = tasks.filter((t) => t.state === state);
          return (
            <div
              className={
                "wi-taskboard__column" + (dragOverState === state ? " wi-taskboard__column--dragover" : "")
              }
              key={state}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverState !== state) setDragOverState(state);
              }}
              onDragLeave={() => setDragOverState((current) => (current === state ? null : current))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverState(null);
                const taskId = Number(e.dataTransfer.getData("text/plain"));
                if (Number.isFinite(taskId)) void moveTask(taskId, state);
              }}
            >
              <div className="wi-taskboard__head">
                <span>{state}</span>
                <span className="wi-taskboard__count">{inState.length}</span>
              </div>
              <div className="wi-taskboard__cards">
                {inState.map((task) => (
                  <div
                    key={task.id}
                    className={"wi-taskboard__draggable" + (movingId === task.id ? " wi-taskboard__draggable--busy" : "")}
                    draggable={movingId === null}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", String(task.id));
                      e.dataTransfer.effectAllowed = "move";
                    }}
                  >
                    <WorkItemRefCard item={task} onOpen={() => onOpenRelation(task, "Task")} />
                  </div>
                ))}
                {inState.length === 0 && <span className="wi-taskboard__empty">–</span>}
              </div>
            </div>
          );
        })}
      </div>
      {tasks.length > 0 && <p className="wi-taskboard__hint">Dra ett kort till en annan status för att spara det i Azure DevOps.</p>}
    </div>
  );
}
