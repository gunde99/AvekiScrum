import { useState } from "react";
import { PersonAvatar } from "../PersonAvatar";
import { addWorkItemComment, type WorkItemDetail } from "../../api/workitems";
import { fullPersonName } from "../../lib/personNames";
import { renderWorkItemContent } from "../../lib/renderMarkdown";
import { MarkdownEditor } from "./MarkdownEditor";
import "./WorkItemDiscussionTab.css";

interface WorkItemDiscussionTabProps {
  detail: WorkItemDetail;
  /** Handed the reloaded card so the new comment appears without refetching the whole modal. */
  onPosted: (detail: WorkItemDetail) => void;
}

export function WorkItemDiscussionTab({ detail, onPosted }: WorkItemDiscussionTabProps) {
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post() {
    if (!text.trim()) return;
    setPosting(true);
    setError(null);
    try {
      onPosted(await addWorkItemComment(detail.id, text));
      setText("");
    } catch (err) {
      // The text stays in the box on failure - a dropped comment someone just typed is worse
      // than an error message.
      setError(err instanceof Error ? err.message : "Kunde inte lägga till kommentaren.");
    } finally {
      setPosting(false);
    }
  }

  // Newest first, matching Azure DevOps' own discussion view. Sorted here rather than trusting
  // the order the API happens to return - undated comments sink to the bottom.
  const ordered = [...detail.comments].sort((a, b) => {
    const at = a.createdDate ? new Date(a.createdDate).getTime() : -Infinity;
    const bt = b.createdDate ? new Date(b.createdDate).getTime() : -Infinity;
    return bt - at;
  });

  return (
    <div className="wi-discussion">
      <div className="wi-discussion__composer">
        {/* One line at rest, growing as the comment does - a four-row box sat half empty above
            every discussion. */}
        <MarkdownEditor
          rows={1}
          autoGrow
          value={text}
          onChange={setText}
          placeholder="Skriv en kommentar. Markdown stöds, och du kan klistra in en bild."
        />
        {error && <p className="wi-discussion__error">{error}</p>}
        <div className="wi-discussion__composer-actions">
          <button type="button" className="wi-btn wi-btn--primary" onClick={post} disabled={posting || !text.trim()}>
            {posting ? "Skickar…" : "Kommentera"}
          </button>
        </div>
      </div>

      {ordered.length === 0 ? (
        <p className="wi-empty-state">Inga kommentarer än.</p>
      ) : (
        ordered.map((c, i) => (
          <div className="wi-comment" key={i}>
            <div className="wi-comment__meta">
              <PersonAvatar name={c.author} size={24} />
              <span className="wi-comment__author">{fullPersonName(c.author)}</span>
              {c.createdDate && <span className="wi-comment__date">{new Date(c.createdDate).toLocaleString("sv-SE")}</span>}
            </div>
            <div className="wi-rich-text" dangerouslySetInnerHTML={{ __html: renderWorkItemContent(c.textHtml) }} />
          </div>
        ))
      )}
    </div>
  );
}
