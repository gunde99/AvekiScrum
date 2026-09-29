export type AgendaStepId =
  | "laget-runt"
  | "aktivitetsboarden"
  | "utvecklingsansvarig"
  | "scrum-master"
  | "release-test"
  | "appsec"
  | "devops"
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
}

/** Fixed order, mirroring the Planner card's own checklist - not user-configurable. */
export const AGENDA: AgendaStep[] = [
  { id: "laget-runt", label: "Laget runt (kort om vad man jobbar med just nu)", icon: "🗣️" },
  { id: "aktivitetsboarden", label: "Genomgång av aktivitetsboarden", icon: "📋" },
  { id: "utvecklingsansvarig", label: "Information från Utvecklingsansvarig", icon: "🧭", photo: "/rollbilder/utvecklingsansvarig.jpg" },
  { id: "scrum-master", label: "Information från Scrum Mastern", icon: "🧑‍💼", photo: "/startbilder/scrum.jpg" },
  { id: "release-test", label: "Information från Release/Test-ansvarig", icon: "🚦", photo: "/startbilder/test.jpg" },
  { id: "appsec", label: "Information från AppSec", icon: "🛡️", photo: "/rollbilder/appsec.jpg" },
  { id: "devops", label: "Information från DevOps", icon: "⚙️", photo: "/rollbilder/devops.jpg" },
  { id: "ovrigt", label: "Övrigt", icon: "💬" },
];
