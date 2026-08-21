import { useState } from "react";
import { MultiSelect } from "./MultiSelect";
import { activeFilterCount, shortAreaPath, SUPPORT_STATUSES, type SupportFilters } from "./supportLogic";
import "../boards/dailys/FilterPanel.css";

function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M1.5 2.5h13L9.5 8.2V13l-3 1.5V8.2L1.5 2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

interface SupportFilterPanelProps {
  filters: SupportFilters;
  onChange: (next: SupportFilters) => void;
  /** Values actually present in the loaded bugs - no point offering a version nobody used. */
  versions: string[];
  areas: string[];
  consultants: string[];
  customers: string[];
  /** Date range, which unlike the rest is a server parameter and refetches when changed. */
  range: { from: string; to: string };
  onRangeChange: (next: { from: string; to: string }) => void;
}

/**
 * Every filter behind one button, the same way the Dailys board does it. The dashboard's default
 * state is "everything support has reported", and that is what most visits want - the filters are
 * for the times it isn't, and they shouldn't take up the screen until then.
 */
export function SupportFilterPanel({
  filters,
  onChange,
  versions,
  areas,
  consultants,
  customers,
  range,
  onRangeChange,
}: SupportFilterPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const count = activeFilterCount(filters);

  function toggleIn(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  if (!isOpen) {
    return (
      <button type="button" className="filter-toggle" onClick={() => setIsOpen(true)} title="Visa filter">
        <FilterIcon />
        <span>Filter</span>
        {count > 0 && <span className="filter-toggle__badge">{count}</span>}
      </button>
    );
  }

  return (
    <div className="filter-panel sup-filterpanel">
      <div className="filter-panel__row">
        <input
          type="text"
          className="filter-panel__search"
          placeholder="Sök på rubrik, id, kund, konsult eller tagg…"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />
        <button type="button" className="filter-panel__collapse" onClick={() => setIsOpen(false)} title="Dölj filter">
          <FilterIcon />
        </button>
      </div>

      <div className="filter-panel__group">
        <span className="filter-panel__group-label">Status</span>
        <div className="filter-panel__statuses">
          {SUPPORT_STATUSES.map((status) => (
            <button
              key={status.key}
              type="button"
              // Keeps the board's own colour for each state rather than the generic pill accent -
              // "Under arbete" is orange everywhere or it isn't a signal at all.
              className={
                `status-pill sup-pill sup-pill--${status.key}` +
                (filters.statuses.has(status.key) ? " sup-pill--active" : "")
              }
              onClick={() => onChange({ ...filters, statuses: toggleIn(filters.statuses, status.key) })}
              title={status.hint}
            >
              {status.label}
            </button>
          ))}
        </div>
      </div>

      {versions.length > 0 && (
        <div className="filter-panel__group">
          <span className="filter-panel__group-label">Version</span>
          <div className="filter-panel__statuses">
            {versions.map((version) => (
              <button
                key={version}
                type="button"
                className={"status-pill" + (filters.versions.has(version) ? " status-pill--active" : "")}
                onClick={() => onChange({ ...filters, versions: toggleIn(filters.versions, version) })}
              >
                {version}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="filter-panel__group">
        <span className="filter-panel__group-label">Urval</span>
        <div className="sup-filterpanel__selects">
          <MultiSelect
            label="Area Path"
            options={areas}
            selected={filters.areas}
            onChange={(areasNext) => onChange({ ...filters, areas: areasNext })}
            format={shortAreaPath}
          />
          <MultiSelect
            label="Konsult"
            options={consultants}
            selected={filters.consultants}
            onChange={(consultantsNext) => onChange({ ...filters, consultants: consultantsNext })}
          />
          <MultiSelect
            label="Kund"
            options={customers}
            selected={filters.customers}
            onChange={(customersNext) => onChange({ ...filters, customers: customersNext })}
          />
        </div>
      </div>

      <div className="filter-panel__group">
        <span className="filter-panel__group-label">Skapade</span>
        <div className="sup-filterpanel__dates">
          <label>
            <span>från</span>
            <input
              className="sup-input"
              type="date"
              value={range.from}
              max={range.to}
              onChange={(e) => onRangeChange({ ...range, from: e.target.value })}
            />
          </label>
          <label>
            <span>till</span>
            <input
              className="sup-input"
              type="date"
              value={range.to}
              min={range.from}
              onChange={(e) => onRangeChange({ ...range, to: e.target.value })}
            />
          </label>
          <span className="sup-filterpanel__datehint">Hämtar om listan från Azure DevOps.</span>
        </div>
      </div>

      {count > 0 && (
        <button
          type="button"
          className="filter-panel__group-clear sup-filterpanel__clear"
          onClick={() =>
            onChange({
              search: "",
              statuses: new Set(),
              versions: new Set(),
              areas: new Set(),
              consultants: new Set(),
              customers: new Set(),
            })
          }
        >
          Rensa alla filter ({count})
        </button>
      )}
    </div>
  );
}
