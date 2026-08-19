// Shared person-name formatting, used anywhere a board or component needs to turn an Azure
// DevOps display name (or, historically, an email local-part) into a consistent display form.
const KNOWN_NAME_PARTS: Record<string, string> = {
  bjorn: "Björn",
  goran: "Göran",
  jorgen: "Jörgen",
  lindstrom: "Lindström",
  bergstrom: "Bergström",
  angstrom: "Ångström",
};

function namePart(part: string): string {
  const lower = part.toLowerCase();
  if (KNOWN_NAME_PARTS[lower]) return KNOWN_NAME_PARTS[lower];
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// External/guest Azure identities sometimes have no real display name set, and render as
// "local.part domain.tld" instead (the @ effectively swapped for a space) - e.g. an external
// contractor shows up as "dennis.bergstrom invit.se". Detected here and treated like an email so
// the trailing domain doesn't get title-cased into the middle of someone's name.
const GUEST_EMAIL_PATTERN = /^([\w.-]+)\s+[\w-]+\.[a-z]{2,}$/i;

export function fullPersonName(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const guestEmailMatch = raw.match(GUEST_EMAIL_PATTERN);
  const local = raw.includes("@") ? raw.split("@")[0] : guestEmailMatch ? guestEmailMatch[1] : raw;
  const normalized = local.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.split(" ").map(namePart).join(" ");
}

export function compactPersonName(value: string | null | undefined): string {
  return fullPersonName(value).split(" ")[0] || "";
}

export function personKey(value: string | null | undefined): string {
  return (
    fullPersonName(value)
      .toLowerCase()
      .replace(/[._-]+/g, " ")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .split(/\s+/)
      .filter(Boolean)[0] ?? ""
  );
}

export function samePerson(a: string | null | undefined, b: string | null | undefined): boolean {
  const ak = personKey(a);
  const bk = personKey(b);
  return !!ak && !!bk && ak === bk;
}

export function uniqueNames(names: (string | null | undefined)[]): string[] {
  const result: string[] = [];
  for (const name of names) {
    const full = fullPersonName(name);
    if (!full || result.some((existing) => samePerson(existing, full))) continue;
    result.push(full);
  }
  return result;
}

export function reviewerNames(reviewers: string[] | null | undefined): string {
  const names = uniqueNames((reviewers ?? []).map((r) => r));
  return names.length ? names.join("/") : "–";
}
