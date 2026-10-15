import { useEffect, useMemo, useState } from "react";
import { PersonAvatar } from "../../components/PersonAvatar";
import { useToast } from "../../components/Toast";
import type { DeveloperTeamId } from "../../api/dailys";
import { fetchTeamRoles, type PersonOption } from "../../api/people";
import { addMeetingInfluencer, deleteMeetingInfluencer, fetchMeetingInfluencers, type MeetingInfluencerDto } from "../../api/teamCheckIn";
import { InfluencerSpinner } from "./InfluencerSpinner";
import {
  INFLUENCER_CATEGORIES,
  INFLUENCER_GROUND_RULE,
  buildReminderMailto,
  formatMeetingDate,
  nextMeetingIso,
  todayIso,
} from "./influencers";
import "./InfluencerLotteryPanel.css";

export interface InfluencerCandidate {
  email: string;
  displayName: string;
  /** Usually one team; team leaders sit on both rosters. */
  teams: DeveloperTeamId[];
}

type TeamFilter = "Alla" | DeveloperTeamId;

// Per-browser lottery preferences - who is left out (long leave, on loan, team leaders, ...). Only
// a convenience: the draws themselves are stored server-side.
const EXCLUDED_STORAGE_KEY = "aveki.teamcheckin.influencer.excluded";

