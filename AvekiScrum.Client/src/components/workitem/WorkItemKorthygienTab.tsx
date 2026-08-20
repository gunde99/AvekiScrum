import { useState, type ReactNode } from "react";
import {
  addWorkItemRelation,
  type ClassificationOptions,
  type ParentCandidate,
  type WorkItemDetail,
  type WorkItemRelationRef,
} from "../../api/workitems";
import type { PersonOption } from "../../api/people";
import { getWorkItemTypeConfig } from "./workItemTypeConfig";
import { MarkdownEditor } from "./MarkdownEditor";
import { TagEditor } from "./TagEditor";
import { Section } from "./Section";
import "./WorkItemKorthygienTab.css";

export interface KorthygienDraft {
  description: string;
  acceptanceCriteria: string;
  storyPoints?: number;
  areaPath: string;
  assignedTo: string;
  developmentPartner: string;
  developmentPartnerNotApplicable: boolean;
  // Not persisted anywhere in Azure (there's no safe way yet to edit the Hierarchy-Reverse
  // relation from here) - a purely local override for "yes, I've checked, this card genuinely
  // has no parent". Always starts unchecked, so it has to be actively re-affirmed each session.
  parentNotApplicable: boolean;
  tags: string[];
}

export function draftFromDetail(detail: WorkItemDetail): KorthygienDraft {
  return {
    description: detail.descriptionHtml,
    acceptanceCriteria: detail.acceptanceCriteriaHtml,
    storyPoints: detail.storyPoints ?? undefined,
    areaPath: detail.areaPath ?? "",
    assignedTo: detail.assignedTo ?? "",
    developmentPartner: detail.developmentPartner ?? "",
    // Development Partner is optional support from a second developer - defaults to "not
    // applicable" (resolved, no action needed) unless someone has already named a partner.
    developmentPartnerNotApplicable: !detail.developmentPartner,
    parentNotApplicable: false,
    tags: detail.tags,
  };
}

export function hasText(html: string | null | undefined): boolean {
  return !!html && html.replace(/<[^>]*>/g, "").trim().length > 0;
}

/** Live "is this tab fully ok" check - driven by the current draft, not just the last save, so
 *  the tab/header color (and the Godkänn DoR gate) update as you type, not only after a save. */
export function korthygienOk(detail: WorkItemDetail, draft: KorthygienDraft): boolean {
  const config = getWorkItemTypeConfig(detail.type);
  return (
    hasText(draft.description) &&
    (!config.showStoryPoints || (!!draft.storyPoints && draft.storyPoints > 0)) &&
    !!draft.assignedTo.trim() &&
    (detail.type === "Bug" || detail.parent !== null || draft.parentNotApplicable) &&
    !!draft.areaPath
    // Acceptanskriterier and Sprintmål-taggen are intentionally excluded - they're worth a
    // warning if missing, but shouldn't block Godkänn DoR. Development Partner is excluded too:
    // it always resolves to either a name or the "not applicable" default, so it can never block.
  );
}

function StatusPill({
  ok,
  warnOnly,
  okText = "Uppfyllt",
  notOkText = "Saknas",
  warnText = "Rekommenderas",
}: {
  ok: boolean;
  warnOnly?: boolean;
  okText?: string;
  notOkText?: string;
  /** What the soft-warning state says. Naming what is missing beats a generic "Rekommenderas". */
  warnText?: string;
}) {
  const cls = ok ? "kh-pill--ok" : warnOnly ? "kh-pill--warn" : "kh-pill--missing";
  const text = ok ? okText : warnOnly ? warnText : notOkText;
  return <span className={`kh-pill ${cls}`}>{text}</span>;
}

interface RowProps {
  label: string;
  sub?: string;
  ok: boolean;
  /** Missing doesn't block Godkänn DoR - shown as a soft warning instead of a hard "Saknas". */
  warnOnly?: boolean;
  okText?: string;
  notOkText?: string;
  warnText?: string;
  children: ReactNode;
}

