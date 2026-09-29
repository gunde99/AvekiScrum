import { useEffect, useMemo, useState } from "react";
import { BoardShell } from "../../components/BoardShell";
import { PersonAvatar } from "../../components/PersonAvatar";
import { fetchDailys, type DailyStoryDto, type DeveloperTeamId } from "../../api/dailys";
import { fetchTeamRoles, type PersonOption } from "../../api/people";
import { KpiStrip } from "../dailys/KpiStrip";
import { pct, samePerson, summarizeStories } from "../dailys/dailysLogic";
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
  active: number;
  done: number;
  totalSP: number;
  doneSP: number;
  openPRs: number;
}

/** Elin and Chica ride along on the developer roster (see DailyFlow.tsx's own isTimeExemptPerson)
 *  but aren't developers - they get their real role here and move to "Övriga roller" below. */
function specialRoleLabel(name: string): string | null {
  if (samePerson(name, "Elin Jonsson")) return "Teamansvarig";
  if (samePerson(name, "Chica Robertsson")) return "Processansvarig";
  return null;
}

function summarizeMember(stories: DailyStoryDto[], name: string): MemberSummary {
  const owned = stories.filter((s) => samePerson(s.developer, name));
  const { active, done, totalSP, doneSP } = summarizeStories(owned);
  const openPRs = owned
    .flatMap((s) => s.pullRequests ?? [])
    .filter((pr) => samePerson(pr.createdByUniqueName || pr.createdBy || "", name) && pr.status?.toLowerCase() === "active").length;
  return { active, done, totalSP, doneSP, openPRs };
}

/**
 * The team's own start page - what "Scrum" + a team now lands on, instead of jumping straight into
 * Dailys. A glance at every member (photo, role, a quick roll-up of their own cards/PRs from across
 * Azure DevOps) plus a team-wide summary, with the usual board tabs above to go anywhere from here.
 *
 * Built entirely from fetchDailys' + fetchTeamRoles' existing data - no new backend endpoint, since
 * both are already fetched in full by every other board and already carry per-story PR info.
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

  // Real developers get the full stats grid; everyone else (PO, test lead, Elin, Chica) just needs
  // a name/photo/role - they don't own sprint cards the way a developer does, so stats on them
  // would just be a row of zeros.
  const { developerMembers, otherMembers } = useMemo(() => {
    if (!roles) return { developerMembers: [] as RosterEntry[], otherMembers: [] as RosterEntry[] };
    const other: RosterEntry[] = [];
    const developers: RosterEntry[] = [];
    if (roles.po) other.push({ ...roles.po, role: "Product Owner" });
    for (const dev of roles.developers) {
      const special = specialRoleLabel(dev.displayName);
      if (special) other.push({ ...dev, role: special });
      else developers.push({ ...dev, role: "Utvecklare" });
    }
    if (roles.testLead) other.push({ ...roles.testLead, role: "Testansvarig" });
    return { developerMembers: developers, otherMembers: other };
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

          <div className="th-section-title">Utvecklare</div>
          <div className="th-members">
            {developerMembers.map((member) => {
              const summary = summarizeMember(boardStories, member.displayName);
              const spPct = pct(summary.doneSP, summary.totalSP);
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
                      {summary.openPRs > 0 && (
                        <span className="th-member__stat--pr">
                          <strong>{summary.openPRs}</strong> öppna PR
                        </span>
                      )}
                    </div>
                    <div className="th-member__progress" title={`${summary.doneSP} av ${summary.totalSP} story points klara`}>
                      <div className="th-member__progress-track">
                        <div className="th-member__progress-fill" style={{ width: `${spPct}%` }} />
                      </div>
                      <span className="th-member__progress-label">
                        {summary.doneSP}/{summary.totalSP} SP
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {otherMembers.length > 0 && (
            <>
              <div className="th-section-title">Övriga roller</div>
              <div className="th-members th-members--compact">
                {otherMembers.map((member) => (
                  <div className="th-member th-member--compact" key={member.email}>
                    <PersonAvatar name={member.displayName} size={44} />
                    <div className="th-member__body">
                      <div className="th-member__name">{member.displayName}</div>
                      <div className="th-member__role">{member.role}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </BoardShell>
  );
}
