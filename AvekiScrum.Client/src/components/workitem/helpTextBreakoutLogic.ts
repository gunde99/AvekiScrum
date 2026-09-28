import type { WorkItemRelationRef } from "../../api/workitems";

/** Candidate Documentation-activity Tasks a "Bryt ut hjälptext" can move - never a Closed one,
 *  since a closed task is already done and moving it would just relocate finished work. */
export function findHelpTextTaskCandidates(children: WorkItemRelationRef[]): WorkItemRelationRef[] {
  return children.filter(
    (c) => c.type === "Task" && c.activity === "Documentation" && c.state.toLowerCase() !== "closed",
  );
}

/** Narrows several open Documentation tasks down to the one whose title actually says
 *  "hjälptext" - the naming convention every card created via DoR/"Beställ hjälptext" follows,
 *  even though not every Documentation task necessarily uses it. Returns null when there's still
 *  more than one (or none) left after that - i.e. when it can't be decided automatically and the
 *  user has to pick. */
export function resolveHelpTextTask(candidates: WorkItemRelationRef[]): WorkItemRelationRef | null {
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) return null;
  const named = candidates.filter((c) => /hjälptext/i.test(c.title));
  return named.length === 1 ? named[0] : null;
}
