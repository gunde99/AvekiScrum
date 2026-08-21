import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { NewBugForm } from "./NewBugForm";
import { SupportDashboard } from "./SupportDashboard";

type SupportView = "nytt" | "oversikt";

const NAV = [
  { id: "nytt", label: "Nytt ärende" },
  { id: "oversikt", label: "Mina ärenden" },
];

interface SupportAppProps {
  onHome: () => void;
}

/**
 * AvekiSupport: two views, and that's on purpose. The people using it report a handful of bugs a
 * year, so anything beyond "skriv ett ärende" and "hur går det med mina" is in the way.
 */
export function SupportApp({ onHome }: SupportAppProps) {
  const [view, setView] = useState<SupportView>("nytt");

  return (
    <AppShell
      brandPrefix="Aveki"
      brandSuffix="Support"
      nav={NAV}
      activeId={view}
      onNavigate={(id) => setView(id as SupportView)}
      onHome={onHome}
      title={view === "nytt" ? "Rapportera en bugg" : "Mina ärenden"}
      subtitle={
        view === "nytt"
          ? "Fyll i det du vet – ärendet hamnar direkt i produktägarens backlogg."
          : "Följ dina inrapporterade buggar, och se vad som är på gång i övrigt."
      }
    >
      {view === "nytt" ? <NewBugForm onCreated={() => undefined} /> : <SupportDashboard />}
    </AppShell>
  );
}
