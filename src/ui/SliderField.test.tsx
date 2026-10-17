// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { SliderField } from "./SliderField.tsx";
import { TooltipProvider } from "./Tooltip.tsx";

beforeAll(() => {
  // Radix Slider measures itself; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

function Harness({ initial = 12 }: { initial?: number }) {
  const [value, setValue] = useState(initial);
  return (
    <TooltipProvider>
      <SliderField
        label="Query time"
        value={value}
        onChange={setValue}
        min={1}
        max={1000}
        scale="log"
        step={1}
        unit="ms"
        defaultValue={12}
      />
    </TooltipProvider>
  );
}

const field = () => screen.getByLabelText<HTMLInputElement>("Query time", { selector: "input" });
const slider = () => screen.getByRole("slider", { name: "Query time" });

describe("SliderField", () => {
  it("exposes the real value to assistive tech, not the slider position", () => {
    render(<Harness />);
    expect(slider().getAttribute("aria-valuenow")).toBe("12");
    expect(slider().getAttribute("aria-valuetext")).toBe("12 ms");
  });

  it("typing in the number field moves the slider", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.clear(field());
    await user.type(field(), "250{Enter}");

    expect(field().value).toBe("250");
    expect(slider().getAttribute("aria-valuenow")).toBe("250");
  });

  it("clamps typed values and ignores junk", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.clear(field());
    await user.type(field(), "99999{Enter}");
    expect(field().value).toBe("1000");

    await user.clear(field());
    await user.type(field(), "abc{Enter}");
    expect(field().value).toBe("1000");
  });

  it("Escape reverts an unfinished edit", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.clear(field());
    await user.type(field(), "40{Escape}");
    expect(field().value).toBe("12");
  });

  it("slider keyboard steps update the number field on a log scale", async () => {
    const user = userEvent.setup();
    render(<Harness initial={100} />);

    slider().focus();
    await user.keyboard("{ArrowRight}");
    expect(field().value).toBe("110");

    await user.keyboard("{PageDown}");
    expect(field().value).toBe("55");

    await user.keyboard("{Home}");
    expect(field().value).toBe("1");
  });

  it("shows a reset button only when the value differs from the default", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByRole("button", { name: "Reset to 12 ms" })).toBeNull();

    await user.clear(field());
    await user.type(field(), "30{Enter}");
    await user.click(screen.getByRole("button", { name: "Reset to 12 ms" }));

    expect(field().value).toBe("12");
  });
});
