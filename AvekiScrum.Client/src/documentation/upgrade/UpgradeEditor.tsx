import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  cancelUpgradeCheckout,
  downloadUpgradeDocument,
  fetchUpgradeCheckout,
  importUpgradeDocument,
  resolveUpgradeConflicts,
  saveUpgradeSection,
  setUpgradeSectionCompleted,
  submitUpgradeCheckout,
  type UpgradeCheckoutDetail,
  type UpgradeConflict,
  type UpgradeImportResult,
  type UpgradeSection,
} from "../../api/upgrade";
import { useToast } from "../../components/Toast";
import { confirmDialog } from "../../components/ConfirmDialog";
import { LoadingOverlay } from "../../components/LoadingOverlay";
import { WikiMarkdown } from "./WikiMarkdown";
import { ConflictResolver } from "./ConflictResolver";
import { STATUS_LABEL, formatDateTime } from "./upgradeLabels";

interface UpgradeEditorProps {
  checkoutId: string;
  /** Pre-loaded right after "Skapa", to skip one round trip. */
  initial?: UpgradeCheckoutDetail;
  onBack: () => void;
}

/**
 * One customer's upgrade document: every selected wiki page in work order, each editable on its own.
 * A save is a commit on the checkout's own branch, so nothing reaches the wiki until "För in i
 * wikin" - and if the wiki changed in the same place meanwhile, ConflictResolver takes over.
 */
