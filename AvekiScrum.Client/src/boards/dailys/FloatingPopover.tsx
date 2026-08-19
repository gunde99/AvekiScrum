import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

interface FloatingPopoverProps {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

/**
 * Portal-rendered popover anchored to a trigger element, positioned with fixed coordinates
 * computed from the trigger's own bounding box. Renders into document.body specifically to
 * escape any ancestor's `overflow: hidden` (e.g. .group-card) - a plain `position: absolute`
 * popover gets silently clipped by the first such ancestor no matter how carefully its own
 * left/right offset is computed.
 */
export function FloatingPopover({ anchorRef, onClose, children, className }: FloatingPopoverProps) {
  const popRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ position: "fixed", visibility: "hidden", top: 0, left: 0 });

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const pop = popRef.current;
    if (!anchor || !pop) return;

    const anchorRect = anchor.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    const margin = 8;

    let left = anchorRect.left;
    if (left + popRect.width > window.innerWidth - margin) {
      left = anchorRect.right - popRect.width;
    }
    left = Math.max(margin, left);

    let top = anchorRect.bottom + 4;
    if (top + popRect.height > window.innerHeight - margin) {
      top = anchorRect.top - popRect.height - 4;
    }
    top = Math.max(margin, top);

    setStyle({ position: "fixed", left, top, visibility: "visible" });
  }, [anchorRef]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (popRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, anchorRef]);

  return createPortal(
    <div ref={popRef} className={className} style={style} onClick={(e) => e.stopPropagation()}>
      {children}
    </div>,
    document.body,
  );
}
