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

  // Only cards with no goal at all. A card already tied to another goal is a decision someone made,
  // and quietly moving it from inside a daily is not this button's job.
  const candidates = stories.filter((s) => !s.sprintGoal || s.sprintGoal === "(Inget sprintmål)");
  const query = search.trim().toLowerCase();
  const visible = query
    ? candidates.filter(
        (s) =>
          s.title.toLowerCase().includes(query) ||
          String(s.id).includes(query) ||
          (s.developer ?? "").toLowerCase().includes(query),
      )
    : candidates;

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
          <input
            className="link-cards__search"
            placeholder="Sök på rubrik, id eller utvecklare…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}

        <div className="link-cards__list">
          {visible.length === 0 ? (
            <p className="link-cards__empty">
              {candidates.length === 0
                ? "Alla kort i sprinten hör redan till ett sprintmål."
                : "Inga kort matchar sökningen."}
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
