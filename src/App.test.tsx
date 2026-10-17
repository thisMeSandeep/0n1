import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App.tsx";

describe("App", () => {
  it("renders the lab root", () => {
    expect(renderToString(<App />)).toContain("<main");
  });
});
