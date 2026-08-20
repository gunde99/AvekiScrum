import { useState } from "react";
import {
  addWorkItemRelation,
  removeWorkItemRelation,
  type LinkKind,
  type WorkItemDetail,
  type WorkItemRelationRef,
} from "../../api/workitems";
import type { PersonOption } from "../../api/people";
import { NewWorkItemForm } from "./NewWorkItemForm";
import { Section } from "./Section";
import { WorkItemRefCard } from "./WorkItemRefCard";
import { allowedChildTypes, allowedParentTypes } from "./workItemTypeConfig";
import "./WorkItemRelationsTab.css";

interface WorkItemRelationsTabProps {
  detail: WorkItemDetail;
  onOpenRelation: (item: WorkItemRelationRef, relationLabel: string) => void;
  /** Handed the reloaded card so counts and lists update without reopening the modal. */
  onChanged: (detail: WorkItemDetail) => void;
  people: PersonOption[];
}

/** Links an existing card by id. Kept separate from creating a new one - the two are different
 *  intents and sharing one form made both harder to read. */
function LinkExistingForm({
  detail,
  linkKind,
  onChanged,
}: {
  detail: WorkItemDetail;
  linkKind: LinkKind;
  onChanged: (detail: WorkItemDetail) => void;
}) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const target = Number(id.trim());
    if (!Number.isInteger(target) || target <= 0) {
      setError("Ange ett giltigt kort-ID.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onChanged(await addWorkItemRelation(detail.id, target, linkKind));
      setId("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte länka kortet.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="wi-btn wi-rel__link-open" onClick={() => setOpen(true)}>
        + Länka befintligt kort
      </button>
    );
  }

  return (
    <div className="wi-rel__link">
      <input
        type="number"
        value={id}
        autoFocus
        placeholder="Kort-ID, t.ex. 24210"
        onChange={(e) => setId(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !busy) void submit();
        }}
      />
      <button type="button" className="wi-btn wi-btn--primary" onClick={submit} disabled={busy || !id.trim()}>
        {busy ? "Länkar…" : "Länka"}
      </button>
      <button
        type="button"
        className="wi-btn"
        onClick={() => {
          setId("");
          setError(null);
          setOpen(false);
        }}
        disabled={busy}
      >
        Avbryt
      </button>
      {error && <span className="wi-rel__error">{error}</span>}
    </div>
  );
}

function RelationRow({
  item,
  label,
  detail,
  linkKind,
  onOpenRelation,
  onChanged,
}: {
  item: WorkItemRelationRef;
  label: string;
  detail: WorkItemDetail;
  linkKind: LinkKind;
  onOpenRelation: (item: WorkItemRelationRef, relationLabel: string) => void;
  onChanged: (detail: WorkItemDetail) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlink() {
    setBusy(true);
    setError(null);
    try {
      onChanged(await removeWorkItemRelation(detail.id, item.id, linkKind));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte ta bort länken.");
      setBusy(false);
    }
  }

  return (
    <div className="wi-rel__row">
      <WorkItemRefCard item={item} onOpen={() => onOpenRelation(item, label)} />
      <button
        type="button"
        className="wi-rel__unlink"
        onClick={unlink}
        disabled={busy}
        // Unlinking never deletes the card itself, which is worth being explicit about.
        title={`Ta bort länken till #${item.id} (kortet finns kvar)`}
        aria-label={`Ta bort länken till #${item.id}`}
      >
        {busy ? "…" : "✕"}
      </button>
      {error && <span className="wi-rel__error">{error}</span>}
    </div>
  );
}

export function WorkItemRelationsTab({ detail, onOpenRelation, onChanged, people }: WorkItemRelationsTabProps) {
  const childTypes = allowedChildTypes(detail.type);
  const parentTypes = allowedParentTypes(detail.type);

  return (
    <div className="wi-relations-tab">
      <Section title="Parent" hint={detail.parent ? undefined : "ingen parent satt"}>
        {detail.parent ? (
          <RelationRow
            item={detail.parent}
            label="Parent"
            detail={detail}
            linkKind="parent"
            onOpenRelation={onOpenRelation}
            onChanged={onChanged}
          />
        ) : parentTypes.length === 0 ? (
          <p className="wi-empty-state">{detail.type} ligger högst upp i hierarkin och har ingen parent.</p>
        ) : (
          // Only one parent is allowed, so the controls disappear entirely once one is set -
          // the way to change it is to unlink the current one first.
          <div className="wi-rel__actions">
            <LinkExistingForm detail={detail} linkKind="parent" onChanged={onChanged} />
            <NewWorkItemForm
              source={detail}
              linkKind="parent"
              types={parentTypes}
              people={people}
              onCreated={onChanged}
              openLabel="+ Skapa ny parent"
            />
          </div>
        )}
      </Section>

      {/* A Task is always a leaf - no children section at all rather than one that can only
          ever refuse. */}
      {childTypes.length > 0 && (
        <Section title="Children" hint={detail.children.length > 0 ? `${detail.children.length} st` : undefined}>
          <div className="wi-relations-tab__list">
            {detail.children.map((c) => (
              <RelationRow
                key={c.id}
                item={c}
                label="Child"
                detail={detail}
                linkKind="child"
                onOpenRelation={onOpenRelation}
                onChanged={onChanged}
              />
            ))}
          </div>
          <div className="wi-rel__actions">
            <LinkExistingForm detail={detail} linkKind="child" onChanged={onChanged} />
            <NewWorkItemForm
              source={detail}
              linkKind="child"
              types={childTypes}
              people={people}
              onCreated={onChanged}
              openLabel="+ Skapa nytt child"
            />
          </div>
          <p className="wi-rel__rule">Tillåtna typer: {childTypes.join(", ")}.</p>
        </Section>
      )}

      <Section title="Related" hint={detail.related.length > 0 ? `${detail.related.length} st` : undefined}>
        <div className="wi-relations-tab__list">
          {detail.related.map((r) => (
            <RelationRow
              key={r.id}
              item={r}
              label="Related"
              detail={detail}
              linkKind="related"
              onOpenRelation={onOpenRelation}
              onChanged={onChanged}
            />
          ))}
        </div>
        <div className="wi-rel__actions">
          <LinkExistingForm detail={detail} linkKind="related" onChanged={onChanged} />
          <NewWorkItemForm source={detail} linkKind="related" people={people} onCreated={onChanged} openLabel="+ Skapa nytt relaterat kort" />
        </div>
      </Section>
    </div>
  );
}
