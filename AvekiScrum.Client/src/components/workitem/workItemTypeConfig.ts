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
