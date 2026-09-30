import { useCallback, useEffect, useMemo, useState } from "react";
import { BoardShell } from "../../components/BoardShell";
import { LoadingOverlay } from "../../components/LoadingOverlay";
import { useToast } from "../../components/Toast";
import {
  fetchDailys,
  fetchDailyPerson,
  fetchSprintInflowChanges,
  TEAM_OPTIONS,
  type DailyStoryDto,
  type DailysResponse,
  type DeveloperTeamId,
  type SprintInflowChangeDto,
} from "../../api/dailys";
import { fetchSprintGoals, type SprintGoal } from "../../api/sprintGoals";
import { fetchTeamRoles } from "../../api/people";
import { updateWorkItemFields } from "../../api/workitems";
import { DailyFlow } from "./DailyFlow";
import { FilterPanel, WORK_ITEM_TYPES, type TagFilterState, type WorkItemTypeKey } from "./FilterPanel";
import { GroupCard } from "./GroupCard";
import { KpiStrip } from "./KpiStrip";
import { SprintGoalModal } from "./SprintGoalModal";
import { SprintPicker } from "./SprintPicker";
import { useWorkItemModals } from "../../components/workitem/useWorkItemModals";
import { FlowParticipants } from "./FlowParticipants";
import {
  applyPersonRefresh,
  applyWorkItemSave,
  buildFlowParticipants,
  buildGroups,
  buildSprintInflowGroups,
  DOD_TAG,
  isStaleClosed,
  matchesTestFilter,
  participantOnByDefault,
  sprintInflowCutoff,
  withoutReviewTag,
  type GroupMode,
  type FlowLaneStage,
  type TestFilterKey,
} from "./dailysLogic";
import type { PersonOption } from "../../api/people";
import "./DailysBoard.css";

const LANE_TO_AZURE_STATE: Record<FlowLaneStage, string> = {
  New: "New",
  Active: "Active",
  Resolved: "Resolved",
  Done: "Closed",
};

// Mirrors the backend's DeriveTaskStatus: Resolved state still reports status "Active" (there is
// no separate "Resolved" status value), only New/Closed get their own status.
const LANE_TO_STATUS: Record<FlowLaneStage, string> = {
  New: "New",
  Active: "Active",
  Resolved: "Active",
  Done: "Closed",
};

const LANE_LABEL: Record<FlowLaneStage, string> = {
  New: "Ny",
  Active: "Aktiv",
  Resolved: "Löst",
  Done: "Klar",
};

// Kept in localStorage rather than on the server: who is at today's standup is this person's
// running-the-meeting state, not a fact about the team that everyone else should inherit.
const PARTICIPANTS_STORAGE_PREFIX = "avekiscrum.dailyflow.participants.";

function readParticipantChoices(team: DeveloperTeamId): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(PARTICIPANTS_STORAGE_PREFIX + team);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(([, v]) => typeof v === "boolean"),
    ) as Record<string, boolean>;
  } catch {
    // Unreadable or disabled storage just means "no saved choices" - never a reason to fail the board.
    return {};
  }
}

function writeParticipantChoices(team: DeveloperTeamId, choices: Record<string, boolean>) {
  try {
    localStorage.setItem(PARTICIPANTS_STORAGE_PREFIX + team, JSON.stringify(choices));
  } catch {
    /* ignore - the picker still works for this session */
  }
}

interface DailysBoardProps {
  onNavigate?: (board: "team-home" | "refinement" | "dailys" | "review" | "test" | "teamcheckin") => void;
  /** Back to the start page, where AvekiSupport lives. */
  onHome?: () => void;
  /** Owned by App - see BoardShell's header, which is where this is actually chosen now. */
  team: DeveloperTeamId;
  onTeamChange: (team: DeveloperTeamId) => void;
}

