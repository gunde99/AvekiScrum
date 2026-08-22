import { PersonAvatar } from "../PersonAvatar";
import { FIELD, fieldOptionsFor, type ClassificationOptions, type WorkItemDetail, type WorkItemFieldUpdate } from "../../api/workitems";
import type { PersonOption } from "../../api/people";
import { fullPersonName } from "../../lib/personNames";
import { RichText } from "../RichText";
import { MarkdownEditor } from "./MarkdownEditor";
import { TagEditor } from "./TagEditor";
import { Section } from "./Section";
import { ACTIVITIES, ASSIGNED_TEAMS, commonStates, getWorkItemTypeConfig, SEVERITIES, SOURCES, VALUE_AREAS } from "./workItemTypeConfig";
import "./WorkItemOverviewTab.css";

interface WorkItemOverviewTabProps {
  detail: WorkItemDetail;
  editing: boolean;
  draft: WorkItemFieldUpdate;
  onDraftChange: (patch: Partial<WorkItemFieldUpdate>) => void;
  /** Area paths, iteration paths and known tags - null while still loading. */
  classification: ClassificationOptions | null;
  people: PersonOption[];
}

function fmt(date: string | null): string {
  if (!date) return "–";
  return new Date(date).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "2-digit" });
}

/** A select that keeps whatever the card already holds, even when it isn't in the offered list -
 *  editing a card must never silently rewrite a value just because this app doesn't know it. */