export function UpgradeEditor({ checkoutId, initial, onBack }: UpgradeEditorProps) {
  const { showToast } = useToast();
  const [detail, setDetail] = useState<UpgradeCheckoutDetail | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(initial ? null : "Öppnar uppgraderingen…");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [conflicts, setConflicts] = useState<UpgradeConflict[]>(initial?.conflicts ?? []);
  const [importResult, setImportResult] = useState<UpgradeImportResult | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState<number | null>(null);

  async function reload() {
    const fresh = await fetchUpgradeCheckout(checkoutId);
    setDetail(fresh);
    setConflicts(fresh.conflicts);
    return fresh;
  }

  useEffect(() => {
    if (initial) return;
    reload()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutId]);

  const status = detail?.summary.status;
  const editable = status === "Active" || status === "Conflict";
  const sections = useMemo(() => detail?.sections ?? [], [detail]);
  const changedCount = sections.filter((s) => s.changed).length;
  const wikiChangedCount = sections.filter((s) => s.wikiChanged).length;
  // Checklistan gäller hela uppgraderingen, även efter att wikin är uppdaterad - inte för avbrutna.
  const canTick = !!status && status !== "Cancelled";
  const completedCount = sections.filter((s) => s.completed).length;
  const editingSection = sections.find((s) => s.id === editingId) ?? null;
  const dirty = editingSection !== null && draft !== editingSection.content;

  const grouped = useMemo(() => {
    const groups: { release: string; sections: UpgradeSection[] }[] = [];
    for (const s of sections) {
      const last = groups[groups.length - 1];
      if (last && last.release === s.release) last.sections.push(s);
      else groups.push({ release: s.release, sections: [s] });
    }
    return groups;
  }, [sections]);

  // Leaving with an unsaved edit would silently lose it.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  async function confirmDiscard(): Promise<boolean> {
    return (
      !dirty ||
      (await confirmDialog({
        title: "Kasta osparade ändringar?",
        message: "Du har ändringar i sektionen som inte är sparade.",
        confirmText: "Kasta ändringarna",
        cancelText: "Fortsätt redigera",
        danger: true,
      }))
    );
  }

  async function startEdit(section: UpgradeSection) {
    if (!(await confirmDiscard())) return;
    setEditingId(section.id);
    setDraft(section.content);
  }

  async function saveEdit() {
    if (!detail || !editingSection) return;
    setBusy("Sparar…");
    try {
      const result = await saveUpgradeSection(detail.summary.id, {
        sectionId: editingSection.id,
        content: draft,
        expectedHead: detail.headCommit,
      });
      await reload();
      setEditingId(null);
      showToast(result.changed ? `${editingSection.title} sparad.` : "Inga ändringar att spara.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusy(null);
    }
  }

  async function onDownload() {
    if (!detail) return;
    if (
      dirty &&
      !(await confirmDialog({
        title: "Ladda ner ändå?",
        message: "Den osparade ändringen i sektionen du redigerar kommer inte med i filen.",
        confirmText: "Ladda ner",
      }))
    )
      return;
    try {
      await downloadUpgradeDocument(detail.summary.id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    }
  }

  async function onUpload(file: File) {
    if (!detail) return;
    setBusy("Läser in filen…");
    try {
      const result = await importUpgradeDocument(detail.summary.id, await file.text());
      setImportResult(result);
      if (result.ok) {
        await reload();
        setEditingId(null);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function onSubmit() {
    if (!detail || !(await confirmDiscard())) return;
    const confirmed =
      changedCount === 0
        ? await confirmDialog({
            title: "Avsluta utan ändringar?",
            message: "Du har inte ändrat något. Uppgraderingen avslutas och wikin lämnas orörd.",
            confirmText: "Avsluta",
          })
        : await confirmDialog({
            title: "Uppdatera wikin?",
            message: `Ändringarna på ${changedCount} ${changedCount === 1 ? "sida" : "sidor"} förs in i wikin och blir synliga för alla.`,
            confirmText: "Uppdatera wikin",
          });
    if (!confirmed) return;
    setBusy("För in i wikin…");
    try {
      const result = await submitUpgradeCheckout(detail.summary.id);
      setEditingId(null);
      await reload();
      setConflicts(result.conflicts);
      showToast(result.message, result.status === "Conflict" ? "error" : "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusy(null);
    }
  }

  async function onResolve(resolutions: { conflictId: number; content: string }[]) {
    if (!detail) return;
    setBusy("Slår ihop och för in i wikin…");
    try {
      const result = await resolveUpgradeConflicts(detail.summary.id, resolutions);
      await reload();
      setConflicts(result.conflicts);
      showToast(result.message, result.status === "Conflict" ? "error" : "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusy(null);
    }
  }

  async function onCancelCheckout() {
    if (!detail) return;
    if (
      !(await confirmDialog({
        title: "Avbryta uppgraderingen?",
        message: "Ändringar som inte har förts in i wikin kastas. Det går inte att ångra.",
        confirmText: "Avbryt uppgraderingen",
        cancelText: "Fortsätt arbeta",
        danger: true,
      }))
    )
      return;
    setBusy("Avbryter…");
    try {
      await cancelUpgradeCheckout(detail.summary.id);
      await reload();
      setEditingId(null);
      showToast("Uppgraderingen är avbruten.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusy(null);
    }
  }

  // Dokumentet scrollar för sig självt: innehållsförteckning och sektioner får resten av fönstrets
  // höjd under rubriken, så att sidan i övrigt står still. Mäts om när något ovanför ändrar höjd
  // (importresultat, konfliktvy) eller fönstret ändrar storlek.
  useLayoutEffect(() => {
    const measure = () => {
      const body = bodyRef.current;
      if (!body) return;
      const top = body.getBoundingClientRect().top + window.scrollY;
      setBodyHeight(Math.max(420, window.innerHeight - top - 20));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [detail, importResult, conflicts.length, status]);

  async function onPause() {
    if (!(await confirmDiscard())) return;
    showToast("Uppgraderingen är pausad – fortsätt när du vill från översikten.");
    onBack();
  }

  // Checklistan: optimistisk - bocken syns direkt och backas bara om sparningen misslyckas.
  async function toggleCompleted(section: UpgradeSection) {
    if (!detail) return;
    const completed = !section.completed;
    const apply = (value: boolean) =>
      setDetail((d) => (d ? { ...d, sections: d.sections.map((x) => (x.id === section.id ? { ...x, completed: value } : x)) } : d));
    apply(completed);
    try {
      await setUpgradeSectionCompleted(detail.summary.id, section.id, completed);
    } catch (err) {
      apply(!completed);
      showToast(err instanceof Error ? err.message : String(err), "error");
    }
  }

  function scrollTo(id: string) {
    document.getElementById(`upg-sec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (error) {
    return (
      <div className="upg-editor">
        <button type="button" className="upg-back" onClick={onBack}>← Alla uppgraderingar</button>
        <p className="sup-error">{error}</p>
      </div>
    );
  }

  return (
    <div className="upg-editor">
      {busy && <LoadingOverlay message={busy} sub="Pratar med wikin" />}

      <button type="button" className="upg-back" onClick={() => void confirmDiscard().then((ok) => ok && onBack())}>
        ← Alla uppgraderingar
      </button>

      {detail && (
        <>
          <header className="upg-editor__head">
            <div>
              <h2 className="upg-editor__title">
                {detail.summary.customer} <span>– {detail.summary.product} {detail.summary.releases.join(" → ")}</span>
              </h2>
              <div className="upg-editor__meta">
                <span className={`upg-status upg-status--${detail.summary.status}`}>{STATUS_LABEL[detail.summary.status]}</span>
                Utcheckad {formatDateTime(detail.summary.createdAt)} av {detail.summary.createdByName} · {sections.length} sidor
                {editable && changedCount > 0 && <> · <strong>{changedCount} ändrade</strong></>}
                {canTick && (
                  <span className={"upg-progress" + (completedCount === sections.length ? " upg-progress--done" : "")}>
                    <span className="upg-progress__bar">
                      <span style={{ width: `${sections.length ? (completedCount * 100) / sections.length : 0}%` }} />
                    </span>
                    {completedCount} av {sections.length} klara
                  </span>
                )}
              </div>
            </div>
            <div className="upg-editor__actions">
              <button type="button" className="daily-flow__btn" onClick={() => void onDownload()} title="Hela dokumentet som en .md-fil – att följa offline eller redigera i valfri editor">
                ⬇ Ladda ner
              </button>
              {editable && (
                <>
                  <button type="button" className="daily-flow__btn" onClick={() => fileInputRef.current?.click()} title="Läs in en nedladdad och redigerad fil">
                    ⬆ Ladda upp
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".md,.txt,text/markdown,text/plain"
                    hidden
                    onChange={(e) => e.target.files?.[0] && void onUpload(e.target.files[0])}
                  />
                  <button
                    type="button"
                    className="daily-flow__btn"
                    onClick={() => void onPause()}
                    title="Spara läget och gå tillbaka till översikten – allt finns kvar när du öppnar uppgraderingen igen"
                  >
                    ⏸ Pausa
                  </button>
                  {status === "Active" && (
                    <button type="button" className="daily-flow__btn daily-flow__btn--primary" onClick={() => void onSubmit()}>
                      ✓ För in i wikin
                    </button>
                  )}
                  <button type="button" className="daily-flow__btn upg-danger" onClick={() => void onCancelCheckout()}>
                    Avbryt uppgradering
                  </button>
                </>
              )}
            </div>
          </header>

          {editable && wikiChangedCount > 0 && status === "Active" && (
            <div className="sup-dash__notice upg-notice">
              {wikiChangedCount === 1 ? "En sida" : `${wikiChangedCount} sidor`} har ändrats i wikin sedan du checkade ut (markerade med ↻).
              Ändringarna slås ihop med dina när du för in i wikin.
            </div>
          )}
          {!editable && (
            <div className="sup-dash__notice upg-notice">
              {status === "Merged" && "Wikin är uppdaterad med ändringarna. Dokumentet visas som det såg ut då – checklistan går fortfarande att bocka av."}
              {status === "ClosedUnchanged" && "Avslutad utan ändringar – wikin rördes inte."}
              {status === "Cancelled" && "Avbruten – ändringarna kastades. Dokumentet visas som det var vid utcheckningen."}
            </div>
          )}

          {importResult && (
            <div className={"upg-import" + (importResult.ok ? "" : " upg-import--error")}>
              <button type="button" className="upg-import__close" onClick={() => setImportResult(null)} aria-label="Stäng">×</button>
              {importResult.ok ? (
                <>
                  <strong>Filen är inläst.</strong>{" "}
                  {importResult.applied.length > 0 ? `Sparade: ${importResult.applied.join(", ")}.` : "Inga ändringar i filen."}
                  {importResult.skippedChangedSince.length > 0 && (
                    <div>
                      ⚠ Inte inlästa – ändrade här efter att filen laddades ner: {importResult.skippedChangedSince.join(", ")}. Gör ändringen
                      direkt här i stället, eller ladda ner en ny fil.
                    </div>
                  )}
                  {importResult.unknown.length > 0 && <div>Okända sidor i filen ignorerades: {importResult.unknown.join(", ")}.</div>}
                  {importResult.warnings.map((w) => (
                    <div key={w}>ℹ {w}</div>
                  ))}
                </>
              ) : (
                <>
                  <strong>Filen kunde inte läsas in – inget sparades.</strong>
                  <ul>
                    {importResult.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                  Rader som börjar med <code>&lt;!-- AVEKI</code> får inte ändras. Ladda ner en ny fil om den har gått sönder.
                </>
              )}
            </div>
          )}

          {status === "Conflict" && conflicts.length > 0 && (
            <ConflictResolver key={conflicts.map((c) => c.conflictId).join(",")} conflicts={conflicts} busy={busy !== null} onResolve={(r) => void onResolve(r)} />
          )}

          <div className="upg-editor__body" ref={bodyRef} style={bodyHeight ? { height: bodyHeight } : undefined}>
            <nav className="upg-toc" aria-label="Innehåll">
              {grouped.map((g) => (
                <div key={g.release} className="upg-toc__group">
                  <div className="upg-toc__release">{detail.summary.product} {g.release}</div>
                  {g.sections.map((s) => (
                    <button key={s.id} type="button" className={"upg-toc__item" + (s.id === editingId ? " upg-toc__item--active" : "")} onClick={() => scrollTo(s.id)}>
                      <span>{s.title}</span>
                      {s.completed && <span className="upg-toc__done" title="Klar">✓</span>}
                      {s.changed && editable && <span className="upg-dot upg-dot--changed" title="Ändrad av dig" />}
                      {s.wikiChanged && <span className="upg-wiki-changed" title="Ändrad i wikin sedan utcheckning">↻</span>}
                    </button>
                  ))}
                </div>
              ))}
              {detail.history.length > 0 && (
                <button type="button" className="upg-toc__history" onClick={() => setShowHistory((v) => !v)}>
                  {showHistory ? "Dölj historik" : `Historik (${detail.history.length})`}
                </button>
              )}
              {showHistory && (
                <ol className="upg-history">
                  {[...detail.history].reverse().map((h, i) => (
                    <li key={i}>
                      <span>{formatDateTime(h.at)} · {h.by}</span>
                      {h.text}
                    </li>
                  ))}
                </ol>
              )}
            </nav>

            <div className="upg-doc">
              {grouped.map((g) => (
                <div key={g.release}>
                  {grouped.length > 1 && <h2 className="upg-doc__release">Release {g.release}</h2>}
                  {g.sections.map((s) => (
                    <section
                      key={s.id}
                      id={`upg-sec-${s.id}`}
                      className={"upg-sec" + (s.id === editingId ? " upg-sec--editing" : "") + (s.completed && s.id !== editingId ? " upg-sec--done" : "")}
                    >
                      {s.completed && s.id !== editingId && (
                        <div className="upg-sec__done-mark" aria-hidden="true">
                          ✓
                        </div>
                      )}
                      <div className="upg-sec__head">
                        <h3 className="upg-sec__title">{s.title}</h3>
                        {s.appliesTo && <span className={"upg-applies" + (s.appliesTo.startsWith("Alla") ? " upg-applies--all" : "")}>{s.appliesTo}</span>}
                        {s.changed && editable && <span className="upg-badge upg-badge--changed">Ändrad</span>}
                        {s.wikiChanged && <span className="upg-badge upg-badge--wiki">↻ Ändrad i wikin</span>}
                        {editable && s.id !== editingId && (
                          <button type="button" className="upg-sec__edit" onClick={() => startEdit(s)}>
                            ✎ Redigera
                          </button>
                        )}
                      </div>

                      {s.id === editingId ? (
                        <div className="upg-editor__split">
                          <textarea
                            className="sup-input upg-editor__textarea"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                                e.preventDefault();
                                void saveEdit();
                              }
                            }}
                            spellCheck={false}
                            autoFocus
                          />
                          <div className="upg-editor__preview">
                            <div className="upg-editor__preview-label">Förhandsvisning</div>
                            <WikiMarkdown markdown={draft} />
                          </div>
                          <div className="upg-editor__buttons">
                            <span className="upg-editor__hint">Markdown, som i wikin. Ctrl+S sparar. Sparat syns bara i din uppgradering tills du för in i wikin.</span>
                            <button type="button" className="daily-flow__btn" onClick={() => void confirmDiscard().then((ok) => ok && setEditingId(null))}>
                              Avbryt
                            </button>
                            <button type="button" className="daily-flow__btn daily-flow__btn--primary" onClick={() => void saveEdit()} disabled={!dirty}>
                              Spara
                            </button>
                          </div>
                        </div>
                      ) : (
                        <WikiMarkdown markdown={s.content} />
                      )}

                      {canTick && s.id !== editingId && (
                        <div className="upg-sec__foot">
                          <button
                            type="button"
                            className={"upg-done-toggle" + (s.completed ? " upg-done-toggle--on" : "")}
                            onClick={() => void toggleCompleted(s)}
                            aria-pressed={s.completed}
                          >
                            <span className="upg-done-toggle__box" aria-hidden="true">{s.completed ? "✓" : ""}</span>
                            {s.completed ? "Klar – klicka för att ångra" : "Markera som klar"}
                          </button>
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
