import { useEffect, useMemo, useState } from "react";
import { fetchAllPeople, type PersonOption } from "../../api/people";
import { createSakkunnigStory, fetchWorkItemDetail, type WorkItemDetail } from "../../api/workitems";
import { ConfirmDialog } from "./ConfirmDialog";
import { RichTextEditor } from "./RichTextEditor";
import { Section } from "./Section";
import "./WorkItemModal.css";
import "./AppointSakkunnigModal.css";

/** Fixed - not something a user types in, so the backend's Activity mapping (see
 *  CreateSakkunnigStory in Program.cs) can stay a plain switch on the title. */
const CHECKLIST_TASKS = ["Acceptanstester", "Hjälptextkort", "Script vid nyinstallation"];

interface AppointSakkunnigModalProps {
  detail: WorkItemDetail;
  onClose: () => void;
  /** Handed the source Story's own reloaded detail (its `related` list now includes the new
   *  Sakkunnig card), so the tab can flip to the "already appointed" state without a second fetch. */
  onCreated: (detail: WorkItemDetail) => void;
}

/**
 * "Utse Sakkunnig": picks a person (the Feature's three candidates first, everyone else below),
 * shows the Feature's own Sakkunnig-info as editable context, and on Spara creates the
 * Sakkunnig_-prefixed User Story with that text copied into its Description plus one Task per
 * checked checklist item. See WorkItemSakkunnigStoryTab for the other half of this flow (the
 * button/summary state).
 *
 * Deliberately not dismissible by clicking the backdrop, same reasoning as ConfirmDialog - a card
 * this specific (it writes a whole new work item) shouldn't be lost to a stray click. Closing any
 * other way (✕, Escape, Avbryt) asks first once anything has actually been touched.
 */
export function AppointSakkunnigModal({ detail, onClose, onCreated }: AppointSakkunnigModalProps) {
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [feature, setFeature] = useState<WorkItemDetail | null>(null);
  const [loadingFeature, setLoadingFeature] = useState(false);
  const [selected, setSelected] = useState("");
  // Seeded from the Feature once it loads, then freely editable - "kommer sparas på User Storyn"
  // describes where it ends up, not that it has to go unchanged.
  const [info, setInfo] = useState("");
  const [infoSeed, setInfoSeed] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    fetchAllPeople()
      .then(setPeople)
      .catch(() => setPeople([]));
  }, []);

  // Candidates live on the Story's own Feature parent - a Story without one just falls back to
  // "everyone" below, no separate candidate group, and the info box starts empty.
  useEffect(() => {
    if (detail.parent?.type !== "Feature") return;
    const controller = new AbortController();
    setLoadingFeature(true);
    fetchWorkItemDetail(detail.parent.id, controller.signal)
      .then((f) => {
        setFeature(f);
        setInfo(f.sakkunnigInfoHtml);
        setInfoSeed(f.sakkunnigInfoHtml);
        setLoadingFeature(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setLoadingFeature(false);
      });
    return () => controller.abort();
  }, [detail.parent]);

  const candidateNames = useMemo(
    () => [feature?.kandidat1, feature?.kandidat2, feature?.kandidat3].filter((n): n is string => !!n),
    [feature],
  );
  const others = useMemo(() => {
    const candidateSet = new Set(candidateNames);
    return people.filter((p) => !candidateSet.has(p.displayName));
  }, [people, candidateNames]);

  const dirty = selected !== "" || checked.size > 0 || info !== infoSeed;

  function requestClose() {
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        requestClose();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  function toggleTask(title: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await createSakkunnigStory(detail.id, {
        assignedTo: selected,
        infoHtml: info,
        taskTitles: [...checked],
      });
      onCreated(await fetchWorkItemDetail(detail.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte utse sakkunnig.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* No click-to-dismiss - see the component doc comment. */}
      <div className="wi-modal-overlay">
        <div className="wi-modal sk-appoint-modal" onClick={(e) => e.stopPropagation()}>
          <header className="wi-modal__header">
            <div className="wi-modal__title-block">
              <div className="wi-modal__title-text">Utse Sakkunnig</div>
              <div className="wi-modal__subline">
                <span className="wi-modal__iteration">Skapar en ny User Story kopplad till #{detail.id}</span>
              </div>
            </div>
            <button type="button" className="wi-modal__close" onClick={requestClose} aria-label="Stäng">
              ✕
            </button>
          </header>

          <div className="wi-modal__body">
            <Section title="Sakkunnig">
              <label className="sk-modal__field">
                <span>Person</span>
                <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                  <option value="">– välj –</option>
                  {candidateNames.length > 0 && (
                    <optgroup label="Kandidater från Featuren">
                      {candidateNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Övriga medarbetare">
                    {others.map((p) => (
                      <option key={p.email} value={p.displayName}>
                        {p.displayName}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>

              <div className="sk-modal__info">
                {loadingFeature ? (
                  <p className="sk-modal__loading">Hämtar…</p>
                ) : (
                  <RichTextEditor minRows={4} value={info} onChange={setInfo} placeholder="Ingen info angiven på Featuren." />
                )}
                <p className="sk-modal__info-hint">Kopierat från Featuren - kommer sparas på User Storyn.</p>
              </div>
            </Section>

            <Section title="Skapa Tasks för:">
              <div className="sk-modal__checklist">
                {CHECKLIST_TASKS.map((title) => (
                  <label key={title} className="sk-modal__checklist-item">
                    <input type="checkbox" checked={checked.has(title)} onChange={() => toggleTask(title)} />
                    {title}
                  </label>
                ))}
              </div>
            </Section>

            {error && <p className="wi-modal__status wi-modal__status--error">{error}</p>}
          </div>

          <footer className="wi-modal__footer">
            <span className="wi-modal__footer-spacer" />
            <button type="button" className="wi-btn" onClick={requestClose} disabled={saving}>
              Avbryt
            </button>
            <button type="button" className="wi-btn wi-btn--primary" onClick={() => void save()} disabled={saving || !selected}>
              {saving ? "Sparar…" : "Spara"}
            </button>
          </footer>
        </div>
      </div>

      {confirmClose && (
        <ConfirmDialog
          title="Osparade ändringar"
          message="Du har börjat utse en sakkunnig men inte sparat. Stänger du nu går det förlorat."
          confirmLabel="Stäng utan att spara"
          cancelLabel="Fortsätt"
          danger
          onConfirm={onClose}
          onCancel={() => setConfirmClose(false)}
        />
      )}
    </>
  );
}
