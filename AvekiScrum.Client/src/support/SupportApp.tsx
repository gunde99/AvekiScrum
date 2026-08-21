import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { NewBugForm } from "./NewBugForm";
import { SupportDashboard } from "./SupportDashboard";

type SupportView = "nytt" | "oversikt";

const NAV = [
  { id: "nytt", label: "Nytt ärende" },
  // Not "Mina ärenden": that's one of two tabs inside the view, and having the nav claim the same
  // name made the heading lie as soon as you switched to everyone else's.
  { id: "oversikt", label: "Ärenden" },
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
      title={view === "nytt" ? "Rapportera en bugg" : "Inrapporterade buggar"}
      subtitle={
        view === "nytt"
          ? "Fyll i det du vet – ärendet hamnar direkt i produktägarens backlogg."
          : "Allt supporten rapporterat in: dina egna ärenden, och alla andras."
      }
    >
      {view === "nytt" ? <NewBugForm onCreated={() => undefined} /> : <SupportDashboard />}
    </AppShell>
  );
}