function Row({ label, sub, ok, warnOnly, okText, notOkText, warnText, children }: RowProps) {
  return (
    <div className="kh-row">
      <div className="kh-row__label">
        <span>{label}</span>
        {sub && <span className="kh-row__sub">{sub}</span>}
      </div>
      <StatusPill ok={ok} warnOnly={warnOnly} okText={okText} notOkText={notOkText} warnText={warnText} />
      <div className="kh-row__control">{children}</div>
    </div>
  );
}

/**
 * <select> that always includes the current value even if it fell out of the fetched list (e.g.
 * someone who left the team) - never silently discards a real Azure value.
 *
 * Submits the person's email (uniqueName), not a display name we synthesized from it - Azure's
 * own display names can include diacritics ("Nordström") that a naive email-derived guess
 * ("Nordstrom") won't match, and Azure rejects an unrecognized identity string outright. An
 * untouched existing value (already a valid Azure display name, since it's already assigned
 * there) is preserved as-is via the fallback option below.
 */
function PersonSelect({
  value,
  options,
  onChange,
  disabled,
  emptyLabel = "– välj –",
}: {
  value: string;
  options: PersonOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  emptyLabel?: string;
}) {
  const hasCurrent = !value || options.some((o) => o.displayName === value || o.email === value);
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {!hasCurrent && <option value={value}>{value}</option>}
      {options.map((o) => (
        <option key={o.email} value={o.email}>
          {o.displayName}
        </option>
      ))}
    </select>
  );
}

interface WorkItemKorthygienTabProps {
  detail: WorkItemDetail;
  draft: KorthygienDraft;
  onDraftChange: (patch: Partial<KorthygienDraft>) => void;
  onOpenRelation?: (item: WorkItemRelationRef) => void;
  ansvarigOptions: PersonOption[];
  partnerOptions: PersonOption[];
  /** Area paths and known tags for the pickers - null while still loading. */
  classification: ClassificationOptions | null;
  /** Cards allowed to be this one's parent. */
  parentCandidates: ParentCandidate[];
  /** Handed the reloaded card after a parent is linked. */
  onDetailChanged: (detail: WorkItemDetail) => void;
}

/**
 * Editable card-hygiene checklist - ported concept from Planeringsboardens Korthygien-flik.
 * Everything here is part of the same save as Behovsbedömningens DoR-tagg (see
 * WorkItemValidationModal), except Parent - changing the Hierarchy-Reverse relation safely
 * requires locating and replacing the existing relation by index, which isn't wired up yet.
 */
