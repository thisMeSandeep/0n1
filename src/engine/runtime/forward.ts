import type { BehaviourContext, Outcome, Request } from "./types.ts";

/** Send to each target one after another; stop at the first failure. */
export function callInSequence(
  ctx: Pick<BehaviourContext, "send">,
  targets: readonly string[],
  request: Request,
  done: (outcome: Outcome) => void,
): void {
  const next = (index: number) => {
    const target = targets[index];
    if (target === undefined) {
      done({ ok: true });
      return;
    }
    ctx.send(target, request, (outcome) => (outcome.ok ? next(index + 1) : done(outcome)));
  };
  next(0);
}
