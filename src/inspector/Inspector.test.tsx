// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { componentDefinitions } from "../components/index.ts";
import { defaultParams } from "../model/component.ts";
import { createSystemDocument } from "../model/document.ts";
import { designStore, selectionStore } from "../store/index.ts";
import { formatNumber } from "../ui/scale.ts";
import { TooltipProvider } from "../ui/Tooltip.tsx";
import { Inspector } from "./Inspector.tsx";
import { isParamShown } from "./sections.ts";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // jsdom has no pointer capture; Radix Slider uses it on pointerdown.
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

beforeEach(() => {
  designStore.getState().load(createSystemDocument({ id: "test", name: "Test system", now: 0 }));
  selectionStore.getState().clear();
});
afterEach(cleanup);

const renderInspector = () =>
  render(
    <TooltipProvider>
      <Inspector onClose={() => {}} />
    </TooltipProvider>,
  );

function addAndSelect(type: string) {
  const id = designStore.getState().addNode(type, { x: 0, y: 0 });
  act(() => selectionStore.getState().select({ nodeIds: [id], edgeIds: [] }));
  return id;
}

const params = (id: string) => designStore.getState().doc.nodes.find((n) => n.id === id)?.params;
const undo = () => act(() => designStore.temporal.getState().undo());

describe("Inspector", () => {
  it("shows the system when nothing is selected", () => {
    renderInspector();
    expect(screen.getByLabelText<HTMLInputElement>("System name").value).toBe("Test system");
    expect(screen.getByText("0 components · 0 connections")).toBeTruthy();
  });

  describe.each(componentDefinitions.map((d) => [d.displayName, d] as const))(
    "%s",
    (_, definition) => {
      it("renders every setting with its default, under the right section", () => {
        addAndSelect(definition.type);
        renderInspector();

        expect(screen.getByText(definition.description)).toBeTruthy();
        const defaults = defaultParams(definition);
        for (const spec of Object.values(definition.params)) {
          // Settings for another traffic shape, say, are hidden until they apply.
          if (!isParamShown(spec, defaults)) {
            expect(screen.queryByLabelText(spec.label)).toBeNull();
            continue;
          }
          if (spec.kind === "number") {
            const field = screen.getByLabelText<HTMLInputElement>(spec.label, {
              selector: "input",
            });
            expect(field.value).toBe(formatNumber(spec.default));
            expect(screen.getByRole("slider", { name: spec.label })).toBeTruthy();
          } else if (spec.kind === "toggle") {
            const toggle = screen.getByRole("switch", { name: spec.label });
            expect(toggle.getAttribute("aria-checked")).toBe(String(spec.default));
          } else {
            const group = screen.getByRole("group", { name: spec.label });
            const checked = within(group).getByRole<HTMLInputElement>("radio", { checked: true });
            expect(checked.value).toBe(spec.default);
          }
        }
      });
    },
  );

  it("shows a traffic shape's settings, and a preview, only once it's chosen", async () => {
    const user = userEvent.setup();
    const id = addAndSelect("client");
    renderInspector();
    expect(screen.queryByLabelText("Spike every", { selector: "input" })).toBeNull();
    expect(screen.queryByRole("img", { name: /Traffic over the first/ })).toBeNull();

    await user.click(screen.getByRole("radio", { name: "Spikes" }));
    expect(params(id)?.shape).toBe("spike");
    expect(screen.getByLabelText("Spike every", { selector: "input" })).toBeTruthy();
    expect(screen.getByLabelText("Spike size", { selector: "input" })).toBeTruthy();
    expect(screen.getByRole("img", { name: /Traffic over the first 01:45/ })).toBeTruthy();
    expect(screen.queryByLabelText("Ramp over", { selector: "input" })).toBeNull();
  });

  it("edits a number setting, and undo restores it", async () => {
    const user = userEvent.setup();
    const id = addAndSelect("database");
    renderInspector();

    const field = screen.getByLabelText<HTMLInputElement>("Connections", { selector: "input" });
    await user.clear(field);
    await user.type(field, "200{Enter}");
    expect(params(id)?.connections).toBe(200);

    undo();
    expect(params(id)?.connections).toBe(50);
    expect(field.value).toBe("50");
  });

  it("a slider drag is one undo step, however many values it passes through", () => {
    const id = addAndSelect("database");
    renderInspector();
    const slider = screen.getByRole("slider", { name: "Connections" });
    const root = slider.closest("[data-orientation]") as HTMLElement;

    const steps = designStore.temporal.getState().pastStates.length;
    act(() => {
      root.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      for (const connections of [60, 70, 80, 90]) {
        designStore.getState().updateParams(id, { connections });
      }
      root.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });

    expect(designStore.temporal.getState().pastStates.length).toBe(steps + 1);
    undo();
    expect(params(id)?.connections).toBe(50);
  });

  it("toggles, picks choices, and greys out settings that depend on a toggle", async () => {
    const user = userEvent.setup();
    const id = addAndSelect("api-gateway");
    renderInspector();

    const limit = screen.getByLabelText<HTMLInputElement>("Rate limit", { selector: "input" });
    expect(limit.disabled).toBe(true);

    await user.click(screen.getByRole("switch", { name: "Rate limiting" }));
    expect(params(id)?.rateLimiting).toBe(true);
    expect(limit.disabled).toBe(false);

    undo();
    expect(params(id)?.rateLimiting).toBe(false);
  });

  it("changes a choice", async () => {
    const user = userEvent.setup();
    const id = addAndSelect("load-balancer");
    renderInspector();

    await user.click(screen.getByRole("radio", { name: /Least busy/ }));
    expect(params(id)?.strategy).toBe("least-busy");
  });

  it("renames the component, and rejects a blank name", async () => {
    const user = userEvent.setup();
    const id = addAndSelect("cache");
    renderInspector();
    const name = screen.getByLabelText<HTMLInputElement>("Component name");

    await user.clear(name);
    await user.type(name, "Link cache{Enter}");
    expect(designStore.getState().doc.nodes.find((n) => n.id === id)?.name).toBe("Link cache");

    await user.clear(name);
    await user.type(name, "{Enter}");
    expect(name.value).toBe("Link cache");
  });

  it("shows a connection, and several selected items as a count", () => {
    const store = designStore.getState();
    const a = store.addNode("client", { x: 0, y: 0 });
    const b = store.addNode("service", { x: 300, y: 0 });
    const result = store.connect(a, b);
    if (!result.ok) throw new Error(result.reason);

    act(() => selectionStore.getState().select({ nodeIds: [], edgeIds: [result.edgeId] }));
    const { rerender } = renderInspector();
    expect(screen.getByText("Client → Service")).toBeTruthy();
    expect(screen.getByText("Client sends requests to Service.")).toBeTruthy();

    act(() => selectionStore.getState().select({ nodeIds: [a, b], edgeIds: [result.edgeId] }));
    rerender(
      <TooltipProvider>
        <Inspector onClose={() => {}} />
      </TooltipProvider>,
    );
    expect(screen.getByText("3 selected")).toBeTruthy();
    expect(screen.getByText("2 components · 1 connection")).toBeTruthy();
  });
});
