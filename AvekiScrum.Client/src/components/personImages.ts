// Source of truth for who has a photo: WorkOrganizer.UI.WinForms/appsettings.json's
// DashboardBranding.ImageByUserId, copied here since AvekiScrum is a separate codebase
// (see AvekiScrum/docs/SCRUM_WEB_APP_SPEC.md §5). Keyed by the words guessable from the
// person's email local-part; matched against their actual Azure DevOps display name,
// which sometimes includes extra middle names the email doesn't (e.g. "Alva Widerberg
// Palmfeldt" vs "alva.palmfeldt@aveki.se") - see matchPersonImage's subset-word logic.
interface PersonImageEntry {
  words: string[];
  file: string;
}

const RAW_ENTRIES: [string, string][] = [
  ["alexander.bohlin", "Alex.jpg"],
  ["alva.palmfeldt", "Alva.jpg"],
  ["andreas.petersson", "Andreas.jpg"],
  ["chica.robertsson", "Chica.jpg"],
  ["christel.flykt", "Christel.jpg"],
  ["daniel.lonnblom", "DanielL.jpg"],
  ["daniel.nordstrom", "DanielN.jpg"],
  ["dennis.bergstrom", "dennis_sv.jpg"],
  ["elin.jonsson", "Elin.jpg"],
  ["eva.alhindy", "Eva.jpg"],
  ["fatme.mustafa", "Fatme.jpg"],
  ["fereshteh.abrahamson", "Fereshteh.jpg"],
  ["fredrik.forsander", "Fredrik.jpg"],
  ["goran.klensmeden", "Göran.jpg"],
  ["henrik.rundqvist", "Henrik.jpg"],
  ["ida.rissanen", "Ida  Andersson.jpg"],
  ["johan.marand", "JohanM.jpg"],
  ["johan.strand", "JohanS.jpg"],
  ["johan.sundin", "JohanS.jpg"],
  ["jonatan.olers", "JonatanO.jpg"],
  ["jonathan.higgins", "JonathanH.jpg"],
  ["lina.samor", "Lina.jpg"],
  ["linn.gunnarsson", "Linn.jpg"],
  ["linn.nordlund", "Linn.jpg"],
  ["magnus.jongren", "Magnus.jpg"],
  ["maria.fagrell", "Maria.jpg"],
  ["marie.ansmo", "Marie.jpg"],
  ["martin.holmberg", "Martin.jpg"],
  ["mattias.andersson", "Mattias.jpg"],
  ["mattias.berglie", "Mattias.png"],
  ["mike.fredriksson", "Mike.jpg"],
  ["miro.cepciansky", "Miro.jpg"],
  ["peo.krook", "Peo.jpg"],
  ["per.ahlinder", "Per svvit mörkare.jpg"],
  ["sofie.backo", "Sofie.jpg"],
  ["stefan.peterson", "Stefan.jpg"],
  ["therese.mccarthy", "Therese.jpg"],
  ["thomas.nordkvist", "Thomas.jpg"],
  ["tom.wilhelmsson", "Tom.jpg"],
  ["torkel.endoff", "Torkel.jpg"],
  ["viktor.loby", "Viktor.jpg"],
  ["fanny.uhr", "Fanny.jpg"],
];

function normalizeWords(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .split(/[^a-z]+/)
    .filter(Boolean);
}

const ENTRIES: PersonImageEntry[] = RAW_ENTRIES.map(([localPart, file]) => ({
  words: normalizeWords(localPart.replace(/\./g, " ")),
  file,
}));

/** Resolves a public/avekiimages URL for a display name, or null if no confident match exists. */
export function matchPersonImage(displayName: string | null | undefined): string | null {
  const nameWords = new Set(normalizeWords(displayName ?? ""));
  if (nameWords.size === 0) return null;

  let best: PersonImageEntry | null = null;
  for (const entry of ENTRIES) {
    if (entry.words.every((w) => nameWords.has(w))) {
      if (!best || entry.words.length > best.words.length) best = entry;
    }
  }
  return best ? `/avekiimages/${encodeURIComponent(best.file)}` : null;
}
