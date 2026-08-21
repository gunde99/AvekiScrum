import type { ReactNode } from "react";
import { AppShell } from "./AppShell";

const BOARDS = [
  { id: "planering", label: "Planering", enabled: false },
  { id: "dailys", label: "Dailys", enabled: true },
  { id: "review", label: "Review", enabled: true },
  { id: "retro", label: "Retro", enabled: false },
] as const;

export type BoardId = (typeof BOARDS)[number]["id"];

/** The boards that actually exist. The others are shown in the nav but disabled, so navigation
 *  can only ever emit one of these - which is what lets the boards themselves narrow their prop. */
export type NavigableBoardId = Extract<BoardId, "dailys" | "review">;

interface BoardShellProps {
  activeBoard: BoardId;
  title: string;
  subtitle?: string;
  /** Switches board. Only the enabled ones are clickable. */
  onNavigate?: (board: NavigableBoardId) => void;
  /** Back to the start page, where the other app lives. */
  onHome?: () => void;
  children: ReactNode;
}

// AvekiScrum's four boards, in the shell both apps share. No AvekiScrum wordmark/logo asset is
// available yet (see docs/Grafisk profil.pdf) - using a styled text placeholder until the real
// logotype files are sourced.
export function BoardShell({ activeBoard, title, subtitle, onNavigate, onHome, children }: BoardShellProps) {
  return (
    <AppShell
      brandPrefix="Aveki"
      brandSuffix="Scrum"
      nav={BOARDS.map((board) => ({ id: board.id, label: board.label, enabled: board.enabled }))}
      activeId={activeBoard}
      onNavigate={(id) => onNavigate?.(id as NavigableBoardId)}
      onHome={onHome}
      title={title}
      subtitle={subtitle}
    >
      {children}
    </AppShell>
  );
}
