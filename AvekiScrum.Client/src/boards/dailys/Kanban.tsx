import { useState, type DragEvent, type ReactNode } from "react";
import type { DailyPullRequestDto, DailyStoryDto, DailyTaskDto } from "../../api/dailys";
import { ageLabel, compactPersonName, isPullRequestDone, reviewerNames, type FlowLaneStage } from "./dailysLogic";
import { TaskCardVisual, type TaskCardTone } from "../../components/workitem/TaskCardVisual";
import "./Kanban.css";

// Approximate height of one card (head + up to two title lines + foot, plus its gap to the next
// card) - used only to translate "how many cards" into a shared max-height across a row of lanes.
// Doesn't have to be pixel-exact: the model this supports is "count of cards visible", not a
// precise crop, and a card's own 2-line title clamp keeps real heights close to this anyway.
const CARD_HEIGHT_PX = 70;

interface LaneProps {
  label: string;
  laneCls: string;
  children: ReactNode;
  count: number;
  dropStage?: FlowLaneStage;
  onTaskDrop?: (taskId: number, targetLane: FlowLaneStage) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** undefined = natural height (nothing in this row is collapsed). Set once a sibling lane
   *  collapses, so every lane in the row shares the same height instead of each sizing to its
   *  own content. */
  maxHeightPx: number | undefined;
  /** How many of this lane's own cards actually fit within maxHeightPx - used for the
   *  "Visar X av Y kort" hint. Always >= count when maxHeightPx is undefined. */
  visibleCount: number;
}

function Lane({ label, laneCls, children, count, dropStage, onTaskDrop, collapsed, onToggleCollapse, maxHeightPx, visibleCount }: LaneProps) {
  const [dragOver, setDragOver] = useState(false);
  const droppable = !!dropStage && !!onTaskDrop;
  const truncated = maxHeightPx !== undefined && visibleCount < count;

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
      <button type="button" className="kb-lane-head" onClick={onToggleCollapse} title={collapsed ? "Expandera" : "Kollapsa"}>
        <span className="lane-name">
          <span className={"kb-lane-chevron" + (collapsed ? "" : " kb-lane-chevron--open")}>▶</span>
          {label}
        </span>
        <span className="lane-cnt">{count}</span>
      </button>
      <div
        className="kb-lane-body"
        style={
          maxHeightPx === 0
            // Zero also has to zero the body's own padding - max-height:0 alone still leaves the
            // padding rendered, and that sliver of space is just tall enough to show the top edge
            // of the first card poking through.
            ? { maxHeight: 0, padding: 0, overflow: "hidden" }
            : maxHeightPx !== undefined
              ? { maxHeight: maxHeightPx, overflow: "hidden" }
              : undefined
        }
      >
        {count ? children : <div className="kb-empty">–</div>}
      </div>
      {truncated && (
        <div className="kb-lane-truncated">
          Visar {visibleCount} av {count} kort
        </div>
      )}
    </div>
  );
}

function TaskCard({ task, tone, draggable }: { task: DailyTaskDto; tone: TaskCardTone; draggable?: boolean }) {
  const statusLower = (task.status || "").toLowerCase();
  const finalTone: TaskCardTone = statusLower === "notok" ? "notok" : tone;

  function handleDragStart(e: DragEvent<HTMLElement>) {
    e.dataTransfer.setData("text/plain", String(task.id));
    e.dataTransfer.effectAllowed = "move";
  }

  return (
    <TaskCardVisual
      id={task.id}
      title={task.title}
      statusLabel={task.status || "Ny"}
      tone={finalTone}
      assignedTo={task.assignedTo ? compactPersonName(task.assignedTo) : null}
      activity={task.activity}
      createdDate={task.createdDate}
      isBlocked={task.isBlocked}
      draggable={draggable}
      onDragStart={draggable ? handleDragStart : undefined}
      href={task.webUrl}
    />
  );
}

