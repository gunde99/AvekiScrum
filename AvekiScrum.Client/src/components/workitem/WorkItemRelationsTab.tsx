import type { WorkItemDetail, WorkItemRelationRef } from "../../api/workitems";
import { Section } from "./Section";
import { WorkItemRefCard } from "./WorkItemRefCard";
import "./WorkItemRelationsTab.css";

interface WorkItemRelationsTabProps {
  detail: WorkItemDetail;
  onOpenRelation: (item: WorkItemRelationRef, relationLabel: string) => void;
}

export function WorkItemRelationsTab({ detail, onOpenRelation }: WorkItemRelationsTabProps) {
  const hasAny = detail.parent || detail.children.length > 0 || detail.related.length > 0;

  if (!hasAny) {
    return <p className="wi-empty-state">Inga relationer.</p>;
  }

  return (
    <div className="wi-relations-tab">
      {detail.parent && (
        <Section title="Parent">
          <WorkItemRefCard item={detail.parent} onOpen={() => onOpenRelation(detail.parent!, "Parent")} />
        </Section>
      )}
      {detail.children.length > 0 && (
        <Section title="Children" hint={`${detail.children.length} st`}>
          <div className="wi-relations-tab__list">
            {detail.children.map((c) => (
              <WorkItemRefCard key={c.id} item={c} onOpen={() => onOpenRelation(c, "Child")} />
            ))}
          </div>
        </Section>
      )}
      {detail.related.length > 0 && (
        <Section title="Related" hint={`${detail.related.length} st`}>
          <div className="wi-relations-tab__list">
            {detail.related.map((r) => (
              <WorkItemRefCard key={r.id} item={r} onOpen={() => onOpenRelation(r, "Related")} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
