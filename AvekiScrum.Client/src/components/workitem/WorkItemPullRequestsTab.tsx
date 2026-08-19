import type { PrReviewer, WorkItemPullRequest } from "../../api/workitems";
import { PersonAvatar } from "../PersonAvatar";
import "./WorkItemPullRequestsTab.css";

function statusClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "completed" || s === "complete" || s === "merged") return "wi-pr__status--done";
  if (s === "abandoned" || s === "aborted") return "wi-pr__status--notok";
  return "wi-pr__status--active";
}

function statusLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === "completed" || s === "complete" || s === "merged") return "Klar";
  if (s === "abandoned" || s === "aborted") return "Övergiven";
  if (s === "active") return "Aktiv";
  return status || "Aktiv";
}

/** Azure DevOps' own pull-request glyph: two branch nodes joined by a merge curve. */
function PrIcon() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="4" cy="3" r="1.6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="4" cy="13" r="1.6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12" cy="6" r="1.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4 4.6V11.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M4 4.6C4 8 8 4 12 7.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function voteIcon(vote: number): { symbol: string; cls: string; title: string } {
  if (vote >= 10) return { symbol: "✓", cls: "wi-pr-reviewer__vote--approved", title: "Godkänd" };
  if (vote >= 5) return { symbol: "✓", cls: "wi-pr-reviewer__vote--approved-suggestions", title: "Godkänd med förslag" };
  if (vote <= -10) return { symbol: "✕", cls: "wi-pr-reviewer__vote--rejected", title: "Nekad" };
  if (vote <= -5) return { symbol: "⟳", cls: "wi-pr-reviewer__vote--waiting", title: "Väntar på granskaren" };
  return { symbol: "…", cls: "wi-pr-reviewer__vote--none", title: "Inte granskad än" };
}

function ReviewerBadge({ reviewer }: { reviewer: PrReviewer }) {
  const { symbol, cls, title } = voteIcon(reviewer.vote);
  return (
    <div className="wi-pr-reviewer" title={`${reviewer.displayName} - ${title}${reviewer.isRequired ? " (obligatorisk)" : ""}`}>
      <PersonAvatar name={reviewer.displayName} size={24} />
      <span className={`wi-pr-reviewer__vote ${cls}`}>{symbol}</span>
    </div>
  );
}

export function WorkItemPullRequestsTab({ pullRequests }: { pullRequests: WorkItemPullRequest[] }) {
  if (pullRequests.length === 0) {
    return <p className="wi-empty-state">Inga kopplade pull requests.</p>;
  }

  return (
    <div className="wi-prs">
      {pullRequests.map((pr) => (
        <a key={pr.pullRequestId} className="wi-pr" href={pr.webUrl} target="_blank" rel="noreferrer">
          <span className="wi-pr__icon">
            <PrIcon />
          </span>
          <div className="wi-pr__body">
            <div className="wi-pr__head">
              <span className="wi-pr__title">{pr.title || `PR ${pr.pullRequestId}`}</span>
              <span className={`wi-pr__status ${statusClass(pr.status)}`}>{statusLabel(pr.status)}</span>
            </div>
            <div className="wi-pr__meta">
              <span className="wi-pr__id">#{pr.pullRequestId}</span>
              {pr.targetBranch && <span className="wi-pr__branch">→ {pr.targetBranch}</span>}
              {pr.createdBy && <span>Skapad av {pr.createdBy}</span>}
              <span>
                {pr.commentsTotal === 0
                  ? "Inga kommentarstrådar"
                  : `${pr.commentsResolved}/${pr.commentsTotal} trådar lösta`}
              </span>
            </div>
            {pr.reviewers.length > 0 && (
              <div className="wi-pr-reviewers">
                {pr.reviewers.map((r) => (
                  <ReviewerBadge key={r.displayName} reviewer={r} />
                ))}
              </div>
            )}
          </div>
        </a>
      ))}
    </div>
  );
}
