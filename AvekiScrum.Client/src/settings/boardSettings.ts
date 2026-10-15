import { useSyncExternalStore } from "react";

/**
 * The board settings behind BoardShell's ⚙️ button: how someone likes to read the boards, as
 * opposed to the filters, which narrow what a board shows right now. Kept in localStorage - it is
 * this person's preference, not a fact about the team that everyone else should inherit - and read
 * through a hook rather than a context, so a board can use a setting in its own body (DailysBoard
 * needs the stale-closed rule to build its groups) as well as deep inside the cards it renders.
 */
export type TestCardLayout = "rows" | "cards";

export interface BoardSettings {
  /** ⚠/◎ badges, tinted rows and the group's "Varning" pill on Dailys/Release. */
  showWarnings: boolean;
  /** Leave long-closed cards out of the daily flow. */
  hideStaleClosed: boolean;
  /** A closed card is "long-closed" once more than this many working days have passed. */
  staleClosedWorkingDays: number;
  /** The test board's card design - the original one-line rows, or cards with the title as header. */
  testCardLayout: TestCardLayout;
  /** On each test card: how long it has been in its current status. */
  showTestStatusAge: boolean;
  /** On each test card: when anything on it last changed. */
  showTestLastChanged: boolean;
}

export const DEFAULT_BOARD_SETTINGS: BoardSettings = {
  showWarnings: true,
  hideStaleClosed: true,
  // Closed on a Thursday: still there for Friday's daily, gone by Monday's.
  staleClosedWorkingDays: 1,
  testCardLayout: "rows",
  showTestStatusAge: true,
  showTestLastChanged: true,
};

const STORAGE_KEY = "avekiscrum.boardSettings";
// The one setting that existed before this store did - carried over so nobody's choice resets.
const LEGACY_SHOW_WARNINGS_KEY = "avekiscrum.dailys.showWarnings";

function read(): BoardSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    const stored = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Partial<BoardSettings>) : {};
    const legacyWarnings = localStorage.getItem(LEGACY_SHOW_WARNINGS_KEY);
    return {
      showWarnings: typeof stored.showWarnings === "boolean" ? stored.showWarnings : legacyWarnings !== "false",
      hideStaleClosed: typeof stored.hideStaleClosed === "boolean" ? stored.hideStaleClosed : DEFAULT_BOARD_SETTINGS.hideStaleClosed,
      staleClosedWorkingDays:
        typeof stored.staleClosedWorkingDays === "number" && stored.staleClosedWorkingDays >= 0
          ? stored.staleClosedWorkingDays
          : DEFAULT_BOARD_SETTINGS.staleClosedWorkingDays,
      testCardLayout: stored.testCardLayout === "cards" ? "cards" : "rows",
      showTestStatusAge:
        typeof stored.showTestStatusAge === "boolean" ? stored.showTestStatusAge : DEFAULT_BOARD_SETTINGS.showTestStatusAge,
      showTestLastChanged:
        typeof stored.showTestLastChanged === "boolean" ? stored.showTestLastChanged : DEFAULT_BOARD_SETTINGS.showTestLastChanged,
    };
  } catch {
    // Unreadable or disabled storage just means defaults - never a reason to fail a board.
    return DEFAULT_BOARD_SETTINGS;
  }
}

let current: BoardSettings = read();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changing a setting is picked up too, so two open boards never disagree.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    current = read();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function updateBoardSettings(patch: Partial<BoardSettings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* ignore - the change still applies for this session */
  }
  listeners.forEach((l) => l());
}

export function useBoardSettings(): BoardSettings {
  return useSyncExternalStore(subscribe, () => current);
}
