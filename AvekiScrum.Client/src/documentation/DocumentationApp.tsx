import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { DocumentationList } from "./DocumentationList";
import { HelpTextSideBySide } from "./HelpTextSideBySide";
import type { DocumentationHelpTextTask } from "../api/documentation";

type DocumentationView = "konsult" | "dokumentator";

const NAV = [
  { id: "konsult", label: "Konsult" },
  { id: "dokumentator", label: "Dokumentatör" },
];

interface DocumentationAppProps {
  onHome: () => void;
}

/**
 * AvekiDokumentation: the two people who touch a hjälptext-Task after "Beställ hjälptext" was
 * clicked on a US/Bug in AvekiScrum. Both views read the same list, split by state - a konsult
 * writes the text while it's open, and closing the card (from either side's "Redigera") is the
 * hand-off signal: it's what moves the card into the dokumentatör's queue. Neither role needs a
 * separate "mark as done" step or to know anything about the other's tool.
 */
export function DocumentationApp({ onHome }: DocumentationAppProps) {
  const [view, setView] = useState<DocumentationView>("konsult");
  const [openTaskId, setOpenTaskId] = useState<number | null>(null);
  // Bumped whenever the side-by-side view is closed, so a card just closed there (marking it
  // "klart") shows up in the dokumentatör tab immediately, without a manual refresh.
  const [refreshSignal, setRefreshSignal] = useState(0);

  function openTask(task: DocumentationHelpTextTask) {
    setOpenTaskId(task.id);
  }

  function closeTask() {
    setOpenTaskId(null);
    setRefreshSignal((s) => s + 1);
  }

  return (
    <AppShell
      brandPrefix="Aveki"
      brandSuffix="Dokumentation"
      nav={NAV}
      activeId={view}
      onNavigate={(id) => setView(id as DocumentationView)}
      onHome={onHome}
      title={view === "konsult" ? "Hjälptexter att skriva" : "Hjälptexter att granska"}
      subtitle={
        view === "konsult"
          ? "Hjälptextkort som väntar på text - öppna ett för att skriva, med källkortet bredvid. Stäng kortet (sätt State till Closed) när texten är klar."
          : "Hjälptextkort en konsult har stängt - redo att föras in i dokumentationssystemet."
      }
    >
      {view === "konsult" ? (
        <DocumentationList
          onOpen={openTask}
          defaultScope="mine"
          statusFilter="open"
          allLabel="Alla öppna"
          emptyHint="Inga hjälptextkort väntar just nu."
          refreshSignal={refreshSignal}
        />
      ) : (
        <DocumentationList
          onOpen={openTask}
          defaultScope="all"
          statusFilter="done"
          allLabel="Alla klara"
          emptyHint="Inget att granska just nu."
          refreshSignal={refreshSignal}
        />
      )}

      {openTaskId !== null && <HelpTextSideBySide taskId={openTaskId} onClose={closeTask} />}
    </AppShell>
  );
}
