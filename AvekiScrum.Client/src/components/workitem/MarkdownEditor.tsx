import { useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import { uploadAttachment } from "../../api/attachments";
import "./MarkdownEditor.css";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  /** Starts at `rows` and grows with the text instead of scrolling inside a fixed box - for
   *  places like the comment composer that should be one line at rest. */
  autoGrow?: boolean;
  /** Ceiling for autoGrow, in pixels, after which it scrolls after all. */
  maxHeight?: number;
}

/** Textarea with markdown support and paste-image-to-upload, reusable anywhere a work item
 *  (or anything else) needs a rich-text-ish edit field backed by an Azure DevOps attachment. */
export function MarkdownEditor({ value, onChange, rows = 14, placeholder, autoGrow = false, maxHeight = 320 }: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const images = useMemo(() => findImages(value), [value]);

  // Reset to auto first so the box can shrink again when text is deleted - scrollHeight only
  // ever reports the larger of content and current height.
  useLayoutEffect(() => {
    if (!autoGrow) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, [value, autoGrow, maxHeight]);

  async function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageItem = Array.from(items).find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;
    const blob = imageItem.getAsFile();
    if (!blob) return;

    e.preventDefault();
    setError(null);
    setUploading(true);
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;

    try {
      const extension = blob.type.split("/")[1] || "png";
      const fileName = `pasted-${Date.now()}.${extension}`;
      const uploaded = await uploadAttachment(blob, fileName);
      const insertion = `![${fileName}](${uploaded.url})`;
      const next = value.slice(0, start) + insertion + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        textarea?.focus();
        const pos = start + insertion.length;
        textarea?.setSelectionRange(pos, pos);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte ladda upp bilden.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="md-editor">
      <textarea
        ref={textareaRef}
        className={"md-editor__textarea" + (autoGrow ? " md-editor__textarea--grow" : "")}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onPaste={handlePaste}
      />

      {/* A pasted screenshot leaves nothing but a markdown link in the box, which is no way to
          check you pasted the right thing. The thumbnails are the images the text refers to,
          rendered from the same markdown - so they always match what will end up on the card. */}
      {images.length > 0 && (
        <div className="md-editor__thumbs">
          {images.map((image) => (
            <figure className="md-editor__thumb" key={image.markdown}>
              <a href={image.url} target="_blank" rel="noreferrer" title="Öppna i full storlek">
                <img src={image.url} alt={image.alt || "Inklistrad bild"} />
              </a>
              <button
                type="button"
                className="md-editor__thumb-remove"
                title="Ta bort bilden"
                aria-label="Ta bort bilden"
                onClick={() => onChange(removeImage(value, image.markdown))}
              >
                ✕
              </button>
            </figure>
          ))}
        </div>
      )}

      <div className="md-editor__footer">
        <span>Markdown stöds - klistra in en bild för att bifoga den.</span>
        {uploading && <span className="md-editor__uploading">Laddar upp bild…</span>}
        {error && <span className="md-editor__error">{error}</span>}
      </div>
    </div>
  );
}

interface EmbeddedImage {
  /** The exact `![alt](url)` text, so removing one takes out the right occurrence. */
  markdown: string;
  alt: string;
  url: string;
}

const IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

function findImages(text: string): EmbeddedImage[] {
  const images: EmbeddedImage[] = [];
  for (const match of text.matchAll(IMAGE_PATTERN)) {
    images.push({ markdown: match[0], alt: match[1], url: match[2] });
  }
  return images;
}

/** Drops the image's markdown, and the blank line it usually sits on with it. */
function removeImage(text: string, markdown: string): string {
  return text.replace(markdown, "").replace(/\n{3,}/g, "\n\n").trimStart();
}
