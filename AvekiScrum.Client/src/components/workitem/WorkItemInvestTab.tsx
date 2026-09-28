import { Section } from "./Section";
import { INVEST_ITEMS, investCheckedCount, investLabel, type InvestChecks } from "./dorDecisionLogic";
import "./WorkItemInvestTab.css";

interface WorkItemInvestTabProps {
  checks: InvestChecks;
  onChange: (checks: InvestChecks) => void;
}

/**
 * INVEST: the six properties a well-cut story is supposed to have, checked off one by one rather
 * than judged as a single yes/no - so the Godkännande tab can show "5/6" instead of a single
 * verdict, and so it's visible at a glance which property is the one still in question.
 *
 * Not persisted on its own - the checked state is folded into Custom.DoRDecision together with the
 * ready-check answers when Godkänn DoR is pressed (see dorDecisionLogic.ts), and read back out of
 * that same field when the card is reopened.
 */
export function WorkItemInvestTab({ checks, onChange }: WorkItemInvestTabProps) {
  const count = investCheckedCount(checks);

  return (
    <div className="invest-tab">
      <Section title="INVEST" hint={`${count}/${INVEST_ITEMS.length}`} ok={count === INVEST_ITEMS.length}>
        <div className="invest-rows">
          {INVEST_ITEMS.map((item) => (
            <label key={item.key} className="invest-row">
              <input
                type="checkbox"
                checked={!!checks[item.key]}
                onChange={(e) => onChange({ ...checks, [item.key]: e.target.checked })}
              />
              <div className="invest-row__body">
                <span className="invest-row__term">{investLabel(item)}</span>
                <span className="invest-row__desc">{item.description}</span>
              </div>
            </label>
          ))}
        </div>
      </Section>
    </div>
  );
}
