import { useEffect, useState } from "react";
import { updateWorkItemFields, type WorkItemDetail } from "../../api/workitems";
import { fetchAllPeople, type PersonOption } from "../../api/people";
import { RichTextEditor } from "./RichTextEditor";
import { Section } from "./Section";
import "./WorkItemSakkunnigFeatureTab.css";

interface WorkItemSakkunnigFeatureTabProps {
  detail: WorkItemDetail;
  onChanged: (detail: WorkItemDetail) => void;
}

/** A select that keeps whatever value the card already holds even if it isn't (yet) in the people
 *  list - same reasoning as WorkItemOverviewTab's own PickList. */
function CandidateSelect({ value, people, onChange }: { value: string; people: PersonOption[]; onChange: (v: string) => void }) {
  const options = value && !people.some((p) => p.displayName === value) ? [value, ...people.map((p) => p.displayName)] : people.map((p) => p.displayName);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">– ingen –</option>
      {options.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}

/**
 * Feature-fliken där de tre Sakkunnig-kandidaterna föreslås, plus fritext-kontext som kopieras
 * vidare till User Storyn den dagen någon utser en sakkunnig - se WorkItemSakkunnigStoryTab och
 * AppointSakkunnigModal på Story-sidan av samma flöde.
 *
 * Egen redigering/Spara istället för det stora Översikt-formuläret: de här fälten ändras sällan
 * och av en annan roll (den som äger Featuren) än resten av kortets fält.
 */
export function WorkItemSakkunnigFeatureTab({ detail, onChanged }: WorkItemSakkunnigFeatureTabProps) {
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [kandidat1, setKandidat1] = useState(detail.kandidat1 ?? "");
  const [kandidat2, setKandidat2] = useState(detail.kandidat2 ?? "");
  const [kandidat3, setKandidat3] = useState(detail.kandidat3 ?? "");
  const [info, setInfo] = useState(detail.sakkunnigInfoHtml);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAllPeople()
      .then(setPeople)
      .catch(() => setPeople([]));
  }, []);

  const dirty =
    kandidat1 !== (detail.kandidat1 ?? "") ||
    kandidat2 !== (detail.kandidat2 ?? "") ||
    kandidat3 !== (detail.kandidat3 ?? "") ||
    info !== detail.sakkunnigInfoHtml;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateWorkItemFields(detail.id, {
        kandidat1,
        kandidat2,
        kandidat3,
        sakkunnigInfo: info,
      });
      onChanged(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara kandidaterna.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="sk-feature-tab">
      <Section title="Sakkunnig-kandidater" hint="föreslagna namn för User Stories under den här Featuren">
        <div className="sk-candidates">
          <label className="sk-candidates__field">
            <span>Kandidat 1</span>
            <CandidateSelect value={kandidat1} people={people} onChange={setKandidat1} />
          </label>
          <label className="sk-candidates__field">
            <span>Kandidat 2</span>
            <CandidateSelect value={kandidat2} people={people} onChange={setKandidat2} />
          </label>
          <label className="sk-candidates__field">
            <span>Kandidat 3</span>
            <CandidateSelect value={kandidat3} people={people} onChange={setKandidat3} />
          </label>
        </div>

        <div className="sk-info">
          <label className="sk-info__label">Info till den som utser sakkunnig</label>
          <RichTextEditor
            minRows={5}
            value={info}
            onChange={setInfo}
            placeholder="Kontext, avgränsning, vad den sakkunniga förväntas bidra med…"
          />
        </div>

        {error && <p className="wi-modal__status wi-modal__status--error">{error}</p>}

        <div className="sk-submit">
          <button type="button" className="wi-btn wi-btn--primary" onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? "Sparar…" : "Spara"}
          </button>
        </div>
      </Section>
    </div>
  );
}
