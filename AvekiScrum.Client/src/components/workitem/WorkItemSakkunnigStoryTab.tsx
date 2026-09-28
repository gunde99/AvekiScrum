import { useState } from "react";
import type { WorkItemDetail, WorkItemRelationRef } from "../../api/workitems";
import { WorkItemRefCard } from "./WorkItemRefCard";
import { Section } from "./Section";
import { AppointSakkunnigModal } from "./AppointSakkunnigModal";
import "./WorkItemSakkunnigStoryTab.css";

interface WorkItemSakkunnigStoryTabProps {
  detail: WorkItemDetail;
  onOpenRelation: (item: WorkItemRelationRef, relationLabel: string) => void;
  onChanged: (detail: WorkItemDetail) => void;
}

/** The card an earlier "Utse Sakkunnig" created for this Story, if any - identified by its title
 *  prefix, same convention as isHelpTextTask elsewhere in the app (no dedicated relation-kind flag
 *  exists on WorkItemRelationRef, and the prefix is already the human-readable marker). */
function findSakkunnigCard(related: WorkItemRelationRef[]): WorkItemRelationRef | undefined {
  return related.find((r) => r.title.trim().toLowerCase().startsWith("sakkunnig_"));
}

export function WorkItemSakkunnigStoryTab({ detail, onOpenRelation, onChanged }: WorkItemSakkunnigStoryTabProps) {
  const [showModal, setShowModal] = useState(false);
  const sakkunnigCard = findSakkunnigCard(detail.related);

  return (
    <div className="sk-story-tab">
      <Section title="Sakkunnig">
        {sakkunnigCard ? (
          <>
            <p className="sk-story-tab__status">Sakkunnig är utsedd.</p>
            <WorkItemRefCard item={sakkunnigCard} onOpen={() => onOpenRelation(sakkunnigCard, "Related")} />
          </>
        ) : (
          <>
            <p className="sk-story-tab__hint">Ingen sakkunnig är utsedd för det här kortet än.</p>
            <button type="button" className="wi-btn wi-btn--primary" onClick={() => setShowModal(true)}>
              Utse Sakkunnig
            </button>
          </>
        )}
      </Section>

      {showModal && (
        <AppointSakkunnigModal
          detail={detail}
          onClose={() => setShowModal(false)}
          onCreated={(updated) => {
            onChanged(updated);
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}
