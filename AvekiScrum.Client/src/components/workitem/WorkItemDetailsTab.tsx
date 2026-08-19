import type { ReactNode } from "react";
import type { WorkItemDetail } from "../../api/workitems";
import { Section } from "./Section";
import "./WorkItemDetailsTab.css";

function Row({ label, value }: { label: string; value: ReactNode }) {
  const isEmpty = value === null || value === undefined || value === "";
  return (
    <div className="wi-details-row">
      <span className="wi-details-row__label">{label}</span>
      <span className="wi-details-row__value">{isEmpty ? "–" : value}</span>
    </div>
  );
}

/**
 * All the fields the type-specific Overview tab hides for this item's type (e.g. a User
 * Story's Overview doesn't show Activity/estimates) plus a few technical extras - shown
 * here unconditionally so nothing about the work item stays out of reach.
 */
export function WorkItemDetailsTab({ detail }: { detail: WorkItemDetail }) {
  return (
    <div className="wi-details-tab">
      <Section title="Klassificering">
        <Row label="Typ" value={detail.type} />
        <Row label="Orsak (Reason)" value={detail.reason} />
        <Row label="Prioritet" value={detail.priority} />
        <Row label="Severity" value={detail.severity} />
        <Row label="Värdeområde" value={detail.valueArea} />
        <Row label="Affärsvärde" value={detail.businessValue} />
      </Section>

      <Section title="Uppskattning">
        <Row label="Story Points" value={detail.storyPoints} />
        <Row label="Aktivitet" value={detail.activity} />
        <Row label="Ursprunglig uppskattning" value={detail.originalEstimate} />
        <Row label="Återstående arbete" value={detail.remainingWork} />
        <Row label="Klart arbete" value={detail.completedWork} />
      </Section>

      <Section title="Tekniskt">
        <Row label="ID" value={detail.id} />
        <Row
          label="Länk"
          value={
            <a href={detail.webUrl} target="_blank" rel="noreferrer">
              {detail.webUrl}
            </a>
          }
        />
      </Section>
    </div>
  );
}
