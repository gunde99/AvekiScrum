import { useState, type DragEvent, type ReactNode } from "react";
import type { DailyPullRequestDto, DailyStoryDto, DailyTaskDto } from "../../api/dailys";
import { ageLabel, compactPersonName, isPullRequestDone, reviewerNames, type FlowLaneStage } from "./dailysLogic";
import "./Kanban.css";

interface LaneProps {
  label: string;
  laneCls: string;
  children: ReactNode;
  count: number;
  dropStage?: FlowLaneStage;
  onTaskDrop?: (taskId: number, targetLane: FlowLaneStage) => void;
}

function Lane({ label, laneCls, children, count, dropStage, onTaskDrop }: LaneProps) {
  const [dragOver, setDragOver] = useState(false);
  const droppable = !!dropStage && !!onTaskDrop;

  return (
    <div
      className={`kb-lane kb-lane--${laneCls} ${dragOver ? "kb-lane--drag-over" : ""}`}
      onDragOver={
        droppable
          ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDragOver(true);
            }
          : undefined
      }
      onDragLeave={droppable ? () => setDragOver(false) : undefined}
      onDrop={
        droppable
          ? (e) => {
              e.preventDefault();
              setDragOver(false);
              const taskId = Number(e.dataTransfer.getData("text/plain"));
              if (taskId && dropStage) onTaskDrop!(taskId, dropStage);
            }
          : undefined
      }
    >
      <div className="kb-lane-head">
        <span className="lane-name">{label}</span>
        <span className="lane-cnt">{count}</span>
      </div>
      <div className="kb-lane-body">{count ? children : <div className="kb-empty">–</div>}</div>
    </div>
  );
}

function TaskCard({ task, cls, draggable }: { task: DailyTaskDto; cls: string; draggable?: boolean }) {
  const statusLower = (task.status || "").toLowerCase();
  const isNotOk = statusLower === "notok";
  const finalCls = isNotOk ? "kb-card--notok" : cls;

  function handleDragStart(e: DragEvent<HTMLAnchorElement>) {
    e.dataTransfer.setData("text/plain", String(task.id));
    e.dataTransfer.effectAllowed = "move";
  }

  return (
    <a
      className={`kb-card ${finalCls} ${draggable ? "kb-card--draggable" : ""}`}
      href={task.webUrl}
      target="_blank"
      rel="noreferrer"
      draggable={draggable}
      onDragStart={draggable ? handleDragStart : undefined}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="kbc-head">
        <span className="kbc-key">#{task.id}</span>
        <span className={`kbc-status kbc-status--${statusLower}`}>{task.status || "Ny"}</span>
      </div>
      <div className="kbc-title">{task.title}</div>
      <div className="kbc-foot">
        <span>{task.assignedTo ? compactPersonName(task.assignedTo) : "–"}</span>
        {/* Tre lanes i stället för fyra ger bredd över - aktiviteten säger vad kortet är för
            sorts arbete utan att man behöver öppna det. */}
        {task.activity && <span className="kbc-activity">{task.activity}</span>}
        <span>{ageLabel(task.createdDate)}</span>
      </div>
    </a>
  );
}

function PrCard({ pr }: { pr: DailyPullRequestDto }) {
  const done = isPullRequestDone(pr);
  const status = (pr.status || "").toLowerCase();
  const cls = done ? "kb-card--done" : status === "abandoned" || status === "aborted" ? "kb-card--notok" : "kb-card--active";
  return (
    <a className={`kb-card ${cls}`} href={pr.webUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
      <div className="kbc-head">
        <span className="kbc-key">PR {pr.pullRequestId}</span>
        <span className="kbc-status">{done ? "Klar" : pr.status || "Aktiv"}</span>
      </div>
      <div className="kbc-title">{pr.title}</div>
      {pr.targetBranch && <div className="kbc-branch">→ {pr.targetBranch}</div>}
      <div className="kbc-foot">
        <span>{reviewerNames(pr.reviewers)}</span>
        <span>{ageLabel(pr.createdDate)}</span>
      </div>
    </a>
  );
}

interface KanbanProps {
  story: DailyStoryDto;
  onTaskDrop?: (taskId: number, targetLane: FlowLaneStage) => void;
}

export function Kanban({ story, onTaskDrop }: KanbanProps) {
  const tasks = story.tasks || [];
  const prs = story.pullRequests || [];

  if (!tasks.length && !prs.length) {
    return <div className="kb-empty-state">Inga tasks tillagda.</div>;
  }

  const devNew = tasks.filter((t) => t.stage === "New");
  // Resolved har ingen egen lane längre - teamet använder tre steg, inte fyra, och en tom fjärde
  // kolumn både stal bredd och bröt uppställningen mot de fyra rutorna nedanför. Kort som ändå
  // ligger på Resolved i Azure visas som aktiva; deras egen statusetikett säger var de står.
  const devActive = tasks.filter((t) => t.stage === "Active" || t.stage === "Resolved");
  const devDone = tasks.filter((t) => t.stage === "Done");
  const reviewTasks = tasks.filter((t) => t.stage === "CodeReview");
  const testTasks = tasks.filter((t) => t.stage === "Test");
  const docTasks = tasks.filter((t) => t.stage === "Documentation");

  return (
    <div className="kanban-board">
      <div className="kb-section">
        <div className="kb-section-label">
          Utvecklingsflöde
          {onTaskDrop && <span className="kb-section-hint">Dra kort för att ändra status</span>}
        </div>
        <div className="kb-lanes">
          <Lane label="Ny" laneCls="new" count={devNew.length} dropStage="New" onTaskDrop={onTaskDrop}>
            {devNew.map((t) => (
              <TaskCard key={t.id} task={t} cls="kb-card--new" draggable={!!onTaskDrop} />
            ))}
          </Lane>
          <Lane label="Aktiv" laneCls="active" count={devActive.length} dropStage="Active" onTaskDrop={onTaskDrop}>
            {devActive.map((t) => (
              <TaskCard key={t.id} task={t} cls={t.stage === "Resolved" ? "kb-card--resolved" : "kb-card--active"} draggable={!!onTaskDrop} />
            ))}
          </Lane>
          <Lane label="Klar" laneCls="done" count={devDone.length} dropStage="Done" onTaskDrop={onTaskDrop}>
            {devDone.map((t) => (
              <TaskCard key={t.id} task={t} cls="kb-card--done" draggable={!!onTaskDrop} />
            ))}
          </Lane>
        </div>
      </div>
      <div className="kb-sep" />
      <div className="kb-section">
        <div className="kb-section-label">Specialiserat</div>
        <div className="kb-lanes">
          <Lane label="Kodgranskning" laneCls="review" count={reviewTasks.length + prs.length}>
            {reviewTasks.map((t) => (
              <TaskCard key={t.id} task={t} cls="kb-card--active" />
            ))}
            {prs.map((pr) => (
              <PrCard key={pr.pullRequestId} pr={pr} />
            ))}
          </Lane>
          <Lane label="Test" laneCls="test" count={testTasks.length}>
            {testTasks.map((t) => (
              <TaskCard key={t.id} task={t} cls="kb-card--test" />
            ))}
          </Lane>
          <Lane label="Dokumentation" laneCls="docs" count={docTasks.length}>
            {docTasks.map((t) => (
              <TaskCard key={t.id} task={t} cls="kb-card--doc" />
            ))}
          </Lane>
        </div>
      </div>
    </div>
  );
}
