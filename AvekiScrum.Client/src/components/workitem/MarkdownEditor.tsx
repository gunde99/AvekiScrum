import { useRef, useState, type ClipboardEvent } from "react";
import { uploadAttachment } from "../../api/attachments";
import "./MarkdownEditor.css";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}

/** Textarea with markdown support and paste-image-to-upload, reusable anywhere a work item
 *  (or anything else) needs a rich-text-ish edit field backed by an Azure DevOps attachment. */
export function MarkdownEditor({ value, onChange, rows = 14, placeholder }: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        className="md-editor__textarea"
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onPaste={handlePaste}
      />
      <div className="md-editor__footer">
        <span>Markdown stöds - klistra in en bild för att bifoga den.</span>
        {uploading && <span className="md-editor__uploading">Laddar upp bild…</span>}
        {error && <span className="md-editor__error">{error}</span>}
      </div>
    </div>
  );
}