function loadExcluded(): string[] | null {
  try {
    const raw = window.localStorage.getItem(EXCLUDED_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function saveExcluded(emails: string[]) {
  try {
    window.localStorage.setItem(EXCLUDED_STORAGE_KEY, JSON.stringify(emails));
  } catch {
    // Private window or blocked storage - the selection just won't survive a reload.
  }
}

const sameEmail = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function mergeRosters(nord: PersonOption[], syd: PersonOption[]): InfluencerCandidate[] {
  const byEmail = new Map<string, InfluencerCandidate>();
  const add = (people: PersonOption[], team: DeveloperTeamId) => {
    for (const p of people) {
      const key = p.email.toLowerCase();
      const existing = byEmail.get(key);
      if (existing) {
        if (!existing.teams.includes(team)) existing.teams.push(team);
      } else {
        byEmail.set(key, { email: p.email, displayName: p.displayName, teams: [team] });
      }
    }
  };
  add(nord, "Nord");
  add(syd, "Syd");
  return [...byEmail.values()].sort((a, b) => a.displayName.localeCompare(b.displayName, "sv"));
}

interface InfluencerLotteryPanelProps {
  /** Called whenever the saved influencers for a date change - lets the board update today's
   *  agenda point 2 if someone set the date to today. */
  onChanged?: (meetingDate: string, influencers: MeetingInfluencerDto[]) => void;
}

/**
 * Agenda step "Nästa veckas influencer", right before Övrigt: draw developers who bring a short,
 * freely chosen contribution to next week's meeting. Draw as many times as wanted, undo any of
 * them, then the ✉️ button mails everyone currently in the panel. Every draw is saved per meeting
 * date the moment it's accepted - so the meeting can move on to Övrigt and the mail go out
 * afterwards: reopening this step lands on the upcoming meeting that already has people drawn. On
 * that date they show up as agenda point 2 (TodaysInfluencersPanel).
 *
 * Fair rotation (on by default): only people with the fewest draws so far can win, so nobody gets a
 * second turn until everyone else has had one. The reel still shows the whole eligible group.
 */
export function InfluencerLotteryPanel({ onChanged }: InfluencerLotteryPanelProps) {
  const { showToast } = useToast();
  const [candidates, setCandidates] = useState<InfluencerCandidate[] | null>(null);
  const [history, setHistory] = useState<MeetingInfluencerDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [meetingDate, setMeetingDate] = useState(nextMeetingIso);
  const [editingDate, setEditingDate] = useState(false);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [teamFilter, setTeamFilter] = useState<TeamFilter>("Alla");
  const [fairRotation, setFairRotation] = useState(true);
  const [showParticipants, setShowParticipants] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetchTeamRoles("Nord", controller.signal),
      fetchTeamRoles("Syd", controller.signal),
      fetchMeetingInfluencers(undefined, controller.signal),
    ])
      .then(([nord, syd, all]) => {
        // The test lead (Mattias B) sits in on the meeting too, so is drawable alongside the developers.
        const withTestLead = (team: typeof nord) => (team.testLead ? [...team.developers, team.testLead] : team.developers);
        setCandidates(mergeRosters(withTestLead(nord), withTestLead(syd)));
        setHistory(all);
        // Seeded once per browser from the daily flow's own "usually not taking part" lists.
        const stored = loadExcluded();
        if (stored) {
          setExcluded(stored);
        } else {
          const seed = [...(nord.flowExcludedByDefault ?? []), ...(syd.flowExcludedByDefault ?? [])].map((p) => p.email);
          const unique = seed.filter((e, i) => seed.findIndex((x) => sameEmail(x, e)) === i);
          setExcluded(unique);
          saveExcluded(unique);
        }
        // Coming back to the panel later in the week: show the upcoming meeting that already has
        // people drawn, rather than an empty "today + 7".
        const today = todayIso();
        const upcoming = all.map((i) => i.meetingDate).filter((d) => d > today).sort();
        if (upcoming.length > 0) setMeetingDate(upcoming[0]);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => controller.abort();
  }, []);

  const panelPeople = useMemo(() => history.filter((i) => i.meetingDate === meetingDate), [history, meetingDate]);

  const drawCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of history) counts.set(i.email.toLowerCase(), (counts.get(i.email.toLowerCase()) ?? 0) + 1);
    return counts;
  }, [history]);

  const isExcluded = (email: string) => excluded.some((e) => sameEmail(e, email));

  const participants = useMemo(
    () => (candidates ?? []).filter((c) => !isExcluded(c.email)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidates, excluded],
  );

  const eligible = useMemo(
    () =>
      participants.filter(
        (c) => (teamFilter === "Alla" || c.teams.includes(teamFilter)) && !panelPeople.some((p) => sameEmail(p.email, c.email)),
      ),
    [participants, teamFilter, panelPeople],
  );

  const minCount = useMemo(() => Math.min(...participants.map((c) => drawCounts.get(c.email.toLowerCase()) ?? 0)), [participants, drawCounts]);

  const drawPool = useMemo(() => {
    if (!fairRotation || eligible.length === 0) return eligible;
    const lowest = Math.min(...eligible.map((c) => drawCounts.get(c.email.toLowerCase()) ?? 0));
    return eligible.filter((c) => (drawCounts.get(c.email.toLowerCase()) ?? 0) === lowest);
  }, [eligible, fairRotation, drawCounts]);

  function toggleExcluded(email: string) {
    const next = isExcluded(email) ? excluded.filter((e) => !sameEmail(e, email)) : [...excluded, email];
    setExcluded(next);
    saveExcluded(next);
  }

  function updateHistory(next: MeetingInfluencerDto[]) {
    setHistory(next);
    onChanged?.(meetingDate, next.filter((i) => i.meetingDate === meetingDate));
  }

  async function handleAccept(winner: InfluencerCandidate) {
    setSpinning(false);
    try {
      const saved = await addMeetingInfluencer({ meetingDate, email: winner.email, displayName: winner.displayName });
      updateHistory([...history.filter((i) => i.id !== saved.id), saved]);
      showToast(`${winner.displayName} är nästa veckas influencer!`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    }
  }

  async function handleUndo(influencer: MeetingInfluencerDto) {
    setBusyId(influencer.id);
    try {
      await deleteMeetingInfluencer(influencer.id);
      updateHistory(history.filter((i) => i.id !== influencer.id));
      showToast(`${influencer.displayName} är borttagen från panelen.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusyId(null);
    }
  }

  const candidateFor = (email: string) => candidates?.find((c) => sameEmail(c.email, email));
  const dateText = formatMeetingDate(meetingDate);
  const mailto = panelPeople.length > 0 ? buildReminderMailto(panelPeople, meetingDate) : undefined;

  return (
    <div className="tci">
      <header className="tci-header">
        <div className="tci-header__text">
          <div className="tci-eyebrow">Nytt inslag · Lotten avgör</div>
          <h2 className="tci-title">📣 Nästa veckas influencer</h2>
          <div className="tci-date">
            {editingDate ? (
              <input
                type="date"
                className="tci-date__input"
                value={meetingDate}
                min={todayIso()}
                autoFocus
                onChange={(e) => e.target.value && setMeetingDate(e.target.value)}
                onBlur={() => setEditingDate(false)}
                onKeyDown={(e) => e.key === "Enter" && setEditingDate(false)}
              />
            ) : (
              <>
                <span className="tci-date__text">{dateText}</span>
                <button type="button" className="tci-link" onClick={() => setEditingDate(true)} title="Ändra mötesdatum (t.ex. vid helgdag)">
                  ändra
                </button>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          className="tci-draw"
          disabled={!candidates || drawPool.length === 0}
          onClick={() => setSpinning(true)}
          title={drawPool.length === 0 ? "Ingen kvar att dra med nuvarande urval" : undefined}
        >
          <span className="tci-draw__dice" aria-hidden="true">🎲</span>
          <span>{panelPeople.length === 0 ? "Slumpa fram" : "Slumpa fram en till"}</span>
        </button>
      </header>

      {loadError && <div className="tci-error">{loadError}</div>}

      {panelPeople.length > 0 && (
        <div className="tci-saved" title="Varje dragning sparas direkt - du kan lämna punkten och maila efter mötet">
          ✓ Sparat för {dateText}
        </div>
      )}

      <section className="tci-chosen" aria-label="Dragna influencers">
        {panelPeople.length === 0 ? (
          <div className="tci-chosen__empty">Ingen dragen än – tryck på 🎲 och låt slumpen bestämma.</div>
        ) : (
          panelPeople.map((p) => {
            const teams = candidateFor(p.email)?.teams;
            return (
              <div key={p.id} className="tci-person">
                <PersonAvatar name={p.displayName} size={88} />
                <div className="tci-person__name">{p.displayName}</div>
                {teams && <div className="tci-person__team">Team {teams.join(" + ")}</div>}
                <button type="button" className="tci-person__undo" onClick={() => handleUndo(p)} disabled={busyId === p.id} title="Ta bort ur panelen">
                  ↶ Ångra
                </button>
              </div>
            );
          })
        )}
      </section>

      <section className="tci-categories">
        <div className="tci-section-title">Välj fritt ett av följande</div>
        <div className="tci-categories__grid">
          {INFLUENCER_CATEGORIES.map((c) => (
            <div key={c.title} className="tci-category">
              <div className="tci-category__icon" aria-hidden="true">{c.icon}</div>
              <div>
                <div className="tci-category__title">{c.title}</div>
                <div className="tci-category__desc">{c.description}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="tci-rule">{INFLUENCER_GROUND_RULE}</p>
      </section>

      <footer className="tci-footer">
        <div className="tci-settings">
          <div className="tci-segmented" role="group" aria-label="Dra från">
            {(["Alla", "Nord", "Syd"] as TeamFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                className={"tci-segmented__btn" + (teamFilter === f ? " tci-segmented__btn--active" : "")}
                onClick={() => setTeamFilter(f)}
              >
                {f === "Alla" ? "Båda teamen" : `Team ${f}`}
              </button>
            ))}
          </div>
          <label className="tci-check" title="Ingen dras igen förrän alla andra har fått chansen">
            <input type="checkbox" checked={fairRotation} onChange={(e) => setFairRotation(e.target.checked)} />
            Rättvis rotation
          </label>
          <button type="button" className="tci-link" onClick={() => setShowParticipants((v) => !v)}>
            Deltagare ({participants.length} av {candidates?.length ?? 0}) {showParticipants ? "▴" : "▾"}
          </button>
        </div>

        {/* Deliberately low-key: the mail usually goes out after the meeting, not mid-agenda. */}
        <a
          className={"tci-mail" + (mailto ? "" : " tci-mail--disabled")}
          href={mailto}
          aria-disabled={!mailto}
          aria-label="Maila påminnelse till alla i panelen"
          title={mailto ? "Maila påminnelse till alla i panelen (öppnas i Outlook)" : "Dra minst en person först"}
        >
          ✉️
        </a>
      </footer>

      {showParticipants && candidates && (
        <div className="tci-participants">
          <div className="tci-participants__hint">
            Klicka för att ta med eller utesluta någon ur lottningen (sparas i den här webbläsaren).
            {fairRotation && " Grå bock = har redan haft sin tur i den här omgången."}
          </div>
          <div className="tci-participants__list">
            {candidates.map((c) => {
              const out = isExcluded(c.email);
              const hadTurn = !out && (drawCounts.get(c.email.toLowerCase()) ?? 0) > minCount;
              return (
                <button
                  key={c.email}
                  type="button"
                  className={"tci-chip" + (out ? " tci-chip--out" : "")}
                  onClick={() => toggleExcluded(c.email)}
                  title={out ? "Utesluten – klicka för att ta med" : "Med i lottningen – klicka för att utesluta"}
                >
                  <PersonAvatar name={c.displayName} size={24} done={hadTurn} doneTitle="Har haft sin tur i den här omgången" />
                  <span>{c.displayName}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {spinning && (
        <InfluencerSpinner
          reelPool={eligible}
          drawPool={drawPool}
          meetingDateText={dateText}
          onAccept={handleAccept}
          onClose={() => setSpinning(false)}
        />
      )}
    </div>
  );
}
