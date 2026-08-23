import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { uploadAttachment } from "../../api/attachments";
import { isAttachmentUrl, toAttachmentBlobUrl } from "../../lib/apiFetch";
import "./RichTextEditor.css";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:5273";

interface RichTextEditorProps {
  /** The field's html, exactly as Azure DevOps stores it. */
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minRows?: number;
}

/**
 * The editor for work item text fields.
 *
 * Azure DevOps stores Description, Repro Steps and comments as **html**, and its own editor shows
 * pasted screenshots inline while you type. This does the same, for two reasons that turn out to be
 * the same reason: the team already knows that behaviour, and writing markdown into an html field
 * is what made our cards come out showing `![](...)` as literal text in Azure.
 *
 * Images are the fiddly part. Attachments are fetched through our Api with a token, which an `<img>`
 * can't send, so what's displayed is a blob URL while the real Azure URL rides along in `data-src` -
 * and it's the real one that gets written back. Nothing that leaves this component ever contains a
 * blob URL.
 */
export function RichTextEditor({ value, onChange, placeholder, minRows = 4 }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What we last handed upward. Comparing against it stops the caret from jumping to the start on
  // every keystroke, which is what happens if innerHTML is rewritten from a value we just emitted.
  const lastEmitted = useRef<string | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (value === lastEmitted.current) return;

    editor.innerHTML = value ?? "";
    lastEmitted.current = value ?? "";
    void resolveImages(editor);
  }, [value]);

  function emit() {
    const editor = editorRef.current;
    if (!editor) return;
    const html = toStorageHtml(editor);
    lastEmitted.current = html;
    onChange(html);
  }

  async function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItem = Array.from(items).find((item) => item.type.startsWith("image/"));
    if (imageItem) {
      const blob = imageItem.getAsFile();
      if (!blob) return;

      e.preventDefault();
      setError(null);
      setUploading(true);
      try {
        const extension = blob.type.split("/")[1] || "png";
        const fileName = `pasted-${Date.now()}.${extension}`;
        const uploaded = await uploadAttachment(blob, fileName);
        const displayUrl = await toAttachmentBlobUrl(uploaded.url, API_BASE_URL);
        // data-src holds Azure's own url - that is what the card is saved with, so the image shows
        // up when the same card is opened in Azure DevOps. src is only what this browser can render.
        insertHtmlAtCaret(
          `<img src="${escapeAttribute(displayUrl)}" data-src="${escapeAttribute(uploaded.azureUrl)}" alt="${escapeAttribute(fileName)}">`,
        );
        emit();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Kunde inte ladda upp bilden.");
      } finally {
        setUploading(false);
      }
      return;
    }

    // Plain text rather than the clipboard's html. Pasting from Word or Outlook otherwise drags in
    // font stacks and inline css - which is exactly the mess the Stakeholders field is full of.
    const text = e.clipboardData.getData("text/plain");
    if (text) {
      e.preventDefault();
      insertTextAtCaret(text);
      emit();
    }
  }

  return (
    <div className="rte">
      <div
        ref={editorRef}
        className="rte__editor"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        style={{ minHeight: `${minRows * 1.6 + 1}em` }}
        onInput={emit}
        onBlur={emit}
        onPaste={handlePaste}
      />
      {/* Only speaks up when it has something to say. Pasting an image shows the image, which
          explains itself better than a line of text under every box on the page did. */}
      {(uploading || error) && (
        <div className="rte__footer">
          {uploading && <span className="rte__uploading">Laddar upp bild…</span>}
          {error && <span className="rte__error">{error}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * The editor's html with display-only artefacts undone: blob URLs swapped back for the Azure
 * attachment URLs they stand in for.
 */
function toStorageHtml(editor: HTMLElement): string {
  const clone = editor.cloneNode(true) as HTMLElement;
  for (const img of Array.from(clone.querySelectorAll("img"))) {
    const real = img.getAttribute("data-src");
    if (real) {
      img.setAttribute("src", real);
      img.removeAttribute("data-src");
    }
  }
  const html = clone.innerHTML.trim();
  // An empty contentEditable reports "<br>", which would be saved as a stray line break.
  return html === "<br>" ? "" : html;
}

/** Swaps attachment URLs for blob URLs so the images actually render inside the editor. */
async function resolveImages(editor: HTMLElement): Promise<void> {
  for (const img of Array.from(editor.querySelectorAll("img"))) {
    const src = img.getAttribute("src");
    if (!src || img.hasAttribute("data-src") || !isAttachmentUrl(src, API_BASE_URL)) continue;
    const blobUrl = await toAttachmentBlobUrl(src, API_BASE_URL);
    if (blobUrl === src) continue;
    img.setAttribute("data-src", src);
    img.setAttribute("src", blobUrl);
  }
}

/**
 * execCommand is formally deprecated, but it is still the only thing that inserts at the caret and
 * lands in the browser's own undo stack in every browser we care about. The Range-based alternative
 * breaks Ctrl+Z, which people notice immediately.
 */
function insertHtmlAtCaret(html: string): void {
  document.execCommand("insertHTML", false, html);
}

function insertTextAtCaret(text: string): void {
  document.execCommand("insertText", false, text);
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
