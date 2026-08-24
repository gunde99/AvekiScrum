import { useState } from "react";
import { useTheme } from "../theme/ThemeContext";
import { Diagnostics } from "../components/Diagnostics";
import { UserChip } from "../components/UserChip";
import "./LandingPage.css";

export type AppKey = "scrum" | "support";
export type TeamKey = "Nord" | "Syd";

interface LandingPageProps {
  /** For support, the team is irrelevant; for Scrum it decides which board opens. */
  onPick: (app: AppKey, team?: TeamKey) => void;
}

interface TeamEntrance {
  key: TeamKey;
  product: string;
  image: string;
  imageAlt: string;
  body: string;
}

/**
 * The two teams behind AvekiScrum, named by the product each one owns rather than by the compass
 * point - "Nord" means nothing until you know it's the myCarta team, and the boards are opened by
 * people who think in products.
 */
const TEAMS: TeamEntrance[] = [
  {
    key: "Nord",
    product: "myCarta",
    image: "/startbilder/nord-mycarta.jpg",
    imageAlt: "Topografisk karta med kompass",
    body: "Kartan, webbkartan och allt runt omkring – GIS-plattformen.",
  },
  {
    key: "Syd",
    product: "Energi- och VA-banken",
    image: "/startbilder/syd-vabanken.jpg",
    imageAlt: "Vattenledningar med ventiler mot en tegelvägg",
    body: "Vatten, avlopp och energi – ledningsnätet och verksamheten kring det.",
  },
];

interface Entrance {
  key: AppKey;
  brandPrefix: string;
  brandSuffix: string;
  image: string;
  /** Describes the photo for anyone who can't see it. */
  imageAlt: string;
  tagline: string;
  body: string;
  bullets: string[];
  cta: string;
}

const ENTRANCES: Entrance[] = [
  {
    key: "scrum",
    brandPrefix: "Aveki",
    brandSuffix: "Scrum",
    image: "/startbilder/scrum.jpg",
    imageAlt: "Ett team i möte framför en tavla med lappar",
    tagline: "För teamen",
    body: "Boarden för sprintens möten – planering, dailys, review och retro på ett ställe, utan att gå omvägen via Azure DevOps.",
    bullets: ["Dailys med flöde per utvecklare och sprintmål", "Review-taggning och rapport till Teams", "Korthygien och DoR direkt i kortet"],
    cta: "Öppna AvekiScrum",
  },
  {
    key: "support",
    brandPrefix: "Aveki",
    brandSuffix: "Support",
    image: "/startbilder/support.jpg",
    imageAlt: "Supportmedarbetare med headset vid sina datorer",
    tagline: "För supporten",
    body: "Rapportera en bugg på någon minut och följ den hela vägen – utan att behöva lära dig Azures gränssnitt.",
    bullets: ["Färdig mall för repro steps", "Kunder och kontakter formateras alltid lika", "Se var ärendet ligger i flödet"],
    cta: "Öppna AvekiSupport",
  },
];

/**
 * The start page: two doors, one per tool. The people who use AvekiSupport open it a handful of
 * times a year, so the entrance has to say what's behind it rather than assume anyone recognises
 * the name - hence the photographs and the plain-language summaries.
 */
export function LandingPage({ onPick }: LandingPageProps) {
  const { theme, toggleTheme } = useTheme();
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  // Picking AvekiScrum turns the two doors into two teams rather than navigating away: the boards
  // are per team, and choosing here saves the switch-and-reload that opening the wrong one costs.
  const [choosingTeam, setChoosingTeam] = useState(false);

  return (
    <div className="landing">
      <header className="landing__top">
        <div className="landing__wordmark">
          Aveki<span>·</span>
        </div>
        {/* Sign-in happens before this page renders and covers both tools, so this is where it
            belongs - you know who you are before you pick a door, not after. */}
        <div className="landing__identity">
          <UserChip />
        </div>
        <button
          type="button"
          className="landing__theme-toggle"
          onClick={toggleTheme}
          title={theme === "dark" ? "Byt till ljust läge" : "Byt till mörkt läge"}
          aria-label="Växla mellan ljust och mörkt läge"
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
      </header>

      <div className="landing__intro">
        <h1>{choosingTeam ? "Vilket team?" : "Vad ska du göra idag?"}</h1>
        <p>
          {choosingTeam ? "Boarden öppnas för teamets sprint." : "Välj ingång. Du kan alltid byta uppe till vänster."}
        </p>
      </div>

      {choosingTeam ? (
        <div className="landing__cards">
          {TEAMS.map((team) => (
            <button
              key={team.key}
              type="button"
              className={`landing-card landing-card--team landing-card--team-${team.key.toLowerCase()}`}
              onClick={() => onPick("scrum", team.key)}
            >
              <div className="landing-card__photo">
                <img src={team.image} alt={team.imageAlt} loading="lazy" />
                <span className="landing-card__tagline">Team {team.key}</span>
              </div>
              <div className="landing-card__body">
                <h2 className="landing-card__title">{team.product}</h2>
                <p className="landing-card__text">{team.body}</p>
                <span className="landing-card__cta">
                  Öppna boarden
                  <span aria-hidden="true">→</span>
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="landing__cards">
          {ENTRANCES.map((entrance) => (
            <button
              key={entrance.key}
              type="button"
              className={`landing-card landing-card--${entrance.key}`}
              onClick={() => (entrance.key === "scrum" ? setChoosingTeam(true) : onPick(entrance.key))}
            >
              <div className="landing-card__photo">
                <img src={entrance.image} alt={entrance.imageAlt} loading="lazy" />
                <span className="landing-card__tagline">{entrance.tagline}</span>
              </div>
              <div className="landing-card__body">
                <h2 className="landing-card__title">
                  {entrance.brandPrefix}
                  <span>{entrance.brandSuffix}</span>
                </h2>
                <p className="landing-card__text">{entrance.body}</p>
                <ul className="landing-card__bullets">
                  {entrance.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
                <span className="landing-card__cta">
                  {entrance.cta}
                  <span aria-hidden="true">→</span>
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {choosingTeam && (
        <div className="landing__back">
          <button type="button" className="diag-open" onClick={() => setChoosingTeam(false)}>
            ← Tillbaka
          </button>
        </div>
      )}

      {/* Discreet on purpose: nobody needs it until something is wrong, and then it needs to be
          somewhere obvious. */}
      <footer className="landing__foot">
        <button type="button" className="diag-open" onClick={() => setShowDiagnostics(true)}>
          Diagnostik
        </button>
      </footer>

      {showDiagnostics && <Diagnostics onClose={() => setShowDiagnostics(false)} />}
    </div>
  );
}