export function WorkItemKorthygienTab({
  detail,
  draft,
  onDraftChange,
  onOpenRelation,
  ansvarigOptions,
  partnerOptions,
  classification,
  parentCandidates,
  onDetailChanged,
}: WorkItemKorthygienTabProps) {
  const config = getWorkItemTypeConfig(detail.type);
  const [linkingParent, setLinkingParent] = useState(false);
  const [parentError, setParentError] = useState<string | null>(null);

  async function linkParent(targetId: number) {
    setLinkingParent(true);
    setParentError(null);
    try {
      onDetailChanged(await addWorkItemRelation(detail.id, targetId, "parent"));
    } catch (err) {
      setParentError(err instanceof Error ? err.message : "Kunde inte koppla parent.");
    } finally {
      setLinkingParent(false);
    }
  }
  const hasSprintGoalTag = draft.tags.some((t) => /^sprintm[aå]l/i.test(t.trim()));
  const devPartnerOk = draft.developmentPartnerNotApplicable || !!draft.developmentPartner.trim();

  return (
    <div className="kh-tab">
      <Section
        title="Korthygien"
        hint="Redigera direkt - sparas tillsammans med Behovsbedömningen"
        ok={korthygienOk(detail, draft)}
      >
        <div className="kh-rows">
          <Row label="Beskrivning" ok={hasText(draft.description)}>
            <MarkdownEditor
              rows={6}
              value={draft.description}
              onChange={(value) => onDraftChange({ description: value })}
              placeholder="Markdown stöds."
            />
          </Row>

          {config.showAcceptanceCriteria && (
            <Row label="Acceptanskriterier" ok={hasText(draft.acceptanceCriteria)} warnOnly>
              <MarkdownEditor rows={4} value={draft.acceptanceCriteria} onChange={(value) => onDraftChange({ acceptanceCriteria: value })} />
            </Row>
          )}

          {config.showStoryPoints && (
            <Row label="Story Points" ok={!!draft.storyPoints && draft.storyPoints > 0}>
              <input
                type="number"
                min={0}
                value={draft.storyPoints ?? ""}
                onChange={(e) => onDraftChange({ storyPoints: e.target.value === "" ? undefined : Number(e.target.value) })}
              />
            </Row>
          )}

          <Row label="Ansvarig" sub="Teamets utvecklare + PO" ok={!!draft.assignedTo.trim()}>
            <PersonSelect value={draft.assignedTo} options={ansvarigOptions} onChange={(v) => onDraftChange({ assignedTo: v })} />
          </Row>

          <Row
            label="Development Partner"
            sub="Valfritt stöd från ytterligare en utvecklare"
            ok={devPartnerOk}
            okText={draft.developmentPartnerNotApplicable ? "Ej nödvändigt/utses senare" : "Uppfyllt"}
          >
            <div className="kh-dev-partner">
              <PersonSelect
                value={draft.developmentPartner}
                options={partnerOptions}
                disabled={draft.developmentPartnerNotApplicable}
                onChange={(v) => onDraftChange({ developmentPartner: v })}
                emptyLabel="– välj partner –"
              />
              <label className="kh-checkbox">
                <input
                  type="checkbox"
                  checked={draft.developmentPartnerNotApplicable}
                  onChange={(e) =>
                    onDraftChange({
                      developmentPartnerNotApplicable: e.target.checked,
                      developmentPartner: e.target.checked ? "" : draft.developmentPartner,
                    })
                  }
                />
                Ej nödvändigt/utses senare
              </label>
            </div>
          </Row>

          <Row label="Area Path" ok={!!draft.areaPath}>
            {/* Picked from the project's tree rather than typed - a typo here silently moves the
                card out of the team's area. The current value is always kept in the list. */}
            <select value={draft.areaPath} onChange={(e) => onDraftChange({ areaPath: e.target.value })}>
              <option value="">– välj –</option>
              {draft.areaPath && !(classification?.areas ?? []).includes(draft.areaPath) && (
                <option value={draft.areaPath}>{draft.areaPath}</option>
              )}
              {(classification?.areas ?? []).map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Row>

          {detail.type !== "Bug" && (
            <Row
              label="Parent kopplat"
              ok={detail.parent !== null || draft.parentNotApplicable}
              okText={detail.parent === null && draft.parentNotApplicable ? "Saknas - godkänt" : "Uppfyllt"}
            >
              {detail.parent ? (
                <button type="button" className="kh-parent-link" onClick={() => onOpenRelation?.(detail.parent!)}>
                  {detail.parent.type} #{detail.parent.id} - {detail.parent.title}
                </button>
              ) : (
                <div className="kh-dev-partner">
                  {/* Linking happens straight from here now - having to leave the checklist for
                      the Relationer tab was the main reason this row got waved through. */}
                  <select
                    value=""
                    disabled={linkingParent || parentCandidates.length === 0}
                    onChange={(e) => e.target.value && void linkParent(Number(e.target.value))}
                  >
                    <option value="">
                      {parentCandidates.length === 0
                        ? "– inga möjliga parents –"
                        : linkingParent
                          ? "Kopplar…"
                          : "– välj parent –"}
                    </option>
                    {parentCandidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.type} #{c.id} - {c.title}
                      </option>
                    ))}
                  </select>
                  {parentError && <span className="kh-hint kh-hint--error">{parentError}</span>}
                  <label className="kh-checkbox">
                    <input
                      type="checkbox"
                      checked={draft.parentNotApplicable}
                      onChange={(e) => onDraftChange({ parentNotApplicable: e.target.checked })}
                    />
                    Kortet saknar medvetet parent
                  </label>
                </div>
              )}
            </Row>
          )}

          <Row label="Taggar (inkl. Sprintmål)" ok={hasSprintGoalTag} warnOnly warnText="Inget sprintmål">
            <TagEditor tags={draft.tags} onChange={(tags) => onDraftChange({ tags })} suggestions={classification?.tags ?? []} />
          </Row>
        </div>
      </Section>
    </div>
  );
}
