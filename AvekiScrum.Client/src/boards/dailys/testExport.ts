import { matchPersonImage } from "../../components/personImages";
import {
  ageChangeLabel,
  ageSourceDate,
  classifyTestStatus,
  groupTestTasks,
  sortTestTasks,
  statusAge,
  statusBadgeClass,
  testResultFromTags,
  PRIORITY_EMOJI,
  PRIORITY_LABELS,
  type TestTaskRow,
} from "./testBoardLogic";

/** Same two icons workItemTypeConfig.ts uses in the live app - not imported from there, since its
 *  `color` values are var(--cat-dev) etc., custom properties this standalone document never
 *  defines. */
function storyIcon(storyType: string): string {
  return storyType === "Bug" ? "🐞" : "📖";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Same accent palette PersonAvatar.tsx draws from - literal hex here since a downloaded file has
// no stylesheet importing the app's design tokens to resolve var(--aveki-orange) etc. against.
const AVATAR_PALETTE = ["#ea5b1b", "#0f4170", "#9dbf21", "#3c6288", "#ed783e"];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

// On-screen an avatar is 24px; this leaves headroom for a retina display without embedding the
// source photo at whatever multi-megapixel resolution it happens to have been saved at - which
// is what was pushing the export past 100MB with a few dozen people in it.
const AVATAR_EXPORT_SIZE = 64;

/** Centre-crops to a square and scales down to AVATAR_EXPORT_SIZE, re-encoded as a compact JPEG -
 *  a photo that only ever displays at 24-48px doesn't need to carry its multi-megapixel source
 *  resolution into a downloaded file. */
async function downscaleImage(blob: Blob, size = AVATAR_EXPORT_SIZE): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    const srcSize = Math.min(bitmap.width, bitmap.height);
    const srcX = (bitmap.width - srcSize) / 2;
    const srcY = (bitmap.height - srcSize) / 2;
    ctx.drawImage(bitmap, srcX, srcY, srcSize, srcSize, 0, 0, size, size);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    bitmap.close();
  }
}

/** Fetches every distinct person's photo once (public/avekiimages, same origin as this app),
 *  downscales it, and inlines it as a data: URI - once downloaded, the file has no server behind
 *  it to serve /avekiimages/... from. Falls back to null (rendered as initials) for anyone without
 *  a matched photo, or whose fetch/decode fails. */
async function buildAvatarCache(names: Iterable<string>): Promise<Map<string, string | null>> {
  const cache = new Map<string, string | null>();
  const unique = [...new Set([...names].map((n) => n.trim()).filter(Boolean))];

  await Promise.all(
    unique.map(async (name) => {
      const url = matchPersonImage(name);
      if (!url) {
        cache.set(name, null);
        return;
      }
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(String(response.status));
        const blob = await response.blob();
        cache.set(name, await downscaleImage(blob));
      } catch {
        cache.set(name, null);
      }
    }),
  );

  return cache;
}

function personHtml(name: string | null, roleLabel: string, avatars: Map<string, string | null>): string {
  const display = name?.trim() || "Ej tilldelad";
  const photo = name?.trim() ? avatars.get(name.trim()) : null;
  const face = photo
    ? `<img class="avatar" src="${photo}" alt="" width="24" height="24">`
    : `<span class="avatar avatar--initials" style="background:${name?.trim() ? colorFor(display) : "#bebebe"}">${escapeHtml(
        name?.trim() ? initials(display) : "?",
      )}</span>`;
  return `<span class="person">${face}<span class="person__copy"><small>${escapeHtml(roleLabel)}</small><span>${escapeHtml(
    display,
  )}</span></span></span>`;
}

export interface TestExportOptions {
  teamLabel: string;
  sprintLabel: string;
  generatedAt: Date;
}

/**
 * Builds one self-contained HTML document from the test board's own data - all styling inline,
 * every avatar embedded as a data: URI, every card/story link pointing straight at Azure DevOps
 * (there's no backend behind a downloaded file to serve a form or an in-app modal from). Always
 * the full, unfiltered board grouped by status - the point is a complete handoff to someone who
 * isn't looking at the live board, not a snapshot of whatever filter happened to be active when
 * export was clicked.
 */
