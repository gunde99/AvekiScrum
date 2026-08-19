import { useState } from "react";
import "./TagEditor.css";

interface TagEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
}

/** Free-text add/remove tag chips - reused wherever a work item's System.Tags needs editing. */
export function TagEditor({ tags, onChange }: TagEditorProps) {
  const [draft, setDraft] = useState("");

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
          placeholder="Lägg till tagg…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
        />
        <button type="button" className="wi-btn" onClick={addTag} disabled={!draft.trim()}>
          Lägg till
        </button>
      </div>
    </div>
  );
}
