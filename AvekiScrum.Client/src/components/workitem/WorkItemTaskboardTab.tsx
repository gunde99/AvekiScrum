import type { WorkItemDetail, WorkItemRelationRef } from "../../api/workitems";
import type { PersonOption } from "../../api/people";
import { NewWorkItemForm } from "./NewWorkItemForm";
import { WorkItemRefCard } from "./WorkItemRefCard";
import "./WorkItemTaskboardTab.css";

interface WorkItemTaskboardTabProps {
  detail: WorkItemDetail;
  onOpenRelation: (item: WorkItemRelationRef, relationLabel: string) => void;
  onCreated: () => void;
  people: PersonOption[];
}

const STATE_ORDER = ["New", "Active", "Resolved", "Closed", "Done", "Removed"];

export function WorkItemTaskboardTab({ detail, onOpenRelation, onCreated, people }: WorkItemTaskboardTabProps) {
  const tasks = detail.children.filter((c) => c.type === "Task");

  const presentStates = [...new Set(tasks.map((t) => t.state))];
  const orderedStates = [...STATE_ORDER.filter((s) => presentStates.includes(s)), ...presentStates.filter((s) => !STATE_ORDER.includes(s))];

  return (
    <div className="wi-taskboard-tab">
      <NewWorkItemForm source={detail} linkKind="child" types={["Task"]} people={people} onCreated={onCreated} />
      {tasks.length === 0 && <p className="wi-empty-state">Inga tasks under det här kortet.</p>}
      <div className="wi-taskboard">
      {orderedStates.map((state) => {
        const inState = tasks.filter((t) => t.state === state);
        return (
          <div className="wi-taskboard__column" key={state}>
            <div className="wi-taskboard__head">
              <span>{state}</span>
              <span className="wi-taskboard__count">{inState.length}</span>
            </div>
            <div className="wi-taskboard__cards">
              {inState.map((task) => (
                <WorkItemRefCard key={task.id} item={task} onOpen={() => onOpenRelation(task, "Task")} />
              ))}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
