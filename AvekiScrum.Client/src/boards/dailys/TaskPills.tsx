import { useRef, useState } from "react";
import type { DailyStoryDto, DailyTaskDto } from "../../api/dailys";
import { dorStatus, isProgressTaskDone, taskPillCounts, type DorPillState } from "./dailysLogic";
import { FloatingPopover } from "./FloatingPopover";
import "./TaskPills.css";

export type Category = "dev" | "review" | "test" | "doc";

export interface TileInfo {
  label: string;
  count: number;
  state: "empty" | "not-needed" | "active" | "done";
  category: Category;
  title: string;
  explanation: string;
  tasks: DailyTaskDto[];
}

function taskLine(t: DailyTaskDto): string {
  const doneMark = isProgressTaskDone(t) ? "✓" : "…";
  return `${doneMark} #${t.id} ${t.title} (${t.status})`;
}

function utvExplanation(counts: ReturnType<typeof taskPillCounts>["utv"], tasks: DailyTaskDto[]): string {
  if (counts.count === 0) return "Inget utvecklingskort finns ännu. Minst en task krävs innan kortet är redo.";
  if (counts.done) return `Alla ${counts.count} utvecklingstask är klara.`;
  const doneCount = tasks.filter(isProgressTaskDone).length;
  return `${doneCount} av ${counts.count} utvecklingstask är klara.`;
}

function prExplanation(counts: ReturnType<typeof taskPillCounts>["pr"]): string {
  if (counts.count === 0) return "Ingen Pull Request kopplad till kortet ännu.";
  if (counts.done) return `Alla ${counts.count} PR är klara.`;
  return `${counts.count} PR kopplade, granskning pågår.`;
}

function optionalExplanation(
  noun: string,
  activityHint: string,
  state: DorPillState,
  tasks: DailyTaskDto[],
  hasDorTag: boolean,
): string {
  if (state === "empty") {
    return `Inget ${noun}-kort finns. Om ${activityHint} inte behövs för detta kort bör det stämplas med DoR-taggen för att visa att det är ett medvetet val.`;
  }
  if (state === "not-needed") {
    return `Inget ${noun}-kort finns, men kortet har DoR-taggen - avsaknaden är ett medvetet beslut, ${activityHint} bedöms inte behövas.`;
  }
  if (state === "done") {
    return `Alla ${tasks.length} ${noun}-kort är klara.`;
  }
  const doneCount = tasks.filter(isProgressTaskDone).length;
  return `${doneCount} av ${tasks.length} ${noun}-kort är klara.${hasDorTag ? "" : " (Kortet saknar DoR-tagg.)"}`;
}

function Tile({ info }: { info: TileInfo }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  const symbol = info.state === "empty" ? "–" : info.state === "not-needed" ? "N/A" : info.state === "done" ? "✓" : info.count;

  return (
    <div className="tp-tile-wrap">
      <button
        ref={ref}
        type="button"
        className={`tp-tile tp-tile--${info.state} tp-tile--${info.category}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={info.explanation}
      >
        <span className="tp-lbl">{info.label}</span>
        <span className="tp-cnt">{symbol}</span>
      </button>
      {open && (
        <FloatingPopover anchorRef={ref} onClose={() => setOpen(false)} className="tp-popover">
          <div className="tp-popover__head">{info.title}</div>
          <div className="tp-popover__explanation">{info.explanation}</div>
          {info.tasks.length > 0 && (
            <ul className="tp-popover__tasks">
              {info.tasks.map((t) => (
                <li key={t.id}>{taskLine(t)}</li>
              ))}
            </ul>
          )}
        </FloatingPopover>
      )}
    </div>
  );
}

/**
 * The four delivery boxes for a card, with the same wording the tooltips use.
 *
 * Exported because the Definition of Done tab shows the same four - deriving them twice is how the
 * board and the dialog end up disagreeing about whether a card is finished.
 */
export function deliveryTiles(story: DailyStoryDto): TileInfo[] {
  const counts = taskPillCounts(story);
  const dor = dorStatus(story);

  const utvTasks = (story.tasks || []).filter((t) => ["New", "Active", "Resolved", "Done"].includes(t.stage));

  const tiles: TileInfo[] = [
    {
      label: "Utv",
      count: counts.utv.count,
      state: counts.utv.count === 0 ? "empty" : counts.utv.done ? "done" : "active",
      category: "dev",
      title: "Utveckling",
      explanation: utvExplanation(counts.utv, utvTasks),
      tasks: utvTasks,
    },
    {
      label: "PR",
      count: counts.pr.count,
      state: counts.pr.count === 0 ? "empty" : counts.pr.done ? "done" : "active",
      category: "review",
      title: "Pull Requests",
      explanation: prExplanation(counts.pr),
      tasks: [],
    },
    {
      label: "Test",
      count: dor.test.tasks.length,
      state: dor.test.state === "in-progress" ? "active" : dor.test.state,
      category: "test",
      title: "Test",
      explanation: optionalExplanation("test", "testning", dor.test.state, dor.test.tasks, dor.hasDorTag),
      tasks: dor.test.tasks,
    },
    {
      label: "Dok",
      count: dor.dok.tasks.length,
      state: dor.dok.state === "in-progress" ? "active" : dor.dok.state,
      category: "doc",
      title: "Dokumentation",
      explanation: optionalExplanation(
        "dokumentations",
        "hjälptext/databasdokumentation/teknisk dokumentation/versionsförändring",
        dor.dok.state,
        dor.dok.tasks,
        dor.hasDorTag,
      ),
      tasks: dor.dok.tasks,
    },
  ];

  return tiles;
}

export function TaskPills({ story }: { story: DailyStoryDto }) {
  return (
    <div className="tp-tiles">
      {deliveryTiles(story).map((t) => (
        <Tile key={t.label} info={t} />
      ))}
    </div>
  );
}
