import { useState, type ReactNode } from "react";
import { AppShell } from "./AppShell";
import { TalkingPointsModal } from "./TalkingPointsModal";
import type { DeveloperTeamId } from "../api/dailys";

const BOARDS = [
  { id: "planering", label: "Planering", enabled: false },
  { id: "refinement", label: "Refinement", enabled: true },
  { id: "dailys", label: "Dailys", enabled: true },
  { id: "review", label: "Review", enabled: true },
  { id: "test", label: "Test", enabled: true },
  { id: "retro", label: "Retro", enabled: false },
] as const;

export type BoardId = (typeof BOARDS)[number]["id"];

/** The boards that actually exist. The others are shown in the nav but disabled, so navigation
 *  can only ever emit one of these - which is what lets the boards themselves narrow their prop. */
export type NavigableBoardId = Extract<BoardId, "refinement" | "dailys" | "review" | "test">;

interface BoardShellProps {
  activeBoard: BoardId;
  title: string;
  /** Usually a plain string, but the sprint line is interactive (see SprintPicker), hence ReactNode. */
  subtitle?: ReactNode;
  /** Switches board. Only the enabled ones are clickable. */
  onNavigate?: (board: NavigableBoardId) => void;
  /** Back to the start page, where the other app lives. */
  onHome?: () => void;
  /** The team every board tab now shares - see AppShell's own doc comment on why this lives here
   *  rather than on each board. Also seeds the "Saker att ta upp" gear button's own team filter. */
  team?: DeveloperTeamId;
  onTeamChange?: (team: DeveloperTeamId) => void;
  children: ReactNode;
}

// AvekiScrum's boards, in the shell both apps share. No AvekiScrum wordmark/logo asset is
// available yet (see docs/Grafisk profil.pdf) - using a styled text placeholder until the real
// logotype files are sourced.
export function BoardShell({ activeBoard, title, subtitle, onNavigate, onHome, team, onTeamChange, children }: BoardShellProps) {
  const [showTalkingPoints, setShowTalkingPoints] = useState(false);

  return (
    <>
      <AppShell
        brandPrefix="Aveki"
        brandSuffix="Scrum"
        nav={BOARDS.map((board) => ({ id: board.id, label: board.label, enabled: board.enabled }))}
        activeId={activeBoard}
        onNavigate={(id) => onNavigate?.(id as NavigableBoardId)}
        onHome={onHome}
        title={title}
        subtitle={subtitle}
        team={team}
        onTeamChange={onTeamChange}
        headerExtra={
          // Discreet on purpose - this is a personal SM tool bolted onto a shared board, not a
          // feature every visitor needs to notice. A modal (not a nav tab/route) so opening it
          // never unmounts whatever board - and its live state, e.g. a running daily flow - sits
          // behind it.
          <button
            type="button"
            className="board-shell__settings-gear"
            onClick={() => setShowTalkingPoints(true)}
            title="Saker att ta upp"
            aria-label="Saker att ta upp"
          >
            ⚙️
          </button>
        }
      >
        {children}
      </AppShell>
      {showTalkingPoints && <TalkingPointsModal team={team ?? "Nord"} onClose={() => setShowTalkingPoints(false)} />}
    </>
  );
}
