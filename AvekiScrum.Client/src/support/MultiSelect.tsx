import { useEffect, useRef, useState } from "react";

interface MultiSelectProps {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Shortens each option for display; the full value is still what's filtered on. */
  format?: (option: string) => string;
  emptyLabel?: string;
}

/**
 * A dropdown of checkboxes. Used where a filter is a combination rather than one choice - several
 * area paths at once, a couple of releases - which a plain <select multiple> makes needlessly hard
 * to operate with a mouse.
 */
export function MultiSelect({ label, options, selected, onChange, format, emptyLabel = "Alla" }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const shown = query.trim()
    ? options.filter((option) => option.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  function toggle(option: string) {
    const next = new Set(selected);
    if (next.has(option)) next.delete(option);
    else next.add(option);
    onChange(next);
  }

  return (
    <div className="sup-ms" ref={rootRef}>
      <button type="button" className={"sup-ms__button" + (selected.size > 0 ? " sup-ms__button--active" : "")} onClick={() => setOpen((v) => !v)}>
        <span className="sup-ms__label">{label}</span>
        <span className="sup-ms__value">{selected.size === 0 ? emptyLabel : `${selected.size} valda`}</span>
        <span aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="sup-ms__menu">
          {options.length > 8 && (
            <input
              className="sup-input sup-ms__search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrera…"
              autoFocus
            />
          )}
          <div className="sup-ms__options">
            {shown.length === 0 && <p className="sup-ms__empty">Inget att välja.</p>}
            {shown.map((option) => (
              <label className="sup-ms__option" key={option}>
                <input type="checkbox" checked={selected.has(option)} onChange={() => toggle(option)} />
                <span>{format ? format(option) : option}</span>
              </label>
            ))}
          </div>
          {selected.size > 0 && (
            <button type="button" className="sup-ms__clear" onClick={() => onChange(new Set())}>
              Rensa
            </button>
          )}
        </div>
      )}
    </div>
  );
}
