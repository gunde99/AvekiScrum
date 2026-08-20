import { useState } from "react";
import "./TagEditor.css";

interface TagEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  /** Tags already used in the project, offered as suggestions. Free text still works, so a
   *  genuinely new tag can be typed - the list is there to stop the same tag being reinvented
   *  with a different spelling. */
  suggestions?: string[];
}

/** Add/remove tag chips with autocomplete against the project's existing tags. */
export function TagEditor({ tags, onChange, suggestions = [] }: TagEditorProps) {
  const [draft, setDraft] = useState("");
  const listId = "tag-suggestions";
  const available = suggestions.filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()));

  function addTag() {
    const value = draft.trim();
    if (!value) return;
    if (!tags.some((t) => t.toLowerCase() === value.toLowerCase())) {
      onChange([...tags, value]);
    }
    setDraft("");
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <div className="tag-editor">
      <div className="tag-editor__chips">
        {tags.map((t) => (
          <span className="tag-editor__chip" key={t}>
            {t}
            <button type="button" className="tag-editor__remove" onClick={() => removeTag(t)} aria-label={`Ta bort taggen ${t}`}>
              ✕
            </button>
          </span>
        ))}
      </div>
      <div className="tag-editor__input-row">
        <input
          type="text"
          value={draft}
          list={listId}
          placeholder={available.length > 0 ? "Välj eller skriv en tagg…" : "Lägg till tagg…"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
        />
        <datalist id={listId}>
          {available.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button type="button" className="wi-btn" onClick={addTag} disabled={!draft.trim()}>
          Lägg till
        </button>
      </div>
    </div>
  );
}
