import { useEffect, useMemo, useState } from "react";
import { BoardShell } from "../../components/BoardShell";
import { PersonAvatar } from "../../components/PersonAvatar";
import { fetchDailys, type DailyStoryDto, type DeveloperTeamId } from "../../api/dailys";
import { fetchTeamRoles, type PersonOption } from "../../api/people";
import { KpiStrip } from "../dailys/KpiStrip";
import { samePerson, summarizeStories } from "../dailys/dailysLogic";
import "./TeamHomeBoard.css";

interface TeamHomeBoardProps {
  onNavigate?: (board: "team-home" | "refinement" | "dailys" | "review" | "test" | "teamcheckin") => void;
  onHome?: () => void;
  team: DeveloperTeamId;
  onTeamChange: (team: DeveloperTeamId) => void;
}

interface RosterEntry extends PersonOption {
  role: string;
}

interface MemberSummary {
  total: number;
  active: number;
  done: number;
  newCount: number;
  totalSP: number;
  doneSP: number;
  alerts: number;
  openPRs: number;
}

function summarizeMember(stories: DailyStoryDto[], name: string): MemberSummary {
  const owned = stories.filter((s) => samePerson(s.developer, name));
  const { active, done, newCount, totalSP, doneSP } = summarizeStories(owned);
  const alerts = owned.filter((s) => s.alertLevel === "Warning" || s.alertLevel === "Critical").length;
  const openPRs = owned
    .flatMap((s) => s.pullRequests ?? [])
    .filter((pr) => samePerson(pr.createdByUniqueName || pr.createdBy || "", name) && pr.status?.toLowerCase() === "active").length;
  return { total: owned.length, active, done, newCount, totalSP, doneSP, alerts, openPRs };
}

/**
 * The team's own start page - what "Scrum" + a team now lands on, instead of jumping straight into
 * Dailys. A glance at every member (photo, role, a quick roll-up of their own cards/PRs from across
 * Azure DevOps) plus a team-wide summary, with the usual board tabs above to go anywhere from here.
 *
 * Built entirely from fetchDailys' + fetchTeamRoles' existing data - no new backend endpoint, since
 * both are already fetched in full by every other board and already carry per-story PR/alert info.
 */
export function TeamHomeBoard({ onNavigate, onHome, team, onTeamChange }: TeamHomeBoardProps) {
  const [roles, setRoles] = useState<{ po: PersonOption | null; testLead: PersonOption | null; developers: PersonOption[] } | null>(null);
  const [stories, setStories] = useState<DailyStoryDto[]>([]);
  const [sprintLabel, setSprintLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([fetchTeamRoles(team), fetchDailys(team)])
      .then(([teamRoles, dailys]) => {
        if (cancelled) return;
        setRoles(teamRoles);
        setStories(dailys.teams[0]?.stories ?? []);
        setSprintLabel(dailys.meta.sprint);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Kunde inte hämta teamets data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [team]);

  const roster: RosterEntry[] = useMemo(() => {
    if (!roles) return [];
    return [
      ...(roles.po ? [{ ...roles.po, role: "Product Owner" }] : []),
      ...roles.developers.map((d) => ({ ...d, role: "Utvecklare" })),
      ...(roles.testLead ? [{ ...roles.testLead, role: "Testansvarig" }] : []),
    ];
  }, [roles]);

  // PO-owned cards are excluded from the developer-focused board everywhere else in the app - same
  // rule here, so the team-wide summary matches what Dailys itself reports.
  const boardStories = useMemo(() => stories.filter((s) => !s.ownedByProductOwner), [stories]);

  return (
    <BoardShell activeBoard="team-home" onNavigate={onNavigate} onHome={onHome} team={team} onTeamChange={onTeamChange} title="Översikt" subtitle={sprintLabel || undefined}>
      {loading && <p className="dailys-board__status">Hämtar teamets data…</p>}
      {error && <p className="dailys-board__status dailys-board__status--error">Fel: {error}</p>}

      {!loading && !error && (
        <>
          <KpiStrip stories={boardStories} />

          <div className="th-members">
            {roster.map((member) => {
              const summary = summarizeMember(boardStories, member.displayName);
              return (
                <div className="th-member" key={member.email}>
                  <PersonAvatar name={member.displayName} size={56} />
                  <div className="th-member__body">
                    <div className="th-member__name">{member.displayName}</div>
                    <div className="th-member__role">{member.role}</div>
                    <div className="th-member__stats">
                      <span>
                        <strong>{summary.active}</strong> aktiva
                      </span>
                      <span>
                        <strong>{summary.done}</strong> klara
                      </span>
                      <span>
                        <strong>{summary.totalSP}</strong> SP
                      </span>
                      {summary.openPRs > 0 && (
                        <span className="th-member__stat--pr">
                          <strong>{summary.openPRs}</strong> öppna PR
                        </span>
                      )}
                      {summary.alerts > 0 && (
                        <span className="th-member__stat--alert">
                          ⚠ <strong>{summary.alerts}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </BoardShell>
  );
}
