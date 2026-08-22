import { useEffect, useMemo, useState } from "react";
import { RichTextEditor } from "../components/workitem/RichTextEditor";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { useToast } from "../components/Toast";
import { fetchAllPeople, type PersonOption } from "../api/people";
import {
  createSupportBug,
  fetchSupportOptions,
  type SupportOptions,
  type SupportStakeholder,
} from "../api/support";
import { StakeholderEditor } from "./StakeholderEditor";
import { loadReporter, reporterIsFromSignIn, saveReporter } from "./reporter";
import {
  composeReproSteps,
  EMPTY_REPRO_PARTS,
  hasEnoughDetail,
  REPRO_FIELDS,
  shortSeverity,
  type ReproStepsParts,
} from "./supportLogic";
import "./SupportViews.css";

interface NewBugFormProps {
  /** Called after a successful save, so the shell can offer to jump to the dashboard. */
  onCreated?: (id: number) => void;
}

/**
 * The whole point of AvekiSupport: file a usable bug report in a couple of minutes without
 * learning Azure DevOps. Everything that can be decided for the reporter is - it lands in the PO's
 * backlog, gets the support tag, and the stakeholder lines come out formatted the same every time.
 */
export function NewBugForm({ onCreated }: NewBugFormProps) {
  const { showToast } = useToast();
  const [options, setOptions] = useState<SupportOptions | null>(null);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: number; url: string } | null>(null);

  const [reporter, setReporter] = useState(loadReporter);
  const [title, setTitle] = useState("");
  const [parts, setParts] = useState<ReproStepsParts>(EMPTY_REPRO_PARTS);
  const [severity, setSeverity] = useState("");
  const [source, setSource] = useState("");
  const [systemInfo, setSystemInfo] = useState("");
  const [areaPath, setAreaPath] = useState("");
  const [externalLink, setExternalLink] = useState("");
  const [stakeholders, setStakeholders] = useState<SupportStakeholder[]>([]);
  // When someone is signed in the name isn't theirs to change - it's the same identity Azure will
  // record as the card's creator, and the two must not be able to disagree.
  const signedIn = reporterIsFromSignIn();

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([fetchSupportOptions(controller.signal), fetchAllPeople(controller.signal).catch(() => [])])
      .then(([supportOptions, allPeople]) => {
        setOptions(supportOptions);
        setPeople(allPeople);
        setSeverity(supportOptions.defaultSeverity);
        setSource(supportOptions.defaultSource);
        setAreaPath(supportOptions.defaultAreaPath);
        setSystemInfo(supportOptions.systemInfoTemplate);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setLoadError(err instanceof Error ? err.message : "Något gick fel.");
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const reporterLine = useMemo<SupportStakeholder | null>(
    () => (reporter.trim() ? { category: "Buggrapportör", name: reporter.trim(), note: null } : null),
    [reporter],
  );

  const canSubmit = title.trim().length > 0 && hasEnoughDetail(parts) && !!reporterLine && !saving;

  async function submit() {
    if (!reporterLine || !options) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await createSupportBug({
        title: title.trim(),
        reproSteps: composeReproSteps(parts),
        severity,
        source,
        systemInfo,
        // The reporter always goes first - it's the line the dashboard reads back to decide
        // whose case this is.
        stakeholders: [reporterLine, ...stakeholders],
        areaPath,
        externalLink,
      });
      if (!signedIn) saveReporter(reporter);
      setCreated(result);
      showToast(`Ärende #${result.id} skapat.`, "success");
      onCreated?.(result.id);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Kunde inte skapa ärendet.");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setCreated(null);
    setTitle("");
    setParts(EMPTY_REPRO_PARTS);
    setStakeholders([]);
    setExternalLink("");
    if (options) {
      setSeverity(options.defaultSeverity);
      setSource(options.defaultSource);
      setSystemInfo(options.systemInfoTemplate);
      setAreaPath(options.defaultAreaPath);
    }
  }

  if (loading) return <LoadingOverlay message="Hämtar formuläret…" />;
  if (loadError) return <p className="sup-error">Fel: {loadError}</p>;

  if (created) {
    return (
      <div className="sup-created">
        <span className="sup-created__icon" aria-hidden="true">
          ✅
        </span>
        <h2>Tack – ärendet är skickat</h2>
        <p>
          Det ligger nu i produktägarens backlogg som <strong>#{created.id}</strong>. Du kan följa det under
          “Mina ärenden”.
        </p>
        <div className="sup-created__actions">
          <button type="button" className="wi-btn wi-btn--primary" onClick={reset}>
            Rapportera ett till
          </button>
          <a className="wi-btn" href={created.url} target="_blank" rel="noreferrer">
            Öppna i Azure DevOps
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="sup-form">
      {saving && <LoadingOverlay message="Skapar ärendet…" sub="Skickar till Azure DevOps" />}

      <section className="sup-card">
        <h2 className="sup-card__title">Vem rapporterar?</h2>
        <p className="sup-card__hint">
          {signedIn
            ? "Hämtat från din inloggning. Kortet skapas i ditt namn i Azure DevOps."
            : "Ditt namn följer med på kortet så teamet vet vem de ska fråga. Vi kommer ihåg det till nästa gång."}
        </p>
        <input
          className="sup-input sup-input--wide"
          value={reporter}
          onChange={(e) => setReporter(e.target.value)}
          placeholder="Ditt namn"
          list={signedIn ? undefined : "sup-people-reporter"}
          aria-label="Ditt namn"
          readOnly={signedIn}
        />
        <datalist id="sup-people-reporter">
          {people.map((person) => (
            <option key={person.email} value={person.displayName} />
          ))}
        </datalist>
      </section>

      <section className="sup-card">
        <h2 className="sup-card__title">Vad handlar det om?</h2>
        <label className="sup-label" htmlFor="sup-title">
          Rubrik
        </label>
        <input
          id="sup-title"
          className="sup-input sup-input--wide"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Kort och konkret – det är det här teamet ser i listan"
        />

        <div className="sup-grid">
          <div className="sup-field">
            <label className="sup-label" htmlFor="sup-severity">
              Allvarlighetsgrad
            </label>
            <select id="sup-severity" className="sup-input" value={severity} onChange={(e) => setSeverity(e.target.value)}>
              {options?.severities.map((option) => (
                <option key={option} value={option}>
                  {shortSeverity(option)}
                </option>
              ))}
            </select>
          </div>
          <div className="sup-field">
            <label className="sup-label" htmlFor="sup-source">
              Källa
            </label>
            <select id="sup-source" className="sup-input" value={source} onChange={(e) => setSource(e.target.value)}>
              {options?.sources.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="sup-field sup-field--wide">
            <label className="sup-label" htmlFor="sup-area">
              Area Path
            </label>
            <select id="sup-area" className="sup-input" value={areaPath} onChange={(e) => setAreaPath(e.target.value)}>
              {options?.areas.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="sup-field sup-field--wide">
            <label className="sup-label" htmlFor="sup-lime">
              Länk till Lime-ärendet
            </label>
            <input
              id="sup-lime"
              className="sup-input"
              value={externalLink}
              onChange={(e) => setExternalLink(e.target.value)}
              placeholder="https://lime.aveki.se/client/object/helpdesk/… eller limecrm://…"
            />
            <p className="sup-repro__hint">
              Klistra in länken från Lime. Den är också vad som gör att ärendet dyker upp under “Mina
              ärenden” – även för buggar som skapats direkt i Azure.
            </p>
          </div>
        </div>
      </section>

      <section className="sup-card">
        <h2 className="sup-card__title">Beskriv buggen</h2>
        <p className="sup-card__hint">
          Fälten blir tillsammans kortets “Repro Steps”, i samma ordning varje gång. Fyll i det du vet – allt
          måste inte vara ifyllt.
        </p>
        {REPRO_FIELDS.map((field) => (
          <div className="sup-repro" key={field.key}>
            <label className="sup-label">{field.heading}</label>
            {field.hint && <p className="sup-repro__hint">{field.hint}</p>}
            <RichTextEditor
              value={parts[field.key]}
              onChange={(value) => setParts((prev) => ({ ...prev, [field.key]: value }))}
              minRows={field.rows}
              placeholder={field.placeholder}
            />
          </div>
        ))}
      </section>

      <section className="sup-card">
        <h2 className="sup-card__title">System Info</h2>
        <p className="sup-card__hint">Förifylld mall – skriv över med det som gäller för det här ärendet.</p>
        <textarea
          className="sup-input sup-textarea"
          rows={6}
          value={systemInfo}
          onChange={(e) => setSystemInfo(e.target.value)}
          aria-label="System Info"
        />
      </section>

      <section className="sup-card">
        <h2 className="sup-card__title">Berörda</h2>
        <p className="sup-card__hint">
          Lägg till en i taget – kunder, interna och support. De skrivs alltid på samma sätt på kortet.
        </p>
        <StakeholderEditor
          categories={options?.stakeholderCategories ?? []}
          reporterLine={reporterLine}
          value={stakeholders}
          onChange={setStakeholders}
          people={people}
        />
      </section>

      {saveError && <p className="sup-error">{saveError}</p>}

      <div className="sup-actions">
        <span className="sup-actions__hint">
          {!reporterLine
            ? "Fyll i ditt namn högst upp."
            : !title.trim()
              ? "Ärendet behöver en rubrik."
              : !hasEnoughDetail(parts)
                ? "Skriv åtminstone en kort beskrivning eller steg för att återskapa."
                : "Ärendet hamnar i produktägarens backlogg."}
        </span>
        <button type="button" className="wi-btn wi-btn--primary sup-submit" disabled={!canSubmit} onClick={() => void submit()}>
          Skicka ärendet
        </button>
      </div>
    </div>
  );
}
