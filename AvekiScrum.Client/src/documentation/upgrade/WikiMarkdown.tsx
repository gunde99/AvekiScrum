import { useEffect, useMemo, useRef } from "react";
import { marked } from "marked";
import { toAttachmentBlobUrl } from "../../lib/apiFetch";
import { upgradeAttachmentUrl } from "../../api/upgrade";

// Wiki pages reference images as /.attachments/<name>, which only the wiki itself can serve.
const ATTACHMENT_RE = /\]\((\/\.attachments\/[^)\s]+)\)/g;

/** The page's "> **Gäller:** …" first line is shown as a chip by the caller, not repeated in the body. */
function stripAppliesTo(markdown: string): string {
  return markdown.replace(/^\s*>\s*\*\*Gäller:\*\*[^\n]*\n+/, "");
}

function renderWikiMarkdown(markdown: string, hideAppliesTo = true): string {
  const source = (hideAppliesTo ? stripAppliesTo(markdown) : markdown).replace(
    ATTACHMENT_RE,
    (_m, path: string) => `](${upgradeAttachmentUrl(decodeURIComponent(path))})`,
  );
  return marked.parse(source, { async: false, gfm: true, breaks: false }) as string;
}

/**
 * A wiki page rendered the way the wiki renders it. Images go through our proxy; with sign-in on, an
 * <img> can't carry the token, so each one is swapped for a blob fetched with it (same approach as
 * RichText).
 */
export function WikiMarkdown({ markdown, className }: { markdown: string; className?: string }) {
  const html = useMemo(() => renderWikiMarkdown(markdown), [markdown]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let cancelled = false;
    const created: string[] = [];
    root.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src") ?? "";
      if (!src.includes("/api/documentation/upgrade/attachments")) return;
      void toAttachmentBlobUrl(src).then((blobUrl) => {
        if (cancelled || blobUrl === src) return;
        created.push(blobUrl);
        img.setAttribute("src", blobUrl);
      });
    });
    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [html]);

  return <div ref={ref} className={"upg-md" + (className ? ` ${className}` : "")} dangerouslySetInnerHTML={{ __html: html }} />;
}
