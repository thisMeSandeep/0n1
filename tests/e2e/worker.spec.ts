import { expect, test } from "@playwright/test";
import { openLab } from "./helpers.ts";

test("the simulation runs in a real Web Worker", async ({ page }) => {
  await openLab(page, "/?sample");
  const result = await page.evaluate(async () => {
    const worker = new Worker("/src/engine/worker/worker.ts", { type: "module" });
    const events: { type: string; time?: number; running?: boolean }[] = [];
    worker.addEventListener("message", (e) =>
      events.push({ type: e.data.type, time: e.data.snapshot?.time, running: e.data.running }),
    );
    const now = Date.now();
    const doc = {
      schemaVersion: 1,
      id: "w",
      name: "Worker test",
      nodes: [
        {
          id: "users",
          type: "client",
          name: "Users",
          position: { x: 0, y: 0 },
          params: { rate: 100 },
        },
        { id: "api", type: "service", name: "API", position: { x: 300, y: 0 }, params: {} },
      ],
      edges: [{ id: "e", source: "users", target: "api" }],
      meta: { createdAt: now, updatedAt: now },
    };
    worker.postMessage({ type: "load", doc });
    worker.postMessage({ type: "play" });
    await new Promise((resolve) => setTimeout(resolve, 600));
    worker.postMessage({ type: "pause" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    worker.terminate();
    return events;
  });

  expect(result[0]).toMatchObject({ type: "loaded" });
  const running = result.filter((e) => e.type === "snapshot" && e.running);
  expect(running.length).toBeGreaterThanOrEqual(3);
  expect(running.at(-1)?.time ?? 0).toBeGreaterThan(300);
  expect(result.at(-1)).toMatchObject({ type: "snapshot", running: false });
});
