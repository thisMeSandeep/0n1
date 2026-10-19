import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Box = { top: number; left: number; width: number; height: number };

const PAD = 4;

/**
 * A ring around what a tutorial step is about. It follows the element as
 * things move (panning, zooming, panels opening), and hides while it isn't
 * on screen. It never takes clicks.
 */
export function Spotlight({ selector }: { selector: string | null }) {
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => {
    if (!selector) {
      setBox(null);
      return;
    }
    let frame = 0;
    let last = "";
    const track = () => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      const next =
        rect && rect.width > 0
          ? {
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + 2 * PAD,
              height: rect.height + 2 * PAD,
            }
          : null;
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        setBox(next);
      }
      frame = requestAnimationFrame(track);
    };
    track();
    return () => cancelAnimationFrame(frame);
  }, [selector]);

  if (!box) return null;
  return createPortal(
    <div
      aria-hidden
      data-spotlight
      className="pointer-events-none fixed z-40 rounded-card outline-2 outline-accent shadow-[0_0_0_6px_var(--accent-soft)] transition-[top,left,width,height] duration-(--duration-fast)"
      style={box}
    />,
    document.body,
  );
}