export function DailysBoard({ onNavigate, onHome, team, onTeamChange }: DailysBoardProps) {
  const { showToast } = useToast();
  // Set by the sprint picker - undefined means "today's sprint", /api/dailys' own default.
  const [selectedIteration, setSelectedIteration] = useState<string | undefined>(undefined);
  // A manually-picked sprint is specific to the team it was picked for - Nord and Syd's sprints
  // share no path, so carrying it over to a freshly switched team would just 404.
  useEffect(() => setSelectedIteration(undefined), [team]);
  const [mode, setMode] = useState<GroupMode>("goals");
  const [data, setData] = useState<DailysResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [searchText, setSearchText] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string> | null>(null);
  const [tagFilters, setTagFilters] = useState<Map<string, TagFilterState>>(new Map());
  // On by default: settled work shouldn't weigh down the daily view once the team has seen it.
  const [hideStaleClosed, setHideStaleClosed] = useState(true);
  // Both types shown by default; unticking one hides that card type.
  const [selectedTypes, setSelectedTypes] = useState<Set<WorkItemTypeKey>>(new Set(["story", "bug"]));
  // Empty means "no test constraint" - any selected key narrows to cards matching at least one.
  const [testFilters, setTestFilters] = useState<Set<TestFilterKey>>(new Set());
  const [sprintGoals, setSprintGoals] = useState<SprintGoal[]>([]);
  const [developerRoster, setDeveloperRoster] = useState<PersonOption[]>([]);
  const [flowExcludedByDefault, setFlowExcludedByDefault] = useState<PersonOption[]>([]);
  const [flowRoles, setFlowRoles] = useState<{ po: PersonOption | null; testLead: PersonOption | null }>({ po: null, testLead: null });
  // Explicit ticks and unticks only. Anyone absent falls back to participantOnByDefault, so a new
  // team member is picked up automatically instead of inheriting a stale saved list.
  const [participantChoices, setParticipantChoices] = useState<Record<string, boolean>>({});
  const [openSprintGoalNumber, setOpenSprintGoalNumber] = useState<number | null>(null);
  const [dailyFlowActive, setDailyFlowActive] = useState(false);
  const [flowHighlightGroupId, setFlowHighlightGroupId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Sprint-inflow tracking: per-card signals that need a server round-trip through Azure DevOps'
  // revision history (a card moved into this iteration from elsewhere, or had its Story Points
  // re-pointed) - "created after the cutoff" needs no such trip, see buildSprintInflowGroups.
  // Fetched in the background once the board's own data is in, never blocking render.
  const [inflowChanges, setInflowChanges] = useState<SprintInflowChangeDto[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchDailys(team, controller.signal, selectedIteration)
      .then((response) => {
        setData(response);
        setOpenGroups(new Set());
        setSelectedStatuses(null); // reset to "all" for the freshly loaded team's status set
        setTagFilters(new Map());
        setSelectedTypes(new Set(WORK_ITEM_TYPES.map((t) => t.key)));
        setTestFilters(new Set());
        setDailyFlowActive(false);
        setFlowHighlightGroupId(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        // An aborted request (StrictMode's double-invoke, or a fast team switch) is not a
        // real failure - the effect that superseded it owns setting loading/data/error next.
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setLoading(false);
      });
    return () => controller.abort();
  }, [team, selectedIteration]);

  useEffect(() => {
    const controller = new AbortController();
    fetchSprintGoals(team, controller.signal)
      .then((goals) => setSprintGoals(goals))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Sprint goals are a nice-to-have overlay on top of the Azure DevOps card data - if the
        // Wiki page can't be reached, the board should keep working with plain tag labels.
        setSprintGoals([]);
      });
    return () => controller.abort();
  }, [team]);

  // Background check for sprint-inflow signals Azure DevOps' revision history has to answer: did
  // this card get moved into the current iteration after the cutoff, and/or did its Story Points
  // change after the cutoff. Checked for every non-PO card, not just ones that pre-date the cutoff -
  // a card created after the cutoff can still have been re-pointed since, and that's worth showing
  // too (see buildSprintInflowGroups).
  useEffect(() => {
    if (!data) return;
    const cutoff = sprintInflowCutoff(data.meta.sprintStart);
    const candidateIds = (data.teams[0]?.stories ?? []).filter((s) => !s.ownedByProductOwner).map((s) => s.id);
    if (candidateIds.length === 0) {
      setInflowChanges([]);
      return;
    }
    const controller = new AbortController();
    fetchSprintInflowChanges(candidateIds, cutoff.toISOString(), data.meta.sprintPath, controller.signal)
      .then(setInflowChanges)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // A best-effort enrichment - the board works fine without it.
        setInflowChanges([]);
      });
    return () => controller.abort();
  }, [data]);

  // Drives which names get their own top-level "developer" group: this team's actual developer
  // roster, not just whoever happens to be attached to a card - a QA consultant testing a card,
  // or a developer from the other team helping out, shouldn't get a standalone group here.
  useEffect(() => {
    const controller = new AbortController();
    fetchTeamRoles(team, controller.signal)
      .then((roles) => {
        setDeveloperRoster(roles.developers);
        setFlowExcludedByDefault(roles.flowExcludedByDefault ?? []);
        setFlowRoles({ po: roles.po, testLead: roles.testLead });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Falls back to buildGroups' own card-derived grouping if the roster can't be loaded.
        setDeveloperRoster([]);
        setFlowExcludedByDefault([]);
        setFlowRoles({ po: null, testLead: null });
      });
    return () => controller.abort();
  }, [team]);

  // Saved per team, so Nord and Syd keep separate line-ups and neither has to be redone before
  // every standup.
  useEffect(() => {
    setParticipantChoices(readParticipantChoices(team));
  }, [team]);

  // Re-fetches just the card/goal data for the current team, leaving filters, the daily flow,
  // and everything else on the page untouched - unlike a team switch, which intentionally resets
  // all of that for a fresh context.
  async function refreshBoard() {
    setRefreshing(true);
    setError(null);
    try {
      const [dailysResponse, goals] = await Promise.all([
        fetchDailys(team, undefined, selectedIteration),
        fetchSprintGoals(team).catch(() => sprintGoals),
      ]);
      setData(dailysResponse);
      setSprintGoals(goals);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte uppdatera boarden.");
    } finally {
      setRefreshing(false);
    }
  }

  // The daily flow's own "Uppdatera korten" button (developer turns only): re-fetches just this
  // one person's cards - much cheaper than refreshBoard's full-team fetch, see fetchDailyPerson -
  // and splices them into the existing board state. Left uncaught on purpose: DailyFlow wraps the
  // call and reports failure itself, so this stays a plain data operation.
  async function refreshPerson(person: string) {
    const teamId = data?.teams[0]?.id;
    if (!teamId) return;
    const response = await fetchDailyPerson(team, person, undefined, selectedIteration);
    setData((prev) => (prev ? applyPersonRefresh(prev, teamId, person, response.stories) : prev));
  }

  const sprintGoalsByNumber = useMemo(() => new Map(sprintGoals.map((g) => [g.number, g])), [sprintGoals]);
  const openSprintGoal = openSprintGoalNumber !== null ? sprintGoalsByNumber.get(openSprintGoalNumber) ?? null : null;

  const stories = data?.teams[0]?.stories ?? [];

  const availableStatuses = useMemo(() => {
    const canonicalOrder = ["New", "Active", "Resolved", "Closed", "Done"];
    const present = new Set(stories.map((s) => s.azureStatus).filter(Boolean));
    const ordered = canonicalOrder.filter((s) => present.has(s));
    const rest = [...present].filter((s) => !canonicalOrder.includes(s)).sort();
    return [...ordered, ...rest];
  }, [stories]);

  const activeStatuses = selectedStatuses ?? new Set(availableStatuses);

  const availableTags = useMemo(() => {
    const present = new Set<string>();
    stories.forEach((s) => s.tags.forEach((t) => present.add(t)));
    return [...present].sort((a, b) => a.localeCompare(b, "sv"));
  }, [stories]);

  // Deliberately does NOT apply hideStaleClosed - see dailyFlowStories below for why that filter
  // is scoped to the daily flow only. Everything the board itself renders (groups, KpiStrip) comes
  // from filteredStories/boardStories, so a long-closed card still counts toward "hur mycket är
  // faktiskt klart" instead of quietly skewing the sprint's own statistics.
  const filteredStories = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const includeTags = [...tagFilters.entries()].filter(([, state]) => state === "include").map(([t]) => t);
    const excludeTags = [...tagFilters.entries()].filter(([, state]) => state === "exclude").map(([t]) => t);
    return stories.filter((s) => {
      if (!selectedTypes.has(s.type === "Bug" ? "bug" : "story")) return false;
      // Selected test filters are OR-ed: show cards matching at least one of them.
      if (testFilters.size > 0 && ![...testFilters].some((key) => matchesTestFilter(s, key))) return false;
      if (!activeStatuses.has(s.azureStatus)) return false;
      if (query && !s.title.toLowerCase().includes(query) && !String(s.id).includes(query)) return false;
      if (includeTags.some((tag) => !s.tags.includes(tag))) return false;
      if (excludeTags.some((tag) => s.tags.includes(tag))) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stories, searchText, selectedStatuses, tagFilters, selectedTypes, testFilters]);

  // Counts what this filter would remove from the daily flow. PO-owned cards are excluded because
  // the board never shows them anyway - counting them made the label claim more hidden cards than
  // it actually affects.
  const staleClosedCount = useMemo(
    () => stories.filter((s) => !s.ownedByProductOwner && isStaleClosed(s)).length,
    [stories],
  );

  // hideStaleClosed only trims what the daily flow steps through - a card closed days ago is
  // exactly the noise you don't want taking up a turn, but it's still real, recent work that
  // should count in the board's own KPIs and status groups above. Applied on top of the other
  // filters (search/tags/status/type/test), not instead of them, so the flow still respects
  // whatever the person running it is deliberately looking at.
  const dailyFlowStories = useMemo(
    () => (hideStaleClosed ? filteredStories.filter((s) => !isStaleClosed(s)) : filteredStories),
    [filteredStories, hideStaleClosed],
  );

  // PO-owned cards are intentionally excluded from the developer-focused board (they're not
  // fetched to be worked on by a developer) but still need to reach the daily flow's PO turn, so
  // they stay in filteredStories and are only stripped out here, right before board rendering.
  const boardStories = useMemo(() => filteredStories.filter((s) => !s.ownedByProductOwner), [filteredStories]);

  // Built from the unfiltered card set on purpose: hiding closed cards or narrowing to bugs
  // shouldn't quietly drop someone from the standup line-up.
  const allGroups = useMemo(
    () => buildGroups(stories.filter((s) => !s.ownedByProductOwner), "developer", developerRoster.map((d) => d.displayName)),
    [stories, developerRoster],
  );

  const flowParticipants = useMemo(
    () => buildFlowParticipants(allGroups, developerRoster, flowRoles.po, flowRoles.testLead),
    [allGroups, developerRoster, flowRoles],
  );

  const selectedParticipants = useMemo(
    () =>
      new Set(
        flowParticipants
          .filter((p) => participantChoices[p.key] ?? participantOnByDefault(p, flowExcludedByDefault))
          .map((p) => p.key),
      ),
    [flowParticipants, participantChoices, flowExcludedByDefault],
  );

  const updateParticipantChoices = useCallback(
    (next: Record<string, boolean>) => {
      setParticipantChoices(next);
      writeParticipantChoices(team, next);
    },
    [team],
  );

  const toggleParticipant = useCallback(
    (key: string) => {
      updateParticipantChoices({ ...participantChoices, [key]: !selectedParticipants.has(key) });
    },
    [participantChoices, selectedParticipants, updateParticipantChoices],
  );

  const setAllParticipants = useCallback(
    (on: boolean) => {
      updateParticipantChoices(Object.fromEntries(flowParticipants.map((p) => [p.key, on])));
    },
    [flowParticipants, updateParticipantChoices],
  );

  // Shared by the board's own groups and the daily flow's own (see dailyFlowGroups below) - the
  // only difference between the two is which story set goes in, not how it's grouped.
  const buildBoardGroups = useCallback(
    (storiesForGroups: DailyStoryDto[]) => {
      const built = buildGroups(storiesForGroups, mode, developerRoster.map((d) => d.displayName));
      if (mode !== "goals") return built;
      // Sprint goals with zero cards right now still deserve a row - otherwise a goal nobody has
      // started work on yet would just silently never appear on the board.
      const presentNumbers = new Set(
        built.map((g) => Number(g.label.match(/\d+/)?.[0])).filter((n) => !Number.isNaN(n)),
      );
      const missingGoals = sprintGoals
        .filter((g) => !presentNumbers.has(g.number))
        .map((g) => ({
          id: `g-empty-${g.number}`,
          label: `Sprintmål ${g.number} - ${g.title}`,
          mode: "goals" as const,
          stories: [],
        }));
      // Every numbered goal (real or empty) sorted together by its number - the order stories
      // happened to appear in the API response isn't a meaningful sort key. The "(Inget
      // sprintmål)" catch-all - if present - always stays last.
      const catchAll = built.filter((g) => g.label === "(Inget sprintmål)");
      const numbered = [...built.filter((g) => g.label !== "(Inget sprintmål)"), ...missingGoals].sort(
        (a, b) => (Number(a.label.match(/\d+/)?.[0]) || 0) - (Number(b.label.match(/\d+/)?.[0]) || 0),
      );
      return [...numbered, ...catchAll];
    },
    [mode, sprintGoals, developerRoster],
  );

  const groups = useMemo(() => buildBoardGroups(boardStories), [buildBoardGroups, boardStories]);

  // Sprint inflow: what showed up (or changed) after planning already set the plan. Built from the
  // full non-PO story set rather than boardStories, so narrowing the board's own filters (search,
  // status, type) doesn't make this overview disappear along with it.
  const inflowCutoff = useMemo(
    () => (data ? sprintInflowCutoff(data.meta.sprintStart) : null),
    [data],
  );
  const nonPoStories = useMemo(() => stories.filter((s) => !s.ownedByProductOwner), [stories]);
  const { newCardsGroup, spChangedGroup } = useMemo(
    () =>
      inflowCutoff
        ? buildSprintInflowGroups(nonPoStories, inflowCutoff, inflowChanges)
        : { newCardsGroup: null, spChangedGroup: null },
    [nonPoStories, inflowCutoff, inflowChanges],
  );

  // The daily flow's own groups, built from dailyFlowStories (hideStaleClosed applied) rather than
  // boardStories - so a card the flow is skipping over doesn't still pad out its "X kort, Y klara"
  // turn stats. The board above (groups, just above) is intentionally left out of this.
  const dailyFlowBoardStories = useMemo(() => dailyFlowStories.filter((s) => !s.ownedByProductOwner), [dailyFlowStories]);
  const dailyFlowGroups = useMemo(
    () => buildBoardGroups(dailyFlowBoardStories),
    [buildBoardGroups, dailyFlowBoardStories],
  );

  function toggleGroup(id: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function changeMode(next: GroupMode) {
    setMode(next);
    setOpenGroups(new Set());
    // A running flow's queue was built for the mode it started in (developer roster vs.
    // sprint-goal list) - switching mode mid-flow would leave it pointing at stale groups.
    setDailyFlowActive(false);
    setFlowHighlightGroupId(null);
  }

  function toggleStatus(status: string) {
    setSelectedStatuses((prev) => {
      const base = prev ?? new Set(availableStatuses);
      const next = new Set(base);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  const handleTaskAssigned = useCallback((taskId: number, displayName: string) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            teams: prev.teams.map((t) => ({
              ...t,
              stories: t.stories.map((s) => ({
                ...s,
                tasks: s.tasks.map((task) => (task.id === taskId ? { ...task, assignedTo: displayName } : task)),
              })),
            })),
          }
        : prev,
    );
  }, []);

  /**
   * Move a card between the open states from its pill.
   *
   * Patched locally rather than refetched: the whole point is a one-click change during a standup,
   * and a full reload would collapse the groups you were looking at. Closed is never offered here -
   * see OPEN_STATES in StoryTable.
   *
   * Plain function, not useCallback: this component never remounts on a team switch (App.tsx holds
   * no `key`), so a memoized version whose deps didn't list every closed-over value (refreshBoard,
   * and through it team/selectedIteration) would keep calling a stale refreshBoard from whichever
   * team was active when it was first created - silently overwriting the *current* team's board
   * with the *other* team's data the next time this ran. That's exactly what happened here.
   */
  async function quickSetState(story: DailyStoryDto, state: string) {
    const previous = story.azureStatus;
    setData((prev) =>
      prev
        ? {
            ...prev,
            teams: prev.teams.map((t) => ({
              ...t,
              stories: t.stories.map((s) => (s.id === story.id ? { ...s, azureStatus: state } : s)),
            })),
          }
        : prev,
    );
    try {
      await updateWorkItemFields(story.id, { state });
      showToast(`#${story.id} satt till "${state}".`, "success");
      // Varningarna räknas ut på servern utifrån kortets status, så en lokal patch lämnar dem
      // kvar och säger emot pillret bredvid - "Test väntar på att huvudkortet blir Resolved" på
      // ett kort som just blev Resolved. Hämtar om boarden; openGroups rörs inte, så det man
      // hade uppfällt förblir uppfällt.
      void refreshBoard();
    } catch (err) {
      // Put it back: an optimistic move that failed must not leave the board claiming otherwise.
      setData((prev) =>
        prev
          ? {
              ...prev,
              teams: prev.teams.map((t) => ({
                ...t,
                stories: t.stories.map((s) => (s.id === story.id ? { ...s, azureStatus: previous } : s)),
              })),
            }
          : prev,
      );
      showToast(`Kunde inte ändra #${story.id}: ${err instanceof Error ? err.message : "Okänt fel"}`, "error");
    }
  }

  /** Adds the DoD tag to the board's local copy, so the card's warnings clear immediately. */
  const markDodApproved = useCallback((storyId: number) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            teams: prev.teams.map((t) => ({
              ...t,
              stories: t.stories.map((s) =>
                s.id === storyId && !s.tags.includes(DOD_TAG) ? { ...s, tags: [...s.tags, DOD_TAG] } : s,
              ),
            })),
          }
        : prev,
    );
  }, []);

  /**
   * Sign off a closed card straight from its status pill.
   *
   * Writes the same tag the dialog writes - there is only one way to be approved - and patches the
   * board rather than refetching, so the row simply stops warning where you clicked.
   */
  const quickApproveDod = useCallback(
    async (story: DailyStoryDto) => {
      try {
        await updateWorkItemFields(story.id, { tags: [...story.tags, DOD_TAG] });
        markDodApproved(story.id);
        showToast(`#${story.id} godkänd enligt Definition of Done.`, "success");
      } catch (err) {
        showToast(`Kunde inte godkänna #${story.id}: ${err instanceof Error ? err.message : "Okänt fel"}`, "error");
      }
    },
    [markDodApproved, showToast],
  );

  /**
   * Cards were just tagged with a sprint goal from inside the daily.
   *
   * Patched locally rather than refetched: a refetch mid-standup rebuilds the groups, and the flow
   * would lose its place. Setting sprintGoal is what actually moves them - the grouping reads that
   * field - and the tag is carried along so the card looks the same as one loaded from Azure.
   */
  const handleCardsLinked = useCallback((storyIds: number[], goalNumber: number) => {
    const tag = `Sprintmål ${goalNumber}`;
    const ids = new Set(storyIds);
    setData((prev) =>
      prev
        ? {
            ...prev,
            teams: prev.teams.map((t) => ({
              ...t,
              stories: t.stories.map((s) =>
                ids.has(s.id) ? { ...s, sprintGoal: tag, tags: [...(s.tags ?? []), tag] } : s,
              ),
            })),
          }
        : prev,
    );
  }, []);

  // The tag may have been cleared from the story, from some of its tasks, or from both, so the
  // local copy is patched by id rather than assuming the story carried it.
  const handleReviewTagCleared = useCallback((storyId: number, clearedIds: number[]) => {
    const cleared = new Set(clearedIds);
    setData((prev) =>
      prev
        ? {
            ...prev,
            teams: prev.teams.map((t) => ({
              ...t,
              stories: t.stories.map((s) =>
                s.id === storyId
                  ? {
                      ...s,
                      tags: cleared.has(s.id) ? withoutReviewTag(s.tags) : s.tags,
                      tasks: (s.tasks ?? []).map((task) =>
                        cleared.has(task.id) ? { ...task, tags: withoutReviewTag(task.tags) } : task,
                      ),
                    }
                  : s,
              ),
            })),
          }
        : prev,
    );
  }, []);

  const handleFlowHighlightChange = useCallback((groupId: string | null) => {
    setFlowHighlightGroupId(groupId);
    // Only the current developer's group should be expanded during the flow - collapse
    // everything else, even groups the user opened by hand before starting/advancing.
    setOpenGroups(groupId ? new Set([groupId]) : new Set());
    if (groupId) {
      // Wait for the collapse/expand reflow to settle before measuring positions, then scroll
      // so the group's own header lands just under the sticky flow panel - not centered, which
      // would push the header (and often several cards) above the visible viewport.
      window.setTimeout(() => {
        const target = document.getElementById(`group-${groupId}`);
        const flowPanel = document.querySelector(".daily-flow");
        if (!target) return;
        const flowHeight = flowPanel ? flowPanel.getBoundingClientRect().height : 0;
        const targetTop = target.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: targetTop - flowHeight - 12, behavior: "smooth" });
      }, 120);
    }
  }, []);

  function toggleType(type: WorkItemTypeKey) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function toggleTestFilter(key: TestFilterKey) {
    setTestFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function cycleTag(tag: string) {
    setTagFilters((prev) => {
      const next = new Map(prev);
      const state = next.get(tag);
      // off -> include (must have) -> exclude (must not have) -> off
      if (state === undefined) next.set(tag, "include");
      else if (state === "include") next.set(tag, "exclude");
      else next.delete(tag);
      return next;
    });
  }

  async function handleTaskDrop(taskId: number, targetLane: FlowLaneStage) {
    const previousData = data;
    // Optimistic move first - dragging should feel instant, not wait on a round-trip.
    setData((prev) =>
      prev
        ? {
            ...prev,
            teams: prev.teams.map((t) => ({
              ...t,
              stories: t.stories.map((s) => ({
                ...s,
                tasks: s.tasks.map((task) =>
                  task.id === taskId ? { ...task, stage: targetLane, status: LANE_TO_STATUS[targetLane] } : task,
                ),
              })),
            })),
          }
        : prev,
    );

    try {
      await updateWorkItemFields(taskId, { state: LANE_TO_AZURE_STATE[targetLane] });
      showToast(`Task #${taskId} flyttad till "${LANE_LABEL[targetLane]}" och sparad i Azure DevOps.`, "success");
    } catch (err) {
      setData(previousData); // revert the optimistic move
      showToast(
        `Kunde inte flytta task #${taskId}: ${err instanceof Error ? err.message : "Okänt fel"}`,
        "error",
      );
    }
  }

  const { setOpenWorkItemId, setOpenValidationId, modals: workItemModals } = useWorkItemModals({
    team,
    onApproved: refreshBoard,
    getStory: (id) => stories.find((s) => s.id === id),
    onDodApproved: markDodApproved,
    // Backs both the board's own card list and DailyFlow's embedded test-lead turn (they share
    // this one hook call) - a "Spara" from either place shows up in both without a refetch.
    onWorkItemSaved: (updated) => setData((prev) => (prev ? applyWorkItemSave(prev, updated) : prev)),
  });

  return (
    <BoardShell
      activeBoard="dailys"
      onNavigate={onNavigate}
      onHome={onHome}
      team={team}
      onTeamChange={onTeamChange}
      title="Dailys"
      subtitle={
        data && (
          <SprintPicker
            team={team}
            sprint={data.meta.sprint}
            sprintStart={data.meta.sprintStart}
            sprintEnd={data.meta.sprintEnd}
            sprintPath={data.meta.sprintPath}
            onSelect={setSelectedIteration}
          />
        )
      }
    >
      <div className="dailys-board__toolbar">
        <div className="dailys-board__group" role="group" aria-label="Gruppering">
          <span className="dailys-board__group-label">Gruppera på</span>
          <div className="dailys-board__group-body">
            <button
              className={"dailys-board__tab dailys-board__tab--mode" + (mode === "goals" ? " dailys-board__tab--active" : "")}
              onClick={() => changeMode("goals")}
            >
              Sprintmål
            </button>
            <button
              className={"dailys-board__tab dailys-board__tab--mode" + (mode === "developer" ? " dailys-board__tab--active" : "")}
              onClick={() => changeMode("developer")}
            >
              Utvecklare
            </button>
            <button
              className={"dailys-board__tab dailys-board__tab--mode" + (mode === "none" ? " dailys-board__tab--active" : "")}
              onClick={() => changeMode("none")}
            >
              Ogrupperat
            </button>
          </div>
        </div>

        <div className="dailys-board__group" role="group" aria-label="Åtgärder">
          <span className="dailys-board__group-label">Åtgärder</span>
          <div className="dailys-board__group-body">
            <button
              type="button"
              className="dailys-board__refresh"
              onClick={refreshBoard}
              disabled={refreshing || loading}
              title="Ladda om boardens innehåll (filter, daily-flöde m.m. påverkas inte)"
            >
              <span className={refreshing ? "dailys-board__refresh-icon dailys-board__refresh-icon--spin" : "dailys-board__refresh-icon"}>
                ⟳
              </span>
              {refreshing ? "Uppdaterar…" : "Uppdatera"}
            </button>
            {!dailyFlowActive && (
              <button className="dailys-board__tab dailys-board__flow-start" onClick={() => setDailyFlowActive(true)}>
                ▶ Starta Daily-flöde
              </button>
            )}
          </div>
        </div>

        <div className="dailys-board__participants">
          <FlowParticipants
            participants={flowParticipants}
            selected={selectedParticipants}
            onToggle={toggleParticipant}
            onSelectAll={() => setAllParticipants(true)}
            onSelectNone={() => setAllParticipants(false)}
            onReset={() => updateParticipantChoices({})}
          />
        </div>

        <div className="dailys-board__filter">
          <FilterPanel
            searchText={searchText}
            onSearchTextChange={setSearchText}
            statuses={availableStatuses}
            selectedStatuses={activeStatuses}
            onToggleStatus={toggleStatus}
            onSelectAll={() => setSelectedStatuses(new Set(availableStatuses))}
            onSelectNone={() => setSelectedStatuses(new Set())}
            tags={availableTags}
            tagFilters={tagFilters}
            onCycleTag={cycleTag}
            onClearTags={() => setTagFilters(new Map())}
            hideStaleClosed={hideStaleClosed}
            onToggleStaleClosed={() => setHideStaleClosed((v) => !v)}
            staleClosedCount={staleClosedCount}
            selectedTypes={selectedTypes}
            onToggleType={toggleType}
            testFilters={testFilters}
            onToggleTestFilter={toggleTestFilter}
          />
        </div>
      </div>

      {loading && (
        <LoadingOverlay
          message="Hämtar data från Azure DevOps…"
          sub={data === null ? "Det här kan ta några sekunder första gången." : `Byter till ${TEAM_OPTIONS.find((t) => t.id === team)?.label ?? team}…`}
        />
      )}
      {error && <p className="dailys-board__status dailys-board__status--error">Fel: {error}</p>}

      {!loading && !error && (
        <>
          {dailyFlowActive && (
            <DailyFlow
              team={team}
              mode={mode}
              groups={dailyFlowGroups}
              allStories={dailyFlowStories}
              unfilteredStories={stories}
              currentIteration={data ? { path: data.meta.sprintPath, label: data.meta.sprint } : undefined}
              onHighlightChange={handleFlowHighlightChange}
              onOpenWorkItem={setOpenWorkItemId}
              onRefreshPerson={refreshPerson}
              onTaskAssigned={handleTaskAssigned}
              onCardsLinked={handleCardsLinked}
              sprintGoalsByNumber={sprintGoalsByNumber}
              onOpenValidation={setOpenValidationId}
              onReviewTagCleared={handleReviewTagCleared}
              participantKeys={selectedParticipants}
              onClose={() => setDailyFlowActive(false)}
            />
          )}
          <KpiStrip stories={boardStories} />
          <div className="dailys-board__groups">
            {(newCardsGroup || spChangedGroup) && (
              <div className="dailys-board__inflow">
                {newCardsGroup && (
                  <GroupCard
                    key={newCardsGroup.id}
                    group={newCardsGroup}
                    isOpen={openGroups.has(newCardsGroup.id)}
                    onToggle={() => toggleGroup(newCardsGroup.id)}
                    onOpenWorkItem={setOpenWorkItemId}
                    onOpenValidation={setOpenValidationId}
                    onQuickApproveDod={quickApproveDod}
                    onQuickSetState={quickSetState}
                    onTaskDrop={handleTaskDrop}
                    sprintGoalsByNumber={sprintGoalsByNumber}
                    onOpenSprintGoal={setOpenSprintGoalNumber}
                  />
                )}
                {spChangedGroup && (
                  <GroupCard
                    key={spChangedGroup.id}
                    group={spChangedGroup}
                    isOpen={openGroups.has(spChangedGroup.id)}
                    onToggle={() => toggleGroup(spChangedGroup.id)}
                    onOpenWorkItem={setOpenWorkItemId}
                    onOpenValidation={setOpenValidationId}
                    onQuickApproveDod={quickApproveDod}
                    onQuickSetState={quickSetState}
                    onTaskDrop={handleTaskDrop}
                    sprintGoalsByNumber={sprintGoalsByNumber}
                    onOpenSprintGoal={setOpenSprintGoalNumber}
                  />
                )}
              </div>
            )}
            {groups.length === 0 && <p className="dailys-board__status">Inga kort matchar filtret.</p>}
            {groups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                isOpen={openGroups.has(group.id)}
                isFlowHighlighted={group.id === flowHighlightGroupId}
                onToggle={() => toggleGroup(group.id)}
                onOpenWorkItem={setOpenWorkItemId}
                onOpenValidation={setOpenValidationId}
                onQuickApproveDod={quickApproveDod}
                onQuickSetState={quickSetState}
                onTaskDrop={handleTaskDrop}
                sprintGoalsByNumber={sprintGoalsByNumber}
                onOpenSprintGoal={setOpenSprintGoalNumber}
              />
            ))}
          </div>
        </>
      )}

      {workItemModals}
      {openSprintGoal && (
        <SprintGoalModal
          goal={openSprintGoal}
          onClose={() => setOpenSprintGoalNumber(null)}
          onOpenWorkItem={setOpenWorkItemId}
        />
      )}
    </BoardShell>
  );
}
