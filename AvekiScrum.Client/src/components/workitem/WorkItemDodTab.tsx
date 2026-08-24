import type { DailyStoryDto } from "../../api/dailys";
import { deliveryTiles } from "../../boards/dailys/TaskPills";
import { canApproveDod, hasDodTag, korthygienWarnings } from "../../boards/dailys/dailysLogic";
import "./WorkItemDodTab.css";

interface WorkItemDodTabProps {
  /** The board's own view of the card - the same one the row's boxes are drawn from. */
  story: DailyStoryDto;
  approving: boolean;
  onApprove: () => void;
}

/**
 * Definition of Done: the four delivery boxes with their reasoning spelled out, and a sign-off.
 *
 * The boxes come from the same function the board row uses, so the dialog can't disagree with the
 * row about whether a card is finished. What it adds is the argument behind each box, the warnings
 * that would otherwise only live in a tooltip, and a button to say "yes, this is done anyway".
 *
 * Approving writes a DoD tag, which silences every warning on the card. That is only safe because
 * the button is limited to closed cards: nothing new can arrive afterwards to be waved through
 * unseen.
 */
export function WorkItemDodTab({ story, approving, onApprove }: WorkItemDodTabProps) {
  const approved = hasDodTag(story);
  const tiles = deliveryTiles(story);
  const hygiene = korthygienWarnings(story);
  const closed = canApproveDod(story);

  return (
    <div className="wi-dod">
      {approved && (
        <div className="wi-dod__banner wi-dod__banner--approved">
          <strong>✓ Godkänd enligt Definition of Done.</strong> Kortet visar inga varningar längre – någon
          har tagit ställning till dem.
        </div>
      )}

      <div className="wi-dod__grid">
        {tiles.map((tile) => {
          // An approved card turns every box green: the ones that were grey were the exceptions
          // being signed off, and they read as N/A rather than as something still outstanding.
          const state = approved && tile.state !== "done" ? "na" : tile.state;
          return (
            <section key={tile.label} className={`wi-dod__box wi-dod__box--${tile.category} wi-dod__box--${state}`}>
              <header className="wi-dod__box-head">
                <span className="wi-dod__box-title">{tile.title}</span>
                {state === "done" && <span className="wi-dod__check">✓</span>}
                {state === "na" && <span className="wi-dod__na">N/A</span>}
                {tile.count > 0 && <span className="wi-dod__count">{tile.count}</span>}
              </header>
              <p className="wi-dod__box-text">{tile.explanation}</p>
              {tile.tasks.length > 0 && (
                <ul className="wi-dod__tasks">
                  {tile.tasks.map((t) => (
                    <li key={t.id}>
                      #{t.id} {t.title} <span className="wi-dod__task-state">({t.status})</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {/* Card hygiene isn't one of the four boxes, but it is part of what a sign-off covers - so it
          is shown here rather than left to be discovered as a triangle on the row. */}
      {hygiene.length > 0 && (
        <section className="wi-dod__hygiene">
          <header>⚠ Korthygien</header>
          <ul>
            {hygiene.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      <footer className="wi-dod__foot">
        {!closed && !approved && (
          <span className="wi-dod__hint">
            Bara stängda kort kan godkännas. Då kvitterar du de varningar som finns, utan att riskera att
            tysta nya som dyker upp senare.
          </span>
        )}
        {closed && !approved && (
          <span className="wi-dod__hint">
            Godkänn när kortet är klart trots kvarvarande varningar – till exempel när test eller
            dokumentation inte behövdes.
          </span>
        )}
        <button
          type="button"
          className="wi-btn wi-btn--primary"
          onClick={onApprove}
          disabled={!closed || approved || approving}
          title={
            approved
              ? "Kortet är redan godkänt"
              : !closed
                ? "Kortet måste vara stängt först"
                : "Sätter DoD-taggen på kortet"
          }
        >
          {approving ? "Godkänner…" : approved ? "Godkänt" : "Godkänn DoD"}
        </button>
      </footer>
    </div>
  );
}
