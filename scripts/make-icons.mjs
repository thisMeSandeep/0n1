/*
 * Renders the app icons in public/ from public/favicon.svg, in the sizes
 * install prompts need (S47). Run after changing the SVG:
 *   bun scripts/make-icons.mjs
 * Uses the Chrome that Playwright drives, so PNGs match the SVG exactly.
 */
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const svg = await readFile(new URL("../public/favicon.svg", import.meta.url), "utf8");
/** Full-bleed: maskable icons and iOS are cropped to their own shape. */
const square = svg.replace(/ rx="\d+"/, "");

const icons = [
  { file: "icon-192.png", size: 192, source: svg },
  { file: "icon-512.png", size: 512, source: svg },
  { file: "icon-maskable-512.png", size: 512, source: square },
  { file: "apple-touch-icon.png", size: 180, source: square },
];

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
for (const { file, size, source } of icons) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0">${source.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`,
  );
  await page.screenshot({
    path: new URL(`../public/${file}`, import.meta.url).pathname,
    omitBackground: true,
  });
}
await browser.close();
