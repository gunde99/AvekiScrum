import type { UpgradeStatus } from "../../api/upgrade";

export const STATUS_LABEL: Record<UpgradeStatus, string> = {
  Active: "Pågår",
  Conflict: "Behöver slås ihop",
  Merged: "Uppdaterad i wikin",
  ClosedUnchanged: "Klar utan ändringar",
  Cancelled: "Avbruten",
};

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
