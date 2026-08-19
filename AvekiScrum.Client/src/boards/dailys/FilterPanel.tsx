import { useState, type ReactNode } from "react";
import { CLOSED_STALE_WORKING_DAYS, TEST_FILTER_LABELS, type TestFilterKey } from "./dailysLogic";
import "./FilterPanel.css";

export type WorkItemTypeKey = "story" | "bug";

export const WORK_ITEM_TYPES: { key: WorkItemTypeKey; label: string }[] = [
  { key: "story", label: "Stories" },
  { key: "bug", label: "Buggar" },
];

function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M1.5 2.5h13L9.5 8.2V13l-3 1.5V8.2L1.5 2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export type TagFilterState = "include" | "exclude";

interface FilterPanelProps {
  searchText: string;
  onSearchTextChange: (value: string) => void;
  statuses: string[];
  selectedStatuses: Set<string>;
  onToggleStatus: (status: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  tags: string[];
  tagFilters: Map<string, TagFilterState>;
  onCycleTag: (tag: string) => void;
  onClearTags: () => void;
  hideStaleClosed: boolean;
  onToggleStaleClosed: () => void;
  staleClosedCount: number;
  selectedTypes: Set<WorkItemTypeKey>;
  onToggleType: (type: WorkItemTypeKey) => void;
  testFilters: Set<TestFilterKey>;
  onToggleTestFilter: (key: TestFilterKey) => void;
}

export function FilterPanel({
  searchText,
  onSearchTextChange,
  statuses,
  selectedStatuses,
  onToggleStatus,
  onSelectAll,
  onSelectNone,
  tags,
  tagFilters,
  onCycleTag,
  onClearTags,
  hideStaleClosed,
  onToggleStaleClosed,
  staleClosedCount,
  selectedTypes,
  onToggleType,
  testFilters,
  onToggleTestFilter,
}: FilterPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Counts deviations from the default view: the stale-closed filter and both type pills are on
  // by default, so they only count once the user has turned something off.
  const activeFilterCount =
    (searchText.trim() ? 1 : 0) +
    (selectedStatuses.size < statuses.length ? 1 : 0) +
    tagFilters.size +
    (hideStaleClosed ? 0 : 1) +
    (selectedTypes.size < WORK_ITEM_TYPES.length ? 1 : 0) +
    testFilters.size;

  if (!isOpen) {
    return (
      <button type="button" className="filter-toggle" onClick={() => setIsOpen(true)} title="Visa filter">
        <FilterIcon />
        <span>Filter</span>
        {activeFilterCount > 0 && <span className="filter-toggle__badge">{activeFilterCount}</span>}
      </button>
    );
  }

  return (
    <div className="filter-panel">
      <div className="filter-panel__row">
        <input
          type="text"
          className="filter-panel__search"
          placeholder="Sök på titel eller ID…"
          value={searchText}
          onChange={(e) => onSearchTextChange(e.target.value)}
        />
        <button type="button" className="filter-panel__collapse" onClick={() => setIsOpen(false)} title="Dölj filter">
          <FilterIcon />
        </button>
      </div>
      <FilterGroup
        label="Status"
        actions={
          statuses.length > 1 ? (
            <span className="filter-panel__quick-actions">
              <button type="button" onClick={onSelectAll}>
                Alla
              </button>
              <button type="button" onClick={onSelectNone}>
                Ingen
              </button>
            </span>
          ) : null
        }
      >
        {statuses.map((status) => (
          <button
            key={status}
            type="button"
            className={"status-pill" + (selectedStatuses.has(status) ? " status-pill--active" : "")}
            onClick={() => onToggleStatus(status)}
          >
            {status}
          </button>
        ))}
      </FilterGroup>

      <FilterGroup label="Korttyp">
        {WORK_ITEM_TYPES.map((t) => (
          <button
            key={t.key}
            type="button"
            className={"status-pill" + (selectedTypes.has(t.key) ? " status-pill--active" : "")}
            onClick={() => onToggleType(t.key)}
          >
            {t.label}
          </button>
        ))}
      </FilterGroup>

      <FilterGroup label="Tester" hint="Kort med testkort som…">
        {(Object.keys(TEST_FILTER_LABELS) as TestFilterKey[]).map((key) => (
          <button
            key={key}
            type="button"
            className={"status-pill" + (testFilters.has(key) ? " status-pill--active" : "")}
            onClick={() => onToggleTestFilter(key)}
          >
            {TEST_FILTER_LABELS[key]}
          </button>
        ))}
      </FilterGroup>

      <FilterGroup label="Stängda kort">
        <label className="filter-panel__stale">
          <input type="checkbox" checked={hideStaleClosed} onChange={onToggleStaleClosed} />
          <span>
            Dölj kort stängda mer än {CLOSED_STALE_WORKING_DAYS} arbetsdagar
            {staleClosedCount > 0 && <span className="filter-panel__stale-count"> ({staleClosedCount} st)</span>}
          </span>
        </label>
      </FilterGroup>

      {tags.length > 0 && (
        <FilterGroup
          label="Taggar"
          hint="Klicka: tänd (måste finnas) → släckt (får ej finnas) → av"
          actions={
            tagFilters.size > 0 ? (
              <button type="button" className="filter-panel__group-clear" onClick={onClearTags}>
                Rensa taggar
              </button>
            ) : null
          }
        >
          {tags.map((tag) => {
            const state = tagFilters.get(tag);
            const cls =
              state === "include"
                ? "tag-pill tag-pill--include"
                : state === "exclude"
                  ? "tag-pill tag-pill--exclude"
                  : "tag-pill";
            return (
              <button key={tag} type="button" className={cls} onClick={() => onCycleTag(tag)}>
                {state === "include" && "+ "}
                {state === "exclude" && "− "}
                {tag}
              </button>
            );
          })}
        </FilterGroup>
      )}
    </div>
  );
}

/** One labelled block of filter controls, so every group reads the same way. */
function FilterGroup({
  label,
  hint,
  actions,
  children,
}: {
  label: string;
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="filter-panel__group">
      <div className="filter-panel__group-head">
        <span className="filter-panel__group-label">{label}</span>
        {hint && <span className="filter-panel__group-hint">{hint}</span>}
        {actions}
      </div>
      <div className="filter-panel__group-body">{children}</div>
    </div>
  );
}
