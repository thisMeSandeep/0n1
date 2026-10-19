import { CircleIcon, TriangleIcon } from "@phosphor-icons/react";
import { cx } from "./cx.ts";

export type Level = "ok" | "warn" | "fail";

export const LEVEL_TEXT: Record<Level, string> = {
  ok: "text-fg",
  warn: "text-warn",
  fail: "text-fail",
};

const LEVEL_WORD: Record<Level, string> = { ok: "", warn: "High", fail: "Too high" };

/** ▲ for amber, ● for red, so a level never relies on colour alone (UIUX §5). */
export function LevelMark({ level, className }: { level: Level; className?: string }) {
  if (level === "ok") return null;
  const mark = cx("size-2", LEVEL_TEXT[level]);
  // Written out, not through a variable, so the build sees they're drawn filled
  // (src/build/iconWeights.ts keeps only the weights it finds).
  return (
    <span className={cx("inline-flex items-center", className)}>
      {level === "warn" ? (
        <TriangleIcon aria-hidden weight="fill" className={mark} />
      ) : (
        <CircleIcon aria-hidden weight="fill" className={mark} />
      )}
      <span className="sr-only">{LEVEL_WORD[level]}:</span>
    </span>
  );
}
