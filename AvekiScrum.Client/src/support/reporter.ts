const STORAGE_KEY = "avekisupport.reporter";

/**
 * Who is filing the bug. There is no sign-in yet (the Api runs on a shared PAT, so Azure's
 * CreatedBy says the same name on every card) - so the reporter names themselves once and the
 * browser remembers it. That name is written into the card's Buggrapportör line, which is also
 * what "mina ärenden" filters on.
 *
 * Replace this with the Aveki ID identity as soon as sign-in exists; the rest of the support tool
 * only ever asks for the name.
 */
export function loadReporter(): string {
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() ?? "";
  } catch {
    // Private mode / storage disabled - the form just asks again each time.
    return "";
  }
}

export function saveReporter(name: string): void {
  try {
    const trimmed = name.trim();
    if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do - remembering the name is a convenience, not a requirement */
  }
}
