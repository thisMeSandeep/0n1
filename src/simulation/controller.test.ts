import { describe, expect, it } from "vitest";
import { registry } from "../components/index.ts";
import type { SimulationCommand } from "../engine/worker/protocol.ts";
import { createSystemDocument } from "../model/document.ts";
import { createDesignStore } from "../store/design.ts";
import type { SimulationClient } from "./client.ts";
import { createSimulationController, STEP_MS } from "./controller.ts";
import { createSimulationStore } from "./store.ts";

function setup() {
  const sent: SimulationCommand[] = [];
  const client: SimulationClient = { send: (command) => sent.push(command), stop: () => {} };
  const design = createDesignStore({ registry, doc: createSystemDocument() });
  const store = createSimulationStore();
  const controller = createSimulationController({ client, design, store });
  const types = () => sent.map((c) => c.type);
  const clear = () => sent.splice(0);
  return { sent, design, store, controller, types, clear };
}

describe("simulation controller", () => {
  it("doesn't start the worker until the first Run", () => {
    const { design, controller, sent } = setup();
    design.getState().addNode("client", { x: 0, y: 0 });
    controller.setSpeed(2);
    controller.setTraffic(1.5);
    controller.reset();
    expect(sent).toEqual([]);
  });

  it("loads the design on Run, with the speed and traffic chosen before", () => {
    const { design, controller, store, sent } = setup();
    design.getState().addNode("client", { x: 0, y: 0 });
    controller.setSpeed(2);
    controller.setTraffic(1.5);
    expect(store.getState()).toMatchObject({ speed: 2, traffic: 1.5 });

    controller.play();
    expect(sent).toEqual([
      { type: "load", doc: design.getState().doc },
      { type: "setSpeed", speed: 2 },
      { type: "setTraffic", multiplier: 1.5 },
      { type: "play" },
    ]);
    expect(store.getState().runAttempted).toBe(true);
  });

  it("toggles between run and pause from the reported state", () => {
    const { controller, store, types, clear } = setup();
    controller.toggle();
    expect(types().at(-1)).toBe("play");
    clear();
    store.setState({ running: true });
    controller.toggle();
    expect(types()).toEqual(["pause"]);
  });

  it("steps one second at a time", () => {
    const { controller, sent } = setup();
    controller.step();
    expect(sent.at(-1)).toEqual({ type: "step", ms: STEP_MS });
  });

  it("sends settings changes live, without reloading", () => {
    const { design, controller, sent, types, clear } = setup();
    const id = design.getState().addNode("client", { x: 0, y: 0 });
    controller.play();
    clear();
    design.getState().updateParams(id, { rate: 500 });
    expect(sent).toEqual([
      { type: "updateParams", nodeId: id, params: expect.objectContaining({ rate: 500 }) },
    ]);
    clear();
    design.getState().moveNodes([{ id, position: { x: 40, y: 40 } }]);
    design.getState().renameNode(id, "Shoppers");
    expect(types()).toEqual([]); // positions and names don't matter to the run
  });

  it("reloads when components or connections change", () => {
    const { design, controller, types, clear } = setup();
    const users = design.getState().addNode("client", { x: 0, y: 0 });
    controller.play();
    clear();
    const api = design.getState().addNode("service", { x: 200, y: 0 });
    expect(types()).toEqual(["load"]);
    clear();
    design.getState().connect(users, api);
    expect(types()).toEqual(["load"]);
    clear();
    design.getState().removeNodes([api]);
    expect(types()).toEqual(["load"]);
  });

  it("loads another system paused, and forgets the problems shown", () => {
    const { design, controller, store, sent, types, clear } = setup();
    controller.play();
    clear();
    const other = createSystemDocument({ name: "Other" });
    design.getState().load(other);
    expect(types()).toEqual(["pause", "load"]);
    expect(sent.at(-1)).toEqual({ type: "load", doc: other });
    expect(store.getState().runAttempted).toBe(false);
  });

  it("speed and traffic go to the worker once it's running", () => {
    const { controller, sent, clear } = setup();
    controller.play();
    clear();
    controller.setSpeed(5);
    controller.setTraffic(3);
    expect(sent).toEqual([
      { type: "setSpeed", speed: 5 },
      { type: "setTraffic", multiplier: 3 },
    ]);
  });

  it("takes components down before the first Run, loading the system paused", () => {
    const { design, controller, types } = setup();
    const id = design.getState().addNode("client", { x: 0, y: 0 });
    controller.takeDown(id);
    expect(types()).toEqual(["load", "setSpeed", "setTraffic", "takeDown"]);
    expect(controller.isDown(id)).toBe(true);
  });

  it("keeps components down through a reload, until reset", () => {
    const { design, controller, sent, clear } = setup();
    const users = design.getState().addNode("client", { x: 0, y: 0 });
    const api = design.getState().addNode("service", { x: 200, y: 0 });
    controller.play();
    controller.takeDown(api);
    clear();
    design.getState().connect(users, api);
    expect(sent.slice(1)).toEqual([{ type: "takeDown", nodeId: api }]);

    controller.reset();
    clear();
    design.getState().addNode("cache", { x: 400, y: 0 });
    expect(sent.map((c) => c.type)).toEqual(["load"]);
    expect(controller.isDown(api)).toBe(false);
  });

  it("forgets removed components", () => {
    const { design, controller, types, clear } = setup();
    const api = design.getState().addNode("service", { x: 0, y: 0 });
    controller.takeDown(api);
    design.getState().removeNodes([api]);
    clear();
    design.getState().addNode("service", { x: 0, y: 0 });
    expect(types()).toEqual(["load"]);
  });

  it("K takes the selection down, or brings it back when it's all down", () => {
    const { design, controller, sent, clear } = setup();
    const a = design.getState().addNode("service", { x: 0, y: 0 });
    const b = design.getState().addNode("service", { x: 0, y: 200 });
    controller.play();
    controller.takeDown(a);
    clear();
    controller.toggleDown([a, b]); // one is up: take the rest down
    expect(sent).toEqual([{ type: "takeDown", nodeId: b }]);
    clear();
    controller.toggleDown([a, b]);
    expect(sent).toEqual([
      { type: "bringBack", nodeId: a },
      { type: "bringBack", nodeId: b },
    ]);
    clear();
    controller.toggleDown([]);
    expect(sent).toEqual([]);
  });

  it("reloads when the chaos timeline changes", () => {
    const { design, controller, types, clear } = setup();
    const api = design.getState().addNode("service", { x: 0, y: 0 });
    controller.play();
    clear();
    const id = design.getState().addEvent({ kind: "down", at: 5000, target: api, duration: 1000 });
    expect(types()).toEqual(["load"]);
    clear();
    design.getState().removeEvent(id);
    expect(types()).toEqual(["load"]);
  });
});
