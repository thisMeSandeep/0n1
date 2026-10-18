import { describe, expect, it } from "vitest";
import { imageFileName, withBackground } from "./image.ts";

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const decode = (url: string) => decodeURIComponent(url.slice(url.indexOf(",") + 1));

describe("image export", () => {
  it("puts a full-size background behind an SVG's content", () => {
    const url = withBackground(
      svgUrl('<svg width="10" height="5"><foreignObject/></svg>'),
      "#f4f3f0",
    );
    expect(decode(url)).toBe(
      '<svg width="10" height="5"><rect width="100%" height="100%" fill="#f4f3f0"/><foreignObject/></svg>',
    );
  });

  it("leaves a transparent SVG alone", () => {
    const url = svgUrl("<svg><g/></svg>");
    expect(withBackground(url, undefined)).toBe(url);
  });

  it("names files after the system", () => {
    expect(imageFileName("url-shortener", "png")).toBe("0n1-url-shortener.png");
    expect(imageFileName("url-shortener", "svg")).toBe("0n1-url-shortener.svg");
  });
});