function PrCard({ pr }: { pr: DailyPullRequestDto }) {
  const done = isPullRequestDone(pr);
  const status = (pr.status || "").toLowerCase();
  const tone: TaskCardTone = done ? "done" : status === "abandoned" || status === "aborted" ? "notok" : "active";
  return (
    <a className={`kb-card kb-card--${tone}`} href={pr.webUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
      <div className="kbc-head">
        <span className="kbc-key">PR {pr.pullRequestId}</span>
        <span className={`kbc-status kbc-status--${tone}`}>{done ? "Klar" : pr.status || "Aktiv"}</span>
      </div>
      <div className="kbc-title">{pr.title}</div>
      {/* Folded into the foot row rather than its own line - a standalone branch row made this
          card one row taller than a task card's, which broke the shared row-height math in
          LaneRow (every card in a row is assumed to be the same height). */}
      <div className="kbc-foot">
        <span>{reviewerNames(pr.reviewers)}</span>
        {pr.targetBranch && <span className="kbc-activity">→ {pr.targetBranch}</span>}
        <span>{ageLabel(pr.createdDate)}</span>
      </div>
    </a>
  );
}

interface KanbanProps {
  story: DailyStoryDto;
  onTaskDrop?: (taskId: number, targetLane: FlowLaneStage) => void;
}

interface LaneSpec {
  id: string;
  label: string;
  laneCls: string;
  count: number;
  dropStage?: FlowLaneStage;
  render: () => ReactNode;
}

/** The row's shared height, in cards: once anything in the row is collapsed, every lane (including
 *  the ones left open) is capped to the tallest *open* lane - not to zero, and not to its own
 *  natural height - so collapsing the biggest lane still leaves the row exactly as tall as
 *  whatever now has the most cards, and collapsing everything shrinks it to nothing. */
function sharedTargetCount(lanes: LaneSpec[], collapsedIds: Set<string>): number | undefined {
  if (!lanes.some((l) => collapsedIds.has(l.id))) return undefined;
  const open = lanes.filter((l) => !collapsedIds.has(l.id));
  return open.length === 0 ? 0 : Math.max(...open.map((l) => l.count));
}

function LaneRow({
  lanes,
  collapsedIds,
  onToggle,
  onTaskDrop,
}: {
  lanes: LaneSpec[];
  collapsedIds: Set<string>;
  onToggle: (id: string) => void;
  onTaskDrop?: (taskId: number, targetLane: FlowLaneStage) => void;
}) {
  const targetCount = sharedTargetCount(lanes, collapsedIds);
  const maxHeightPx = targetCount === undefined ? undefined : targetCount * CARD_HEIGHT_PX;

  return (
    <div className="kb-lanes">
      {lanes.map((lane) => (
        <Lane
          key={lane.id}
          label={lane.label}
          laneCls={lane.laneCls}
          count={lane.count}
          dropStage={lane.dropStage}
          onTaskDrop={onTaskDrop}
          collapsed={collapsedIds.has(lane.id)}
          onToggleCollapse={() => onToggle(lane.id)}
          maxHeightPx={maxHeightPx}
          visibleCount={targetCount === undefined ? lane.count : Math.min(lane.count, targetCount)}
        >
          {lane.render()}
        </Lane>
      ))}
    </div>
  );
}

export function Kanban({ story, onTaskDrop }: KanbanProps) {
  const tasks = story.tasks || [];
  const prs = story.pullRequests || [];
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(new Set());

  function toggleLane(id: string) {
    setCollapsedLanes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

  const flowLanes: LaneSpec[] = [
    {
      id: "new",
      label: "Ny",
      laneCls: "new",
      count: devNew.length,
      dropStage: "New",
      render: () => devNew.map((t) => <TaskCard key={t.id} task={t} tone="new" draggable={!!onTaskDrop} />),
    },
    {
      id: "active",
      label: "Aktiv",
      laneCls: "active",
      count: devActive.length,
      dropStage: "Active",
      render: () =>
        devActive.map((t) => (
          <TaskCard key={t.id} task={t} tone={t.stage === "Resolved" ? "resolved" : "active"} draggable={!!onTaskDrop} />
        )),
    },
    {
      id: "done",
      label: "Klar",
      laneCls: "done",
      count: devDone.length,
      dropStage: "Done",
      render: () => devDone.map((t) => <TaskCard key={t.id} task={t} tone="done" draggable={!!onTaskDrop} />),
    },
  ];

  const specialLanes: LaneSpec[] = [
    {
      id: "review",
      label: "Kodgranskning",
      laneCls: "review",
      count: reviewTasks.length + prs.length,
      render: () => [
        ...reviewTasks.map((t) => <TaskCard key={`t${t.id}`} task={t} tone="active" />),
        ...prs.map((pr) => <PrCard key={`pr${pr.pullRequestId}`} pr={pr} />),
      ],
    },
    {
      id: "test",
      label: "Test",
      laneCls: "test",
      count: testTasks.length,
      render: () => testTasks.map((t) => <TaskCard key={t.id} task={t} tone="test" />),
    },
    {
      id: "docs",
      label: "Dokumentation",
      laneCls: "docs",
      count: docTasks.length,
      render: () => docTasks.map((t) => <TaskCard key={t.id} task={t} tone="doc" />),
    },
  ];

  return (
    <div className="kanban-board">
      <div className="kb-section">
        <div className="kb-section-label">
          Utvecklingsflöde
          {onTaskDrop && <span className="kb-section-hint">Dra kort för att ändra status</span>}
        </div>
        <LaneRow lanes={flowLanes} collapsedIds={collapsedLanes} onToggle={toggleLane} onTaskDrop={onTaskDrop} />
      </div>
      <div className="kb-sep" />
      <div className="kb-section">
        <div className="kb-section-label">Specialiserat</div>
        <LaneRow lanes={specialLanes} collapsedIds={collapsedLanes} onToggle={toggleLane} />
      </div>
    </div>
  );
}
