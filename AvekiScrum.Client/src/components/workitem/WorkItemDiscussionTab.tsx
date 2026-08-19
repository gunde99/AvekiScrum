import { PersonAvatar } from "../PersonAvatar";
import type { WorkItemComment } from "../../api/workitems";
import { fullPersonName } from "../../lib/personNames";
import { renderWorkItemContent } from "../../lib/renderMarkdown";
import "./WorkItemDiscussionTab.css";

export function WorkItemDiscussionTab({ comments }: { comments: WorkItemComment[] }) {
  if (comments.length === 0) {
    return <p className="wi-empty-state">Inga kommentarer än.</p>;
  }

  return (
    <div className="wi-discussion">
      {comments.map((c, i) => (
        <div className="wi-comment" key={i}>
          <div className="wi-comment__meta">
            <PersonAvatar name={c.author} size={24} />
            <span className="wi-comment__author">{fullPersonName(c.author)}</span>
            {c.createdDate && <span className="wi-comment__date">{new Date(c.createdDate).toLocaleString("sv-SE")}</span>}
          </div>
          <div className="wi-rich-text" dangerouslySetInnerHTML={{ __html: renderWorkItemContent(c.textHtml) }} />
        </div>
      ))}
    </div>
  );
}
