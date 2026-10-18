import { XIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import { BLUEPRINTS } from "../blueprints/catalog.ts";
import type { Blueprint } from "../blueprints/format.ts";
import { isUntouchedBlank } from "../library/actions.ts";
import { library } from "../library/index.ts";
import { designStore, uiStore, useDesign, useUi } from "../store/index.ts";
import { IconButton } from "../ui/Button.tsx";
import { Kbd } from "../ui/Kbd.tsx";
import { toast } from "../ui/Toast.tsx";
import { isTypingTarget } from "./layout.ts";
import { shortcutKeys } from "./shortcuts.ts";

const close = () => uiStore.getState().setWelcomeOpen(false);

/** How many blueprints the card offers (UIUX §10: three). */
const SHOWN = 3;

/**
 * The first-visit welcome card, centred on the canvas (UIUX §10). It isn't
 * modal: the lab works around it, and the first edit closes it for good.
 * It can be reopened from ⋯ → Welcome.
 */
export function Welcome() {
  const open = useUi((s) => s.welcomeOpen);

  // The first change to the design (adding a component, opening a system) closes it.
  useEffect(() => {
    if (!open) return;
    return designStore.subscribe((state, previous) => {
      if (state.doc !== previous.doc) close();
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !isTypingTarget(event.target))
        close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  const openBlueprint = async (blueprint: Blueprint) => {
    try {
      await library.createFromBlueprint(blueprint);
      close();
    } catch {
      toast({ title: "Couldn't open that blueprint" });
    }
  };
  const blank = async () => {
    // The open system is usually the untouched one a first visit starts with.
    if (!isUntouchedBlank(designStore.getState().doc)) await library.createAndOpen();
    close();
  };

  return (
    <div
      data-export-skip
      className="pointer-events-none absolute inset-0 z-10 grid place-items-center p-6"
    >
      <section
        aria-labelledby="welcome-title"
        className="pointer-events-auto relative w-full max-w-160 rounded-card border border-line bg-raised p-8 shadow-raised animate-pop-in"
      >
        <IconButton label="Close welcome" onClick={close} className="absolute top-3 right-3">
          <XIcon />
        </IconButton>
        <h2 id="welcome-title" className="max-w-[28ch] text-xl font-semibold text-fg">
          Build a system, send it traffic, and watch where it breaks.
        </h2>
        <p className="mt-2 text-base text-fg-2">
          Start from a blueprint that breaks in an interesting way, or build your own.
        </p>

        <ul aria-label="Blueprints" className="mt-6 grid grid-cols-3 gap-3">
          {BLUEPRINTS.slice(0, SHOWN).map((blueprint) => (
            <li key={blueprint.id}>
              <button
                type="button"
                onClick={() => void openBlueprint(blueprint)}
                className="flex h-full w-full flex-col gap-1.5 rounded-card border border-line bg-surface p-4 text-left transition-colors duration-(--duration-fast) hover:border-line-strong hover:bg-raised"
              >
                <span className="text-base font-medium text-fg">{blueprint.title}</span>
                <span className="text-sm text-fg-2">{blueprint.summary}</span>
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => void blank()}
          className="mt-4 rounded-control px-1 text-base font-medium text-accent hover:underline"
        >
          Start with a blank canvas
        </button>

        <ul
          aria-label="Tips"
          className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-5 text-sm text-fg-2"
        >
          <li>Double-click the canvas to add a component</li>
          <li className="flex items-center gap-1.5">
            <Kbd>{shortcutKeys("runPause")}</Kbd> to run
          </li>
          <li className="flex items-center gap-1.5">
            <Kbd>{shortcutKeys("shortcuts")}</Kbd> for shortcuts
          </li>
        </ul>
      </section>
    </div>
  );
}

/** On an empty canvas once the welcome card is gone: one faint line (UIUX §10). */
export function EmptyCanvasHint() {
  const empty = useDesign((s) => s.doc.nodes.length === 0);
  const welcome = useUi((s) => s.welcomeOpen);
  if (!empty || welcome) return null;
  return (
    <p
      data-export-skip
      className="pointer-events-none absolute inset-0 z-0 grid place-items-center text-base text-fg-2"
    >
      Double-click anywhere to add a component.
    </p>
  );
}
