export type AgendaStepId =
  | "laget-runt"
  | "veckans-influencers"
  | "aktivitetsboarden"
  | "utvecklingsansvarig"
  | "scrum-master"
  | "release-test"
  | "appsec"
  | "devops"
  | "nasta-influencer"
  | "ovrigt";

export interface AgendaStep {
  id: AgendaStepId;
  label: string;
  /** Shown in the compact agenda list - always present, even for steps that also have a photo. */
  icon: string;
  /** Shown large in the step-transition flash for the role-shaped steps - symbolizes the role
   *  itself (DevOps, security, ...), never a specific employee. See public/rollbilder/CREDITS.md
   *  for sourcing; steps without one just show `icon` large instead. */
  photo?: string;
  /** Display names whose faces the step-transition flash shows instead of a photo/icon - used by
   *  "Veckans influencers", where the people *are* the step. */
  people?: string[];
}

/** Fixed order, mirroring the Planner card's own checklist - not user-configurable. "Veckans
 *  influencers" isn't listed here: it's inserted as point 2 only on a date someone was drawn for,
 *  see buildAgenda. */
export const AGENDA: AgendaStep[] = [
  { id: "laget-runt", label: "Laget runt (kort om vad man jobbar med just nu)", icon: "🗣️", photo: "/rollbilder/laget-runt.jpg" },
  { id: "aktivitetsboarden", label: "Genomgång av aktivitetsboarden", icon: "📋" },
  { id: "utvecklingsansvarig", label: "Information från Utvecklingsansvarig", icon: "🧭", photo: "/rollbilder/utvecklingsansvarig.jpg" },
  { id: "scrum-master", label: "Information från Scrum Mastern", icon: "🧑‍💼", photo: "/startbilder/scrum.jpg" },
  { id: "release-test", label: "Information från Release/Test-ansvarig", icon: "🚦", photo: "/startbilder/test.jpg" },
  { id: "appsec", label: "Information från AppSec", icon: "🛡️", photo: "/rollbilder/appsec.jpg" },
  { id: "devops", label: "Information från DevOps", icon: "⚙️", photo: "/rollbilder/devops.jpg" },
  { id: "nasta-influencer", label: "Nästa veckas influencer", icon: "🎲" },
  { id: "ovrigt", label: "Övrigt", icon: "💬", photo: "/rollbilder/ovrigt.jpg" },
];

/** The day's agenda: AGENDA, plus "Veckans influencers" right after Laget runt when anyone was
 *  drawn (at an earlier meeting) to present today. */
export function buildAgenda(todaysInfluencerNames: string[]): AgendaStep[] {
  if (todaysInfluencerNames.length === 0) return AGENDA;
  const influencerStep: AgendaStep = {
    id: "veckans-influencers",
    label: todaysInfluencerNames.length === 1 ? "Veckans influencer" : "Veckans influencers",
    icon: "🎤",
    people: todaysInfluencerNames,
  };
  return [AGENDA[0], influencerStep, ...AGENDA.slice(1)];
}