function PickList({
  value,
  options,
  onChange,
  allowEmpty = true,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  allowEmpty?: boolean;
}) {
  const all = value && !options.some((o) => o === value) ? [value, ...options] : options;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty && <option value="">–</option>}
      {all.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function NumberField({ value, onChange, min = 0 }: { value: number | undefined; onChange: (v: number | undefined) => void; min?: number }) {
  return (
    <input
      type="number"
      min={min}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
    />
  );
}

export function WorkItemOverviewTab({ detail, editing, draft, onDraftChange, classification, people }: WorkItemOverviewTabProps) {
  const config = getWorkItemTypeConfig(detail.type);
  // Prefer what the process template says this type allows; the constants are only a fallback for
  // when that lookup came back empty (a type the project doesn't define, or a failed fetch).
  const opts = (field: string, fallback: string[]) => {
    const fromAzure = fieldOptionsFor(classification, detail.type, field);
    return fromAzure.length > 0 ? fromAzure : fallback;
  };
  const states = opts(FIELD.state, commonStates());
  const priorities = opts(FIELD.priority, ["1", "2", "3", "4"]);

  return (
    <div className="wi-overview">
      <Section title="Översikt" hint="ansvarig, status &amp; uppskattning">
        <div className="wi-fields-grid">
          <div className="wi-field">
            <label>Ansvarig</label>
            {editing ? (
              <PickList
                value={draft.assignedTo ?? ""}
                options={people.map((p) => p.displayName)}
                onChange={(assignedTo) => onDraftChange({ assignedTo })}
              />
            ) : (
              <div className="wi-field__value wi-field__value--person">
                {/* key resets the "image failed" state when navigating to a different work item
                    in the same modal, instead of leaking a prior assignee's load failure forward. */}
                <PersonAvatar key={detail.id} name={detail.assignedTo} size={26} />
                <span>{fullPersonName(detail.assignedTo) || "Ej tilldelad"}</span>
              </div>
            )}
          </div>

          <div className="wi-field wi-field--status">
            <label>Status</label>
            {editing ? (
              <select value={draft.state} onChange={(e) => onDraftChange({ state: e.target.value })}>
                {states.map((s) => (
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
                <NumberField value={draft.storyPoints} onChange={(storyPoints) => onDraftChange({ storyPoints })} />
              ) : (
                <div className="wi-field__value wi-field__value--number">{detail.storyPoints ?? "–"}</div>
              )}
            </div>
          )}

          {/* Priority applies to every work item type, not just bugs - only Severity is
              bug-specific. */}
          <div className="wi-field">
            <label>Prioritet</label>
            {editing ? (
              <select
                value={draft.priority ?? ""}
                onChange={(e) => onDraftChange({ priority: e.target.value === "" ? undefined : Number(e.target.value) })}
              >
                <option value="">–</option>
                {priorities.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            ) : (
              <div className="wi-field__value">{detail.priority ?? "–"}</div>
            )}
          </div>

          {config.showSeverityPriority && (
            <div className="wi-field">
              <label>Severity</label>
              {editing ? (
                <PickList value={draft.severity ?? ""} options={opts(FIELD.severity, SEVERITIES)} onChange={(severity) => onDraftChange({ severity })} />
              ) : (
                <div className="wi-field__value">{detail.severity ?? "–"}</div>
              )}
            </div>
          )}

          {config.showSource && (
            <div className="wi-field">
              <label>Källa</label>
              {editing ? (
                <PickList value={draft.source ?? ""} options={opts(FIELD.source, SOURCES)} onChange={(source) => onDraftChange({ source })} />
              ) : (
                <div className="wi-field__value">{detail.source ?? "–"}</div>
              )}
            </div>
          )}

          {config.showActivity && (
            <div className="wi-field">
              <label>Aktivitet</label>
              {editing ? (
                <PickList value={draft.activity ?? ""} options={opts(FIELD.activity, ACTIVITIES)} onChange={(activity) => onDraftChange({ activity })} />
              ) : (
                <div className="wi-field__value">{detail.activity ?? "–"}</div>
              )}
            </div>
          )}

          {config.showEstimates &&
            (editing ? (
              // Split into three inputs when editing - a single "kvar / klart / uppskattat" cell
              // reads fine but can't be typed into.
              <>
                <div className="wi-field wi-field--number">
                  <label>Arbete kvar</label>
                  <NumberField value={draft.remainingWork} onChange={(remainingWork) => onDraftChange({ remainingWork })} />
                </div>
                <div className="wi-field wi-field--number">
                  <label>Utfört arbete</label>
                  <NumberField value={draft.completedWork} onChange={(completedWork) => onDraftChange({ completedWork })} />
                </div>
                <div className="wi-field wi-field--number">
                  <label>Uppskattat</label>
                  <NumberField value={draft.originalEstimate} onChange={(originalEstimate) => onDraftChange({ originalEstimate })} />
                </div>
              </>
            ) : (
              <div className="wi-field">
                <label>Arbete (kvar / klart / uppskattat)</label>
                <div className="wi-field__value">
                  {detail.remainingWork ?? "–"} / {detail.completedWork ?? "–"} / {detail.originalEstimate ?? "–"}
                </div>
              </div>
            ))}

          {config.showBusinessValue && (
            <div className="wi-field wi-field--number">
              <label>Affärsvärde</label>
              {editing ? (
                <NumberField value={draft.businessValue} onChange={(businessValue) => onDraftChange({ businessValue })} />
              ) : (
                <div className="wi-field__value">{detail.businessValue ?? "–"}</div>
              )}
            </div>
          )}

          {config.showValueArea && (
            <div className="wi-field">
              <label>Värdeområde</label>
              {editing ? (
                <PickList value={draft.valueArea ?? ""} options={opts(FIELD.valueArea, VALUE_AREAS)} onChange={(valueArea) => onDraftChange({ valueArea })} />
              ) : (
                <div className="wi-field__value">{detail.valueArea ?? "–"}</div>
              )}
            </div>
          )}

          <div className="wi-field">
            <label>Assigned Team</label>
            {editing ? (
              <PickList value={draft.assignedTeam ?? ""} options={opts(FIELD.assignedTeam, ASSIGNED_TEAMS)} onChange={(assignedTeam) => onDraftChange({ assignedTeam })} />
            ) : (
              <div className="wi-field__value">{detail.assignedTeam ?? "–"}</div>
            )}
          </div>

          <div className="wi-field">
            <label>Development Partner</label>
            {editing ? (
              <PickList
                value={draft.developmentPartner ?? ""}
                options={people.map((p) => p.displayName)}
                onChange={(developmentPartner) => onDraftChange({ developmentPartner })}
              />
            ) : (
              <div className="wi-field__value wi-field__value--person">
                {detail.developmentPartner ? (
                  <>
                    <PersonAvatar key={`dp-${detail.id}`} name={detail.developmentPartner} size={26} />
                    <span>{fullPersonName(detail.developmentPartner)}</span>
                  </>
                ) : (
                  "–"
                )}
              </div>
            )}
          </div>
        </div>

        {/* Second row: tags take the width they need, Area Path sits right-aligned at the end.
            Iteration Path lives in the card header when reading - but has to be editable here. */}
        <div className="wi-fields-row2">
          <div className="wi-field">
            <label>Taggar</label>
            {editing ? (
              <TagEditor tags={draft.tags ?? []} onChange={(tags) => onDraftChange({ tags })} suggestions={classification?.tags ?? []} />
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

          <div className={"wi-field" + (editing ? "" : " wi-field--area")}>
            <label>Area Path</label>
            {editing ? (
              <PickList
                value={draft.areaPath ?? ""}
                options={classification?.areas ?? []}
                onChange={(areaPath) => onDraftChange({ areaPath })}
                allowEmpty={false}
              />
            ) : (
              <div className="wi-field__value wi-field__value--path">{detail.areaPath ?? "–"}</div>
            )}
          </div>

          {editing && (
            <div className="wi-field">
              <label>Iteration</label>
              <PickList
                value={draft.iterationPath ?? ""}
                options={classification?.iterations ?? []}
                onChange={(iterationPath) => onDraftChange({ iterationPath })}
                allowEmpty={false}
              />
            </div>
          )}
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
          <RichText className="wi-rich-text" content={detail.descriptionHtml} fallbackHtml="<em>Ingen beskrivning</em>" />
        )}
      </Section>

      {config.showAcceptanceCriteria && (
        <Section title="Acceptanskriterier">
          {editing ? (
            <MarkdownEditor rows={8} value={draft.acceptanceCriteria ?? ""} onChange={(value) => onDraftChange({ acceptanceCriteria: value })} />
          ) : (
            <RichText
              className="wi-rich-text"
              content={detail.acceptanceCriteriaHtml}
              fallbackHtml="<em>Inga acceptanskriterier</em>"
            />
          )}
        </Section>
      )}

      {/* Custom.Stakeholders is an html field, not an identity one - it routinely holds a
          person plus a municipality and a note, so it gets the room a rich-text field needs
          rather than a one-line picker that rendered the markup as literal text. */}
      <Section title="Stakeholder">
        {editing ? (
          <MarkdownEditor
            rows={5}
            value={draft.stakeholders ?? ""}
            onChange={(value) => onDraftChange({ stakeholders: value })}
            placeholder="Vem har efterfrågat det här, och för vems räkning?"
          />
        ) : (
          <RichText
            className="wi-rich-text"
            content={detail.stakeholders}
            fallbackHtml="<em>Ingen stakeholder angiven</em>"
          />
        )}
      </Section>

      <Section title="Metadata" hint="skapad &amp; senast ändrad">
        <div className="wi-meta-row">
          <span>
            Skapad av <strong>{fullPersonName(detail.createdBy) || "Okänd"}</strong> {fmt(detail.createdDate)}
          </span>
          <span>Senast ändrad {fmt(detail.changedDate)}</span>
        </div>
      </Section>
    </div>
  );
}
