/**
 * The three sections from Azure's own "Hjälptextmall" Task template (Dokumentation project, Task
 * templates), as separate fields - same reasoning as AvekiSupport's repro-steps split: nobody
 * drops a heading by accident, and every card comes out in the same shape TD already expects.
 */
export interface HelpTextRequestParts {
  topic: string;
  change: string;
  screenshots: string;
}

export interface HelpTextRequestField {
  key: keyof HelpTextRequestParts;
  heading: string;
  hint: string;
  placeholder: string;
  rows: number;
}

export const HELPTEXT_FIELDS: HelpTextRequestField[] = [
  {
    key: "topic",
    heading: "Ny eller befintlig topic?",
    hint: "Om befintlig - bifoga länk och beskriv vad som ska granskas i hela texten.",
    placeholder: "Ny topic om…  /  Befintlig topic: <länk>",
    rows: 3,
  },
  {
    key: "change",
    heading: "Ändring",
    hint: "Var tydligt med var i programmet ändringen är och vad som är nytt eller ska tas bort. Större ändringar - bifoga hellre ett Word-dokument, ett dokument per topic.",
    placeholder: "Vad ska stå i hjälptexten, eller vad ska ändras i den befintliga?",
    rows: 6,
  },
  {
    key: "screenshots",
    heading: "Skärmbild(er)",
    hint: "Som stöd för teknisk dokumentatör att se var i programmet ändringen hör hemma - klistra in en bild på var i strukturen topicen ska ligga.",
    placeholder: "Klistra in bild(er) här…",
    rows: 3,
  },
];

export const EMPTY_HELPTEXT_PARTS: HelpTextRequestParts = {
  topic: "",
  change: "",
  screenshots: "",
};

/** True when a field from the rich-text editor holds anything but empty markup. */
function hasContent(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0 || /<img\b/i.test(html);
}

/** Enough to be worth a konsults time - the topic question and the change itself. Screenshots are
 *  a nice-to-have, not everything needs one. */
export function hasEnoughHelpTextDetail(parts: HelpTextRequestParts): boolean {
  return hasContent(parts.topic) && hasContent(parts.change);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The parts joined into the Task's Description, same headings and order every time - Html, not
 *  markdown, since Azure DevOps stores and renders System.Description as html. */
export function composeHelpTextDescription(parts: HelpTextRequestParts): string {
  return HELPTEXT_FIELDS.map((field) => {
    const value = parts[field.key].trim();
    return `<div><b>${escapeHtml(field.heading)}:</b></div>${value ? `<div>${value}</div>` : "<div><br></div>"}`;
  }).join("<div><br></div>");
}
