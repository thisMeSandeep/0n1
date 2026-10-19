import { ShuffleIcon } from "@phosphor-icons/react";
import { DEFAULT_SEED, MAX_SEED } from "../model/document.ts";
import { designStore, useDesign } from "../store/index.ts";
import { Button } from "../ui/Button.tsx";
import { NumberField } from "../ui/NumberField.tsx";
import { InspectorSection } from "./InspectorHeader.tsx";

/** A seed that isn't the current one. */
function newSeed(current: number): number {
  const seed = 1 + Math.floor(Math.random() * MAX_SEED);
  return seed === current ? (seed % MAX_SEED) + 1 : seed;
}

/**
 * The run's random seed (M08): every random draw in a run comes from it,
 * so the same seed replays the same run. Changing it restarts the run.
 */
export function RunSeed() {
  const seed = useDesign((s) => s.doc.seed ?? DEFAULT_SEED);
  const set = (next: number) => designStore.getState().setSeed(next);
  return (
    <InspectorSection title="Run seed">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <NumberField
            aria-label="Run seed"
            value={seed}
            min={1}
            max={MAX_SEED}
            step={1}
            onChange={set}
            className="w-32"
          />
          <Button onClick={() => set(newSeed(seed))}>
            <ShuffleIcon />
            New seed
          </Button>
        </div>
        <p className="max-w-[65ch] text-sm text-fg-2">
          The same seed replays the same run. Try another to see whether a result holds or was luck.
        </p>
      </div>
    </InspectorSection>
  );
}
