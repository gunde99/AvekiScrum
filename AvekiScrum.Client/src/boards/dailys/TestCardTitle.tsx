import { useLayoutEffect, useRef, useState } from "react";

interface TestCardTitleProps {
  title: string;
  onOpen: () => void;
}

/**
 * The test card's header title. One line by default, so every card in a row has the same height
 * and the eye can run straight across them; a title that doesn't fit ends in a clickable "…" that
 * unfolds the whole text in place (and folds back with ▴). The title itself still opens the card,
 * so the "…" has to be its own button - the browser's own text-overflow ellipsis can't be clicked.
 */
export function TestCardTitle({ title, onOpen }: TestCardTitleProps) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const textRef = useRef<HTMLButtonElement>(null);

  // Measured rather than guessed from the length: whether it fits depends on the card's width,
  // which changes with the window and the grid's column count.
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return;
    const measure = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [title, expanded]);

  return (
    <div className={"test-card__title-row" + (expanded ? " test-card__title-row--expanded" : "")}>
      <button ref={textRef} type="button" className="test-card__title" onClick={onOpen} title="Öppna testkortet">
        {title}
      </button>
      {expanded ? (
        <button type="button" className="test-card__more" onClick={() => setExpanded(false)} title="Visa på en rad" aria-label="Visa på en rad">
          ▴
        </button>
      ) : (
        overflowing && (
          <button type="button" className="test-card__more" onClick={() => setExpanded(true)} title="Visa hela rubriken" aria-label="Visa hela rubriken">
            …
          </button>
        )
      )}
    </div>
  );
}
