import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [playwrightModule, pack = "assets/submission/algorithm-lab-2026-09-19"] = process.argv.slice(2);
if (!playwrightModule) throw new Error("Usage: node render-gallery.mjs /path/to/playwright/index.mjs [asset-pack-dir]");
const { chromium } = await import(pathToFileURL(path.resolve(playwrightModule)).href);
const slides = [
  ["process", "02-how-cp-sat-works.png"],
  ["demo", "03-interactive-demo.png"],
  ["disruption", "04-close-a-week.png"],
  ["proof", "05-proof.png"],
];
await mkdir(path.join(pack, "images"), { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const report = [];
try {
  for (const [slide, filename] of slides) {
    const url = pathToFileURL(path.resolve(pack, "source/gallery.html"));
    url.searchParams.set("slide", slide);
    await page.goto(url.href);
    await page.evaluate(() => document.fonts.ready);
    const state = await page.evaluate(() => {
      const active = document.querySelector(".slide.active");
      const footer = document.querySelector(".footer").getBoundingClientRect();
      const content = active.getBoundingClientRect();
      return {
        loadedImages: [...active.querySelectorAll("img")].every((img) => img.complete && img.naturalWidth > 0),
        contentBottom: content.bottom,
        footerTop: footer.top,
        fontsLoaded: document.fonts.check('24px "IBM Plex Sans"') && document.fonts.check('24px "IBM Plex Mono"'),
        canvasWidth: document.documentElement.scrollWidth,
        canvasHeight: document.documentElement.scrollHeight,
      };
    });
    assert.equal(state.loadedImages, true, `${slide}: missing screenshot`);
    assert.equal(state.fontsLoaded, true, `${slide}: missing font`);
    assert.ok(state.contentBottom < state.footerTop - 12, `${slide}: content overlaps footer (${state.contentBottom} / ${state.footerTop})`);
    assert.equal(state.canvasWidth, 1920);
    assert.equal(state.canvasHeight, 1080);
    await page.screenshot({ path: path.join(pack, "images", filename) });
    report.push({ slide, filename, ...state });
  }
  await writeFile(path.join(pack, "source/render-checks.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
