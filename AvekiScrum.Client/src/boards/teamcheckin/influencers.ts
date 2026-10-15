// Shared bits of Teamavstämning's "influencer" inslag: the four contribution categories the drawn
// developers choose freely between, date helpers for "nästa möte", and the reminder mail.

export interface InfluencerCategory {
  icon: string;
  title: string;
  description: string;
}

export const INFLUENCER_CATEGORIES: InfluencerCategory[] = [
  {
    icon: "🧩",
    title: "Veckans kluring",
    description: "Något du funderar på, inte lyckats lösa eller vill höra andras åsikter om. Det behöver inte finnas ett rätt svar.",
  },
  {
    icon: "💡",
    title: "Visa något smart",
    description: "Ett knep, ett användbart verktyg, en funktion i produkten eller något du upptäckt som andra kanske inte känner till.",
  },
  {
    icon: "📚",
    title: "Veckans lärdom eller misstag",
    description: "Något som inte blev som du tänkt, något överraskande eller något du kommer göra annorlunda nästa gång.",
  },
  {
    icon: "🔧",
    title: "Veckans förbättringsidé",
    description: "Något i vår vardag som skulle kunna fungera bättre. Det räcker att lyfta idén, du behöver inte ha en färdig lösning.",
  },
];

export const INFLUENCER_GROUND_RULE =
  "Max 3–5 minuter per person, följt av några minuters frågor. Ingen PowerPoint behövs – ett skärmklipp, en fråga eller en berättelse räcker. Är man obekväm med att presentera går det utmärkt att bara lyfta en fråga till gruppen.";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

/** The meeting is weekly, so "nästa möte" defaults to the same weekday next week - the lottery is
 *  run during the meeting. Editable in the panel for holiday weeks. */
export function nextMeetingIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return toIsoDate(d);
}

/** "tisdag 20 oktober" - parsed as a local date, never via Date("yyyy-MM-dd") (which is UTC). */
export function formatMeetingDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" });
}

export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? displayName;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} och ${names[names.length - 1]}`;
}

/**
 * A mailto: link to everyone currently in the panel. mailto rather than sending server-side: the
 * Api has no mail-sending capability (and Graph Mail.Send would need its own admin consent), and
 * opening it in the sender's own Outlook means the mail comes from a real person, with their own
 * signature, and can be tweaked before it goes out. Plain text without emoji on purpose - some
 * Outlook versions mangle non-ASCII symbols in a mailto body.
 */
export function buildReminderMailto(people: { email: string; displayName: string }[], meetingDateIso: string): string {
  const dateText = formatMeetingDate(meetingDateIso);
  const subject = `Nästa veckas influencer på Teamavstämningen – ${dateText}`;
  const greeting = `Hej ${joinNames(people.map((p) => firstName(p.displayName)))}!`;
  const lines = [
    greeting,
    "",
    `Lotten har talat – ${people.length === 1 ? "du är" : "ni är"} nästa veckas influencer${people.length === 1 ? "" : "s"} på Teamavstämningen ${dateText}.`,
    "",
    "Välj fritt ett av följande:",
    "",
    ...INFLUENCER_CATEGORIES.flatMap((c) => [`* ${c.title}`, `  ${c.description}`, ""]),
    INFLUENCER_GROUND_RULE,
    "",
    "Det viktiga är inte att ha något imponerande att visa, utan att dela något som kan väcka tankar, hjälpa en kollega eller starta en diskussion.",
    "",
    "Kan du inte den dagen? Byt gärna med en kollega och säg till.",
    "",
    "Vi ses på Teamavstämningen!",
  ];
  const to = people.map((p) => p.email).join(",");
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\r\n"))}`;
}
