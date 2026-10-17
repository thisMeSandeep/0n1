import { QuestionIcon } from "@phosphor-icons/react";
import { describe, expect, it } from "vitest";
import { componentDefinitions } from "../components/index.ts";
import { componentIcon } from "./componentIcons.tsx";

describe("componentIcon", () => {
  it.each(componentDefinitions.map((d) => [d.type, d.icon]))(
    "%s has a real icon (%s)",
    (_, key) => {
      expect(componentIcon(key)).not.toBe(QuestionIcon);
    },
  );

  it("falls back for unknown keys", () => {
    expect(componentIcon("nope")).toBe(QuestionIcon);
  });
});
