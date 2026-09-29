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
  /** Shown in the step-transition flash and as the placeholder "photo" until a real one is wired
   *  in per role - see StepTransitionModal. */
  icon: string;
}

/** Fixed order, mirroring the Planner card's own checklist - not user-configurable. */
export const AGENDA: AgendaStep[] = [
  { id: "laget-runt", label: "Laget runt (kort om vad man jobbar med just nu)", icon: "🗣️" },
  { id: "aktivitetsboarden", label: "Genomgång av aktivitetsboarden", icon: "📋" },
  { id: "utvecklingsansvarig", label: "Information från Utvecklingsansvarig", icon: "🧭" },
  { id: "scrum-master", label: "Information från Scrum Mastern", icon: "🧑‍💼" },
  { id: "release-test", label: "Information från Release/Test-ansvarig", icon: "🚦" },
  { id: "appsec", label: "Information från AppSec", icon: "🛡️" },
  { id: "devops", label: "Information från DevOps", icon: "⚙️" },
  { id: "ovrigt", label: "Övrigt", icon: "💬" },
];
