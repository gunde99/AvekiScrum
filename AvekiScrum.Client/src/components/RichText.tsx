import { useEffect, useRef } from "react";
import { isAttachmentUrl, toAttachmentBlobUrl } from "../lib/apiFetch";
import { renderWorkItemContent } from "../lib/renderMarkdown";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:5273";

interface RichTextProps {
  /** Raw work item content - markdown, or the html Azure sometimes stores. */
  content: string | null | undefined;
  className?: string;
  /** Shown when there is nothing to render. */
  fallbackHtml?: string;
}

/**
 * Renders a work item's text, with its embedded images.
 *
 * The images need this component to exist at all: attachments are proxied by our Api, which
 * requires a token now, and an `<img src>` can't send one. So after the html is in the DOM each
 * attachment image is refetched with the token and swapped for a blob URL.
 */
export function RichText({ content, className, fallbackHtml }: RichTextProps) {
  const ref = useRef<HTMLDivElement>(null);
  const html = renderWorkItemContent(content) || fallbackHtml || "";

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    let cancelled = false;
    const created: string[] = [];

    for (const img of Array.from(container.querySelectorAll("img"))) {
      const src = img.getAttribute("src");
      if (!src || !isAttachmentUrl(src, API_BASE_URL)) continue;
      void toAttachmentBlobUrl(src, API_BASE_URL).then((blobUrl) => {
        if (cancelled || blobUrl === src) return;
        created.push(blobUrl);
        img.setAttribute("src", blobUrl);
      });
    }

    return () => {
      cancelled = true;
      // Blob URLs live until revoked, and this component re-renders on every tab switch.
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [html]);

  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
