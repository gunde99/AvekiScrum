import { useState } from "react";
import type { DailyStoryDto } from "../../api/dailys";
import { updateWorkItemFields } from "../../api/workitems";
import { PersonAvatar } from "../../components/PersonAvatar";
import { useToast } from "../../components/Toast";
import { azureStatusClass, fullPersonName } from "./dailysLogic";
import "./LinkCardsModal.css";

interface LinkCardsModalProps {
  /** The goal being discussed, as its number - the tag written is "Sprintmål {n}". */
  goalNumber: number;
  /** What the goal is called, for the heading. */
  goalName: string;
  /** Everything in the sprint; the ones already carrying a goal tag are filtered out here. */
  stories: DailyStoryDto[];
  onClose: () => void;
  /** Called with the cards that were successfully tagged, so the board can show them at once. */
  onLinked: (storyIds: number[], goalNumber: number) => void;
}

/** The area path without the project root - the product, which is the part that varies. */
function shortAreaPath(path: string): string {
  const parts = path.split("\\").filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(" / ") : path;
}

/**
 * Ties loose cards to the sprint goal being discussed.
 *
 * The association is a tag on the card ("Sprintmål 6") - the same one the board groups by - so
 * this writes that tag and nothing else. Which means a card can be picked up mid-daily without
 * anyone leaving the flow for Azure DevOps and losing their place.
 */
export function LinkCardsModal({ goalNumber, goalName, stories, onClose, onLinked }: LinkCardsModalProps) {
  const { showToast } = useToast();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [areaPath, setAreaPath] = useState("");

  // Only cards with no goal at all. A card already tied to another goal is a decision someone made,
  // and quietly moving it from inside a daily is not this button's job.
  const candidates = stories.filter((s) => !s.sprintGoal || s.sprintGoal === "(Inget sprintmål)");

  // Only the paths actually present among the candidates. A full list of the project's area paths
  // would be mostly dead options - the point is to narrow this list, not to browse the tree.
  const areaCounts = new Map<string, number>();
  for (const s of candidates) {
    if (s.areaPath) areaCounts.set(s.areaPath, (areaCounts.get(s.areaPath) ?? 0) + 1);
  }
  const areaOptions = [...areaCounts.entries()].sort((a, b) => a[0].localeCompare(b[0], "sv"));

  const query = search.trim().toLowerCase();
  const visible = candidates
    .filter((s) => !areaPath || s.areaPath === areaPath)
    .filter(
      (s) =>
        !query ||
        s.title.toLowerCase().includes(query) ||
        String(s.id).includes(query) ||
        (s.developer ?? "").toLowerCase().includes(query),
    );

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function link() {
    const tag = `Sprintmål ${goalNumber}`;
    const ids = [...selected];
    setSaving(true);

    const linked: number[] = [];
    const failed: number[] = [];
    for (const id of ids) {
      const story = candidates.find((s) => s.id === id);
      if (!story) continue;
      try {
        // Tags are written as a whole list, so the card's existing ones have to come along.
        await updateWorkItemFields(id, { tags: [...(story.tags ?? []), tag] });
        linked.push(id);
      } catch {
        failed.push(id);
      }
    }

    setSaving(false);
    if (linked.length > 0) {
      onLinked(linked, goalNumber);
      showToast(
        `${linked.length} kort kopplade till ${tag}.` + (failed.length ? ` ${failed.length} misslyckades.` : ""),
        failed.length ? "error" : "success",
      );
    } else if (failed.length > 0) {
      showToast(`Kunde inte koppla ${failed.length} kort.`, "error");
    }
    // Closes either way: the ones that worked are done, and a half-finished dialog left open in
    // the middle of a daily is worse than a toast saying what failed.
    onClose();
  }

  return (
    <div className="link-cards-overlay" onClick={onClose}>
      <div className="link-cards" onClick={(e) => e.stopPropagation()}>
        <header className="link-cards__head">
          <div>
            <h2>Koppla kort till {goalName}</h2>
            <p>Kort i sprinten som inte hör till något sprintmål. De taggas med “Sprintmål {goalNumber}”.</p>
          </div>
          <button type="button" className="link-cards__close" onClick={onClose} aria-label="Stäng">
            ✕
          </button>
        </header>

        {candidates.length > 8 && (
          <div className="link-cards__filters">
            <input
              className="link-cards__search"
              placeholder="Sök på rubrik, id eller utvecklare…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {areaOptions.length > 1 && (
              <select
                className="link-cards__area"
                value={areaPath}
                onChange={(e) => setAreaPath(e.target.value)}
                title="Filtrera på Area Path"
              >
                <option value="">Alla area paths ({candidates.length})</option>
                {areaOptions.map(([path, count]) => (
                  <option key={path} value={path}>
                    {shortAreaPath(path)} ({count})
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <div className="link-cards__list">
          {visible.length === 0 ? (
            <p className="link-cards__empty">
              {candidates.length === 0
                ? "Alla kort i sprinten hör redan till ett sprintmål."
                : "Inga kort matchar urvalet."}
            </p>
          ) : (
            visible.map((story) => (
              <label key={story.id} className={"link-cards__row" + (selected.has(story.id) ? " link-cards__row--on" : "")}>
                <input type="checkbox" checked={selected.has(story.id)} onChange={() => toggle(story.id)} />
                <span className="link-cards__id">#{story.id}</span>
                <span className="link-cards__person">
                  <PersonAvatar name={story.developer} size={20} />
                  <span>{fullPersonName(story.developer) || "Ej tilldelad"}</span>
                </span>
                <span className="link-cards__title">{story.title}</span>
                <span className={`azure-status ${azureStatusClass(story.azureStatus)}`}>{story.azureStatus || "-"}</span>
                <span className="link-cards__sp">{story.storyPoints ?? "?"} SP</span>
              </label>
            ))
          )}
        </div>

        <footer className="link-cards__foot">
          <span className="link-cards__count">{selected.size} valda</span>
          <button type="button" className="wi-btn" onClick={onClose} disabled={saving}>
            Avbryt
          </button>
          <button
            type="button"
            className="wi-btn wi-btn--primary"
            onClick={() => void link()}
            disabled={saving || selected.size === 0}
          >
            {saving ? "Kopplar…" : `Koppla ${selected.size || ""}`.trim()}
          </button>
        </footer>
      </div>
    </div>
  );
}
