import { PersonAvatar } from "../PersonAvatar";
import type { WorkItemDetail, WorkItemFieldUpdate } from "../../api/workitems";
import { fullPersonName } from "../../lib/personNames";
import { renderWorkItemContent } from "../../lib/renderMarkdown";
import { MarkdownEditor } from "./MarkdownEditor";
import { TagEditor } from "./TagEditor";
import { Section } from "./Section";
import { commonStates, getWorkItemTypeConfig } from "./workItemTypeConfig";
import "./WorkItemOverviewTab.css";

interface WorkItemOverviewTabProps {
  detail: WorkItemDetail;
  editing: boolean;
  draft: WorkItemFieldUpdate;
  onDraftChange: (patch: Partial<WorkItemFieldUpdate>) => void;
}

function fmt(date: string | null): string {
  if (!date) return "–";
  return new Date(date).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "2-digit" });
}

export function WorkItemOverviewTab({ detail, editing, draft, onDraftChange }: WorkItemOverviewTabProps) {
  const config = getWorkItemTypeConfig(detail.type);

  return (
    <div className="wi-overview">
      <Section title="Översikt" hint="ansvarig, status &amp; uppskattning">
        <div className="wi-fields-grid">
          <div className="wi-field">
            <label>Ansvarig</label>
            {editing ? (
              <input type="text" value={draft.assignedTo ?? ""} onChange={(e) => onDraftChange({ assignedTo: e.target.value })} />
            ) : (
              <div className="wi-field__value wi-field__value--person">
                {/* key resets the "image failed" state when navigating to a different work item
                    in the same modal, instead of leaking a prior assignee's load failure forward. */}
                <PersonAvatar key={detail.id} name={detail.assignedTo} size={26} />
                <span>{fullPersonName(detail.assignedTo) || "Ej tilldelad"}</span>
              </div>
            )}
          </div>

          <div className="wi-field">
            <label>Status</label>
            {editing ? (
              <select value={draft.state} onChange={(e) => onDraftChange({ state: e.target.value })}>
                {commonStates().map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            ) : (
              <div className="wi-field__value">
                {detail.state}
                {detail.reason && <span className="wi-field__sub"> · {detail.reason}</span>}
              </div>
            )}
          </div>

          {config.showStoryPoints && (
            <div className="wi-field wi-field--number">
              <label>Story Points</label>
              {editing ? (
                <input
                  type="number"
                  min={0}
                  value={draft.storyPoints ?? ""}
                  onChange={(e) => onDraftChange({ storyPoints: e.target.value === "" ? undefined : Number(e.target.value) })}
                />
              ) : (
                <div className="wi-field__value wi-field__value--number">{detail.storyPoints ?? "–"}</div>
              )}
            </div>
          )}

          {config.showSeverityPriority && (
            <>
              <div className="wi-field">
                <label>Severity</label>
                <div className="wi-field__value">{detail.severity ?? "–"}</div>
              </div>
              <div className="wi-field">
                <label>Prioritet</label>
                <div className="wi-field__value">{detail.priority ?? "–"}</div>
              </div>
            </>
          )}

          {config.showSource && (
            <div className="wi-field">
              <label>Källa</label>
              <div className="wi-field__value">{detail.source ?? "–"}</div>
            </div>
          )}

          {config.showActivity && (
            <div className="wi-field">
              <label>Aktivitet</label>
              <div className="wi-field__value">{detail.activity ?? "–"}</div>
            </div>
          )}

          {config.showEstimates && (
            <div className="wi-field">
              <label>Arbete (kvar / klart / uppskattat)</label>
              <div className="wi-field__value">
                {detail.remainingWork ?? "–"} / {detail.completedWork ?? "–"} / {detail.originalEstimate ?? "–"}
              </div>
            </div>
          )}

          {config.showBusinessValue && (
            <div className="wi-field">
              <label>Affärsvärde</label>
              <div className="wi-field__value">{detail.businessValue ?? "–"}</div>
            </div>
          )}

          <div className="wi-field wi-field--full">
            <label>Area Path</label>
            {editing ? (
              <input type="text" value={draft.areaPath ?? ""} onChange={(e) => onDraftChange({ areaPath: e.target.value })} />
            ) : (
              <div className="wi-field__value wi-field__value--path">{detail.areaPath ?? "–"}</div>
            )}
          </div>

          <div className="wi-field wi-field--full">
            <label>Iteration Path</label>
            {editing ? (
              <input type="text" value={draft.iterationPath ?? ""} onChange={(e) => onDraftChange({ iterationPath: e.target.value })} />
            ) : (
              <div className="wi-field__value wi-field__value--path">{detail.iterationPath ?? "–"}</div>
            )}
          </div>

          <div className="wi-field wi-field--full">
            <label>Taggar</label>
            {editing ? (
              <TagEditor tags={draft.tags ?? []} onChange={(tags) => onDraftChange({ tags })} />
            ) : (
              <div className="wi-field__value">
                {detail.tags.length > 0 ? (
                  detail.tags.map((t) => (
                    <span className="wi-tag" key={t}>
                      {t}
                    </span>
                  ))
                ) : (
                  "–"
                )}
              </div>
            )}
          </div>
        </div>
      </Section>

      <Section title={config.descriptionLabel}>
        {editing ? (
          <MarkdownEditor
            rows={14}
            value={draft.description ?? ""}
            onChange={(value) => onDraftChange({ description: value })}
            placeholder="Markdown stöds. Klistra in en bild för att bifoga den."
          />
        ) : (
          <div
            className="wi-rich-text"
            dangerouslySetInnerHTML={{ __html: renderWorkItemContent(detail.descriptionHtml) || "<em>Ingen beskrivning</em>" }}
          />
        )}
      </Section>

      {config.showAcceptanceCriteria && (
        <Section title="Acceptanskriterier">
          {editing ? (
            <MarkdownEditor rows={8} value={draft.acceptanceCriteria ?? ""} onChange={(value) => onDraftChange({ acceptanceCriteria: value })} />
          ) : (
            <div
              className="wi-rich-text"
              dangerouslySetInnerHTML={{
                __html: renderWorkItemContent(detail.acceptanceCriteriaHtml) || "<em>Inga acceptanskriterier</em>",
              }}
            />
          )}
        </Section>
      )}

      <Section title="Metadata" hint="skapad &amp; senast ändrad">
        <div className="wi-meta-row">
          <span>
            Skapad av <strong>{fullPersonName(detail.createdBy) || "Okänd"}</strong> {fmt(detail.createdDate)}
          </span>
          <span>Senast ändrad {fmt(detail.changedDate)}</span>
          {config.showValueArea && detail.valueArea && <span>Värdeområde: {detail.valueArea}</span>}
        </div>
      </Section>
    </div>
  );
}
