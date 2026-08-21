import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { PersonAvatar } from "../../components/PersonAvatar";
import {
  blocksOf,
  publishReviewReport,
  type ReviewCardBlock,
  type ReviewReportSection,
} from "../../api/review";
import type { DailyStoryDto, DeveloperTeamId } from "../../api/dailys";
import { REVIEW_LANES, type ReviewLaneKey } from "./reviewLogic";
import "./ReviewPreviewModal.css";

const UNASSIGNED = "Ej tilldelad";

interface ReviewPreviewModalProps {
  team: DeveloperTeamId;
  sprint: string;
  sprintStart: string | null;
  sprintEnd: string | null;
  /** The tagged cards per lane, exactly as the panels show them. */
  byLane: Map<ReviewLaneKey, DailyStoryDto[]>;
  onClose: () => void;
}

/**
 * Walks through the three review lanes one at a time - "det här ska demas", "det här ska vi prata
 * om", "det här ska vi bara förmedla i skrift" - so the tagging can be sanity-checked with faces
 * against cards before anything is announced. Approving builds the report; publishing to Teams is
 * a separate, deliberate second step, so the message can be read before the whole team sees it.
 */
export function ReviewPreviewModal({ team, sprint, sprintStart, sprintEnd, byLane, onClose }: ReviewPreviewModalProps) {
  // 0..2 are the lane steps, REVIEW_LANES.length is the report.
  const [step, setStep] = useState(0);
  const [blocks, setBlocks] = useState<ReviewCardBlock[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);

  const sections = useMemo<ReviewReportSection[]>(
    () =>
      REVIEW_LANES.map((lane) => ({
        key: lane.key,
        title: lane.previewTitle,
        icon: lane.icon,
        groups: groupByDeveloper(byLane.get(lane.key) ?? []),
      })),
    [byLane],
  );

  const reportStep = REVIEW_LANES.length;
  const onReport = step === reportStep;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  /** Approve: build the report server-side without posting it, and show the result. */
  async function buildReport() {
    setBusy(true);
    setError(null);
    try {
      const response = await publishReviewReport({
        team,
        sprint,
        sprintStart,
        sprintEnd,
        sections,
        dryRun: true,
      });
      setBlocks(blocksOf(response));
      setStep(reportStep);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte skapa rapporten.");
    } finally {
      setBusy(false);
    }
  }

  /** Second stage: the same payload, this time actually posted to the channel. */
  async function publish() {
    setBusy(true);
    setError(null);
    try {
      await publishReviewReport({ team, sprint, sprintStart, sprintEnd, sections, dryRun: false });
      setPosted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte publicera rapporten.");
    } finally {
      setBusy(false);
    }
  }

  const section = onReport ? null : sections[step];
  const cardCount = section ? section.groups.reduce((sum, g) => sum + g.cards.length, 0) : 0;

  return createPortal(
    <div className="rvp-overlay" role="presentation">
      <div className="rvp" role="dialog" aria-modal="true" aria-labelledby="rvp-title">
        <header className="rvp__head">
          <div className="rvp__head-text">
            <span className="rvp__eyebrow">
              Sprintreview · Team {team} · {sprint}
            </span>
            <h2 className="rvp__title" id="rvp-title">
              {onReport ? "📋 Rapport" : `${section!.icon} ${section!.title}`}
            </h2>
          </div>
          {!onReport && (
            <span className="rvp__count">
              {cardCount} {cardCount === 1 ? "kort" : "kort"}
            </span>
          )}
        </header>

        <div className="rvp__steps" aria-hidden="true">
          {[...REVIEW_LANES.map((l) => l.label), "Rapport"].map((label, i) => (
            <span key={label} className={"rvp__step" + (i === step ? " rvp__step--active" : i < step ? " rvp__step--done" : "")}>
              {label}
            </span>
          ))}
        </div>

        <div className="rvp__body">
          {onReport ? (
            posted ? (
              <div className="rvp__done">
                <span className="rvp__done-icon" aria-hidden="true">
                  ✅
                </span>
                <p>Rapporten är publicerad i Teams-kanalen.</p>
              </div>
            ) : (
              <ReportPreview blocks={blocks ?? []} />
            )
          ) : section!.groups.length === 0 ? (
            <p className="rvp__empty">Inga kort är taggade för det här steget.</p>
          ) : (
            section!.groups.map((group) => (
              <div className="rvp-group" key={group.developer}>
                <div className="rvp-group__head">
                  <PersonAvatar name={group.developer === UNASSIGNED ? null : group.developer} size={36} />
                  <div className="rvp-group__who">
                    <span className="rvp-group__name">{group.developer}</span>
                    <span className="rvp-group__count">
                      {group.cards.length} {group.cards.length === 1 ? "kort" : "kort"}
                    </span>
                  </div>
                </div>
                <ul className="rvp-group__cards">
                  {group.cards.map((card) => (
                    <li className="rvp-card" key={card.id}>
                      <span className="rvp-card__id">#{card.id}</span>
                      <span className="rvp-card__title">{card.title}</span>
                      <span className="rvp-card__state">{card.state}</span>
                      {card.storyPoints > 0 && <span className="rvp-card__sp">{card.storyPoints} SP</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        {error && <p className="rvp__error">{error}</p>}

        <footer className="rvp__actions">
          <button type="button" className="wi-btn" onClick={onClose} disabled={busy}>
            {posted ? "Stäng" : "Avbryt"}
          </button>
          <span className="rvp__spacer" />
          {step > 0 && !posted && (
            <button type="button" className="wi-btn" onClick={() => setStep((s) => s - 1)} disabled={busy}>
              Tillbaka
            </button>
          )}
          {!onReport && step < reportStep - 1 && (
            <button type="button" className="wi-btn wi-btn--primary" onClick={() => setStep((s) => s + 1)}>
              Nästa
            </button>
          )}
          {!onReport && step === reportStep - 1 && (
            <button type="button" className="wi-btn wi-btn--primary" onClick={() => void buildReport()} disabled={busy}>
              {busy ? "Skapar rapport…" : "Godkänn"}
            </button>
          )}
          {onReport && !posted && (
            <button type="button" className="wi-btn wi-btn--primary" onClick={() => void publish()} disabled={busy}>
              {busy ? "Publicerar…" : "Publicera till Teams"}
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Renders the Adaptive Card the server built. Going through the real payload rather than a
 * separate preview layout is the point of the two-step: what's on screen here is the message
 * Teams will show, minus Teams' own chrome.
 */
function ReportPreview({ blocks }: { blocks: ReviewCardBlock[] }) {
  return (
    <div className="rvp-report">
      {blocks.map((block, i) => (
        <p
          key={i}
          className={
            "rvp-report__line" +
            (block.size === "Large" ? " rvp-report__line--large" : "") +
            (block.size === "Medium" ? " rvp-report__line--medium" : "") +
            (block.weight === "Bolder" ? " rvp-report__line--bold" : "") +
            (block.isSubtle ? " rvp-report__line--subtle" : "") +
            (block.separator ? " rvp-report__line--separator" : "")
          }
        >
          {renderInline(block.text)}
        </p>
      ))}
    </div>
  );
}

/**
 * The card's text is markdown, and the only markup the report emits is `[#123](url)` links plus
 * backslash-escaped literals. Handling exactly those two - rather than pulling in a markdown
 * renderer - keeps the preview faithful without pretending to support syntax the report never
 * produces.
 */
function renderInline(text: string) {
  const parts: (string | { label: string; href: string })[] = [];
  const pattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push({ label: match[1], href: match[2] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));

  return parts.map((part, i) =>
    typeof part === "string" ? (
      <span key={i}>{unescapeMarkdown(part)}</span>
    ) : (
      <a key={i} href={part.href} target="_blank" rel="noreferrer" className="rvp-report__link">
        {unescapeMarkdown(part.label)}
      </a>
    ),
  );
}

function unescapeMarkdown(text: string): string {
  return text.replace(/\\([*_#[\]`\\])/g, "$1");
}

/** Cards grouped by owner, alphabetically, with unowned cards last so they read as a leftover. */
function groupByDeveloper(stories: DailyStoryDto[]) {
  const map = new Map<string, DailyStoryDto[]>();
  for (const story of stories) {
    const key = story.developer?.trim() || UNASSIGNED;
    const bucket = map.get(key);
    if (bucket) bucket.push(story);
    else map.set(key, [story]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a.localeCompare(b, "sv")))
    .map(([developer, cards]) => ({
      developer,
      cards: cards
        .sort((a, b) => a.id - b.id)
        .map((s) => ({
          id: s.id,
          title: s.title,
          state: s.azureStatus,
          storyPoints: s.storyPoints,
          url: s.webUrl || null,
        })),
    }));
}
