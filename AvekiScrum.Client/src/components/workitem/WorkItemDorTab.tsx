import type { ReactNode } from "react";
import type { WorkItemDetail } from "../../api/workitems";
import { RichText } from "../RichText";
import { Section } from "./Section";
import "./WorkItemDetailsTab.css";
import "./WorkItemDorTab.css";

function Row({ label, value }: { label: string; value: ReactNode }) {
  const isEmpty = value === null || value === undefined || value === "";
  return (
    <div className="wi-details-row">
      <span className="wi-details-row__label">{label}</span>
      <span className="wi-details-row__value">{isEmpty ? "–" : value}</span>
    </div>
  );
}

function hasDorTag(detail: WorkItemDetail): boolean {
  return detail.tags.some((t) => t.trim().toLowerCase() === "dor");
}

/**
 * Read-only view of the DoR review, on the plain card - not everyone who opens a US/Bug needs to
 * go through the Validering dialog just to see what was decided last time. Editing still only
 * happens there (Korthygien/Behovsbedömning/INVEST/Godkännande); this is a summary, not a form.
 */
export function WorkItemDorTab({ detail }: { detail: WorkItemDetail }) {
  const reviewed = hasDorTag(detail);

  return (
    <div className="dor-tab">
      <Section title="Granskning" ok={reviewed} hint={reviewed ? "Kortet har DoR-taggen" : "Kortet är inte granskat än"}>
        <Row label="DoR-tagg" value={reviewed ? "Satt" : "Saknas"} />
        <Row label="Bedömning" value={detail.doRStatus} />
        <Row label="Granskad av" value={detail.doRApprovedBy} />
        <Row label="Granskad datum" value={detail.doRApprovedDate ? new Date(detail.doRApprovedDate).toLocaleString("sv-SE") : null} />
        <Row label="Revision vid granskning" value={detail.doRRevision} />
      </Section>

      {detail.doRDecisionHtml && (
        <Section title="Underlag (INVEST, Ready check, Behovsbedömning)">
          <RichText className="dor-tab__decision" content={detail.doRDecisionHtml} />
        </Section>
      )}
    </div>
  );
}
