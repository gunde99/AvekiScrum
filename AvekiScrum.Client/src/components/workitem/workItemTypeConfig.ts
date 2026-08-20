export interface WorkItemTypeConfig {
  icon: string;
  color: string;
  showStoryPoints: boolean;
  showSeverityPriority: boolean;
  showSource: boolean;
  showActivity: boolean;
  showEstimates: boolean;
  showAcceptanceCriteria: boolean;
  showBusinessValue: boolean;
  showValueArea: boolean;
  /** Task links new work as Related rather than as children, so a taskboard would be misleading. */
  showTaskboard: boolean;
  descriptionLabel: string;
}

const DEFAULT_CONFIG: WorkItemTypeConfig = {
  icon: "📄",
  color: "var(--color-text-muted)",
  showStoryPoints: false,
  showSeverityPriority: false,
  showSource: false,
  showActivity: false,
  showEstimates: false,
  showAcceptanceCriteria: false,
  showBusinessValue: false,
  showValueArea: false,
  showTaskboard: true,
  descriptionLabel: "Beskrivning",
};

const CONFIG_BY_TYPE: Record<string, WorkItemTypeConfig> = {
  "User Story": {
    icon: "📖",
    color: "var(--cat-dev)",
    showStoryPoints: true,
    showSeverityPriority: false,
    showSource: false,
    showActivity: false,
    showEstimates: false,
    showAcceptanceCriteria: true,
    showBusinessValue: false,
    showValueArea: true,
    showTaskboard: true,
    descriptionLabel: "Beskrivning",
  },
  "Product Backlog Item": {
    icon: "📖",
    color: "var(--cat-dev)",
    showStoryPoints: true,
    showSeverityPriority: false,
    showSource: false,
    showActivity: false,
    showEstimates: false,
    showAcceptanceCriteria: true,
    showBusinessValue: false,
    showValueArea: true,
    showTaskboard: true,
    descriptionLabel: "Beskrivning",
  },
  Bug: {
    icon: "🐞",
    color: "var(--color-danger)",
    showStoryPoints: true,
    showSeverityPriority: true,
    showSource: true,
    showActivity: false,
    showEstimates: false,
    showAcceptanceCriteria: false,
    showBusinessValue: false,
    showValueArea: false,
    showTaskboard: true,
    descriptionLabel: "Reproduktionssteg",
  },
  Task: {
    icon: "✅",
    color: "var(--cat-review)",
    showStoryPoints: false,
    showSeverityPriority: false,
    showSource: false,
    showActivity: true,
    showEstimates: true,
    showAcceptanceCriteria: false,
    showBusinessValue: false,
    showValueArea: false,
    showTaskboard: false,
    descriptionLabel: "Beskrivning",
  },
  Feature: {
    icon: "🏆",
    color: "var(--cat-doc)",
    showStoryPoints: false,
    showSeverityPriority: false,
    showSource: false,
    showActivity: false,
    showEstimates: false,
    showAcceptanceCriteria: true,
    showBusinessValue: true,
    showValueArea: true,
    showTaskboard: true,
    descriptionLabel: "Beskrivning",
  },
  Epic: {
    icon: "📦",
    color: "var(--aveki-blue-tint-2)",
    showStoryPoints: false,
    showSeverityPriority: false,
    showSource: false,
    showActivity: false,
    showEstimates: false,
    showAcceptanceCriteria: true,
    showBusinessValue: true,
    showValueArea: true,
    showTaskboard: true,
    descriptionLabel: "Beskrivning",
  },
};

export function getWorkItemTypeConfig(type: string): WorkItemTypeConfig {
  return CONFIG_BY_TYPE[type] ?? DEFAULT_CONFIG;
}

const COMMON_STATES = ["New", "Active", "Resolved", "Closed", "Done", "Removed"];

/** No per-type workflow-state API yet - offers the common set as a practical default. */
export function commonStates(): string[] {
  return COMMON_STATES;
}

/* Fallbacks only. The real picklists come from the process template via /api/classification -
 * these values are not guessable (Severity is "2 - High (< 16 h )", Source is "Internal"), and
 * sending one Azure doesn't recognise makes it reject the whole save with a 400. They exist so a
 * failed options fetch still leaves usable dropdowns rather than empty ones. */
export const SEVERITIES = ["1 - Critical", "2 - High", "3 - Medium", "4 - Low"];

export const ACTIVITIES = ["Deployment", "Design", "Development", "Documentation", "Requirements", "Testing"];

export const VALUE_AREAS = ["Business", "Architectural"];

export const SOURCES = ["Customer", "Development", "Internal", "Test"];

export const ASSIGNED_TEAMS = ["Team Nord", "Team Syd"];

/** Types offered when creating a card from an open work item. */
export const CREATABLE_TYPES = ["User Story", "Bug", "Task", "Feature"];
