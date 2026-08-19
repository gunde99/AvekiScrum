import { useState } from "react";
import "./FilterPanel.css";

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
}: FilterPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const activeFilterCount =
    (searchText.trim() ? 1 : 0) + (selectedStatuses.size < statuses.length ? 1 : 0) + tagFilters.size;

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
      <div className="filter-panel__statuses">
        {statuses.map((status) => {
          const active = selectedStatuses.has(status);
          return (
            <button
              key={status}
              type="button"
              className={"status-pill" + (active ? " status-pill--active" : "")}
              onClick={() => onToggleStatus(status)}
            >
              {status}
            </button>
          );
        })}
        {statuses.length > 1 && (
          <span className="filter-panel__quick-actions">
            <button type="button" onClick={onSelectAll}>
              Alla
            </button>
            <button type="button" onClick={onSelectNone}>
              Ingen
            </button>
          </span>
        )}
      </div>

      {tags.length > 0 && (
        <div className="filter-panel__tags">
          <div className="filter-panel__tags-head">
            <span className="filter-panel__tags-label">Taggar</span>
            <span className="filter-panel__tags-hint">Klicka: tänd (måste finnas) → släckt (får ej finnas) → av</span>
            {tagFilters.size > 0 && (
              <button type="button" className="filter-panel__tags-clear" onClick={onClearTags}>
                Rensa taggar
              </button>
            )}
          </div>
          <div className="filter-panel__tags-list">
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
          </div>
        </div>
      )}
    </div>
  );
}