export async function buildTestBoardExportHtml(rows: TestTaskRow[], options: TestExportOptions): Promise<string> {
  const names = rows.flatMap((r) => [r.assignedTo, r.storyDeveloper].filter((n): n is string => !!n?.trim()));
  const avatars = await buildAvatarCache(names);

  // "asc" - oldest status change (or, for an assigned-not-started task, oldest assignment) first,
  // same default the live board sorts by, so the cards that have waited longest show up top.
  const groups = groupTestTasks(rows, "status").map((g) => ({
    ...g,
    tasks: sortTestTasks(g.tasks, "changed", "asc"),
  }));

  // One <table>, not one grid per group - that's what makes every column line up down the whole
  // board instead of just within each status section, and it's what makes a plain CSS :hover
  // highlight the entire row (a table row is one real element; the old flex/grid "card" wasn't).
  let rowIndex = 0;
  const rowsHtml = groups
    .map((group) => {
      const groupHeaderRow = `
        <tr class="grouprow">
          <td colspan="7">${escapeHtml(group.label)} <span class="count">${group.tasks.length}</span></td>
        </tr>`;
      const taskRows = group.tasks
        .map((t) => {
          rowIndex++;
          const bucket = classifyTestStatus(t);
          const verdict = testResultFromTags(t.tags);
          const age = statusAge(ageSourceDate(t, bucket), ageChangeLabel(bucket));
          const badgeText = verdict === "notok" ? "Test ej OK" : verdict === "ok" ? "Test OK" : t.status || "Ny";
          const priorityHtml = t.priority
            ? `<span class="prio prio--p${t.priority}" title="${escapeHtml(PRIORITY_LABELS[t.priority] ?? "")}">${PRIORITY_EMOJI[t.priority]} P${t.priority}</span>`
            : `<span class="prio prio--none">–</span>`;
          return `
            <tr class="row${rowIndex % 2 === 0 ? " row--even" : ""}">
              <td><span class="badge badge--${statusBadgeClass(bucket)}">${escapeHtml(badgeText)}</span></td>
              <td><a class="cardid" href="${escapeHtml(t.webUrl)}" target="_blank" rel="noreferrer">#${t.id}</a></td>
              <td>${priorityHtml}</td>
              <td>${personHtml(t.assignedTo, "Testare", avatars)}</td>
              <td>${personHtml(t.storyDeveloper, "Utvecklare", avatars)}</td>
              <td><span class="age age--${age.tone}" title="${escapeHtml(age.title)}">${escapeHtml(age.text)}</span></td>
              <td>
                <span class="longtext">
                  <span class="cardtitle">${escapeHtml(t.title)}</span>
                  <a class="story" href="${escapeHtml(t.storyWebUrl)}" target="_blank" rel="noreferrer">
                    <span class="story-icon">${storyIcon(t.storyType)}</span>
                    <span class="story-id">#${t.storyId}</span> ${escapeHtml(t.storyTitle)}
                  </a>
                </span>
              </td>
            </tr>`;
        })
        .join("");
      return groupHeaderRow + (taskRows || `<tr><td colspan="7" class="empty">Inga test-tasks i denna grupp.</td></tr>`);
    })
    .join("");

  const generatedLabel = options.generatedAt.toLocaleString("sv-SE", { dateStyle: "long", timeStyle: "short" });

  return `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Testboard – ${escapeHtml(options.teamLabel)} – ${escapeHtml(options.sprintLabel)}</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f3f1ec;
    --panel: #ffffff;
    --panel-subtle: #f6f4ee;
    --border: #e3dfd3;
    --text: #181818;
    --text-muted: #746f62;
    --orange: #ea5b1b;
    --danger: #c73e1d;
    --success: #4c8a2e;
    --info: #0f4170;
    --yellow: #fecd1a;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #121110;
      --panel: #1c1a17;
      --panel-subtle: #24211d;
      --border: #38332c;
      --text: #f3efe6;
      --text-muted: #a89f8d;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px;
    background: var(--bg);
    color: var(--text);
    font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
    font-size: 14px;
    width: 96%;
    max-width: 1900px;
    margin-inline: auto;
  }
  header {
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 2px solid var(--orange);
  }
  h1 { margin: 0 0 4px; font-size: 1.4rem; }
  header p { margin: 0; color: var(--text-muted); font-size: 0.85rem; }
  .count {
    color: var(--text-muted);
    font-weight: 400;
    font-size: 0.8rem;
  }
  /* One table for the whole board rather than one per status group - columns line up top to
     bottom across every section, not just within one, and a real <tr> is what lets a plain
     :hover highlight an entire row at once. */
  table.board {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
  }
  table.board td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  tr.row--even td {
    background: var(--panel-subtle);
  }
  /* One fixed hover colour regardless of the zebra stripe underneath - mixing a small percentage
     of orange into each row's own resting background (panel vs. panel-subtle) made the change on
     an already-tinted even row too close to its resting state to actually notice, so hover only
     read as visible on every other row. */
  tr.row:hover td,
  tr.row--even:hover td {
    background: color-mix(in srgb, var(--orange) 18%, var(--panel));
  }
  tr.grouprow td {
    padding: 10px 12px;
    background: var(--panel-subtle);
    border-bottom: 2px solid var(--orange);
    border-top: 1px solid var(--border);
    font-weight: 700;
    font-size: 0.95rem;
  }
  tr.grouprow:first-child td { border-top: none; }
  .badge {
    font-size: 0.62rem;
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--border);
    color: var(--text-muted);
    white-space: nowrap;
  }
  .badge--notok { background: var(--danger); color: #fff; }
  .badge--ok { background: var(--success); color: #fff; }
  .badge--blocked { background: var(--yellow); color: #1c1a17; }
  .badge--inprogress { background: var(--info); color: #fff; }
  .cardid {
    color: var(--orange);
    font-weight: 700;
    text-decoration: none;
    font-size: 0.8rem;
    white-space: nowrap;
  }
  .cardid:hover { text-decoration: underline; }
  /* Same red/blue/yellow/green convention as the priority picker on the live board (and the
     sprint goal planning doc it originally comes from). */
  .prio {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 2px 8px;
    font-size: 0.72rem;
    font-weight: 700;
    white-space: nowrap;
  }
  .prio--none { color: var(--text-muted); border-style: dashed; }
  .prio--p1 { border-color: var(--danger); color: var(--danger); }
  .prio--p2 { border-color: var(--info); color: var(--info); }
  .prio--p3 { border-color: var(--yellow); color: #a76400; }
  .prio--p4 { border-color: var(--success); color: var(--success); }
  .person { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
  .person__copy { display: flex; flex-direction: column; line-height: 1.2; }
  .person__copy small { color: var(--text-muted); font-size: 0.62rem; text-transform: uppercase; }
  .avatar { border-radius: 50%; width: 24px; height: 24px; object-fit: cover; flex-shrink: 0; }
  .avatar--initials {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 0.6rem;
    font-weight: 700;
  }
  .age { font-size: 0.75rem; color: var(--text-muted); white-space: nowrap; }
  .age--stale { color: var(--danger); font-weight: 700; }
  .age--aging { color: var(--orange); font-weight: 700; }
  .longtext { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .cardtitle { min-width: 0; overflow-wrap: anywhere; }
  .story {
    min-width: 0;
    color: var(--text-muted);
    font-size: 0.78rem;
    text-decoration: none;
  }
  .story:hover { text-decoration: underline; }
  .story-icon { margin-right: 2px; }
  .story-id { font-weight: 700; }
  .empty { color: var(--text-muted); font-style: italic; text-align: center; }
  footer { margin-top: 20px; padding-top: 12px; border-top: 1px solid var(--border); color: var(--text-muted); font-size: 0.75rem; }
  @media (max-width: 900px) {
    body { width: 100%; padding: 12px; }
    table.board, table.board tbody, table.board tr, table.board td { display: block; width: 100%; }
    tr.row { padding: 8px 0; border-bottom: 1px solid var(--border); }
    table.board td { border-bottom: none; padding: 2px 0; }
  }
</style>
</head>
<body>
  <header>
    <h1>Testboard – ${escapeHtml(options.teamLabel)}</h1>
    <p>${escapeHtml(options.sprintLabel)} · Exporterad ${escapeHtml(generatedLabel)} · ${rows.length} test-tasks</p>
  </header>
  <table class="board">
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
  <footer>Statisk export från AvekiScrum - länkarna ovan öppnar korten direkt i Azure DevOps.</footer>
</body>
</html>`;
}

/** Saves straight to the browser's default download location (normally Downloads) with no folder
 *  picker - an <a download> click is the only way a page can trigger a save without one. */
export function downloadHtmlFile(filename: string, html: string): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
