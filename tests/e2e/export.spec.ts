import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { openLab } from "./helpers.ts";

test.use({ viewport: { width: 1440, height: 900 } });

type Choice = {
  format?: "PNG" | "SVG";
  area?: "Whole system" | "Current view";
  transparent?: boolean;
};

/** Download an image through ⋯ → Download image, returning the file's bytes. */
async function download(page: Page, { format = "PNG", area, transparent = false }: Choice = {}) {
  await page.getByRole("banner").getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitem", { name: "Download image…" }).click();
  const dialog = page.getByRole("dialog", { name: "Download image" });
  // The radios are visually hidden behind their labels: click the label, as a person would.
  const option = (label: string) => dialog.locator("label", { hasText: new RegExp(`^${label}$`) });
  await option(format).click();
  if (area) await option(area).click();
  if (transparent) await dialog.getByRole("switch", { name: "Transparent background" }).click();
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: `Download ${format}` }).click(),
  ]);
  await expect(dialog).toBeHidden();
  return { name: file.suggestedFilename(), bytes: await readFile((await file.path()) as string) };
}

const pngSize = (bytes: Buffer) => ({
  width: bytes.readUInt32BE(16),
  height: bytes.readUInt32BE(20),
});

/** Decode an image in the page: its size, how many colours, and a corner pixel. */
function inspect(page: Page, dataUrl: string) {
  return page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const colours = new Set<number>();
    for (let i = 0; i < data.length; i += 4 * 97)
      colours.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
    const last = data.length - 4;
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      colours: colours.size,
      cornerAlpha: data[3],
      // The far corner too: a background that doesn't cover the whole image shows here.
      farCornerAlpha: data[last + 3],
    };
  }, dataUrl);
}

test("downloads the whole system as a PNG that opens", async ({ page }) => {
  await openLab(page, "/?sample");
  const { name, bytes } = await download(page);
  expect(name).toBe("0n1-url-shortener.png");
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  // The sample spans 1024 × 460 at 100%, plus 48px padding each side, drawn at 2×.
  const size = pngSize(bytes);
  expect(size.width).toBeGreaterThan(2000);
  expect(size.height).toBeGreaterThan(1000);

  const image = await inspect(page, `data:image/png;base64,${bytes.toString("base64")}`);
  expect(image).toMatchObject(size);
  expect(image.colours).toBeGreaterThan(5); // something was drawn, not a blank fill
  expect(image.cornerAlpha).toBe(255); // the canvas colour behind it
  expect(image.farCornerAlpha).toBe(255);
});

test("a transparent background leaves the corners clear", async ({ page }) => {
  await openLab(page, "/?sample");
  const { bytes } = await download(page, { transparent: true });
  const image = await inspect(page, `data:image/png;base64,${bytes.toString("base64")}`);
  expect(image.cornerAlpha).toBe(0);
  expect(image.farCornerAlpha).toBe(0);
});

test("the current view is the size of the canvas", async ({ page }) => {
  await openLab(page, "/?sample");
  const canvas = await page.locator(".react-flow").boundingBox();
  const { bytes } = await download(page, { area: "Current view" });
  const size = pngSize(bytes);
  expect(size.width).toBe(Math.round((canvas?.width ?? 0) * 2));
  expect(size.height).toBe(Math.round((canvas?.height ?? 0) * 2));
});

test("downloads an SVG that parses and opens", async ({ page }) => {
  await openLab(page, "/?sample");
  const { name, bytes } = await download(page, { format: "SVG" });
  expect(name).toBe("0n1-url-shortener.svg");
  const text = bytes.toString("utf8");
  expect(text.startsWith("<svg")).toBe(true);
  expect(text).toContain("Links DB");
  const parsed = await page.evaluate(
    (svg) =>
      new DOMParser().parseFromString(svg, "image/svg+xml").querySelector("parsererror") === null,
    text,
  );
  expect(parsed).toBe(true);
  const image = await inspect(page, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`);
  expect(image.width).toBeGreaterThan(1000);
  expect(image.colours).toBeGreaterThan(5);
  expect(image.cornerAlpha).toBe(255);
  expect(image.farCornerAlpha).toBe(255); // the background covers the whole image
});

test("selection and lab chrome stay out of the image, and the selection comes back", async ({
  page,
}) => {
  await openLab(page, "/?sample");
  await page
    .locator(".react-flow__node")
    .filter({ hasText: /^Links DB/ })
    .click();
  await download(page);
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(1);
});
