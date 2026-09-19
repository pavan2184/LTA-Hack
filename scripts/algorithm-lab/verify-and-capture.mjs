import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [playwrightModule, baseUrl = "http://127.0.0.1:8088", output = "output/algorithm-lab", apiEndpoint = "/api/solve"] = process.argv.slice(2);
if (!playwrightModule) throw new Error("Usage: node verify-and-capture.mjs /path/to/playwright/index.mjs [base-url] [output-dir] [api-endpoint]");
const solveUrl = new URL(apiEndpoint, baseUrl).href;
const { chromium } = await import(pathToFileURL(path.resolve(playwrightModule)).href);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1536, height: 1024 }, deviceScaleFactor: 1 });
const errors = [];
const captures = [];
page.on("pageerror", (error) => errors.push(error.message));
const cost = () => page.locator("#cost-metric").innerText();
async function ready() {
  await page.getByRole("button", { name: "Run CP-SAT", exact: true }).waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.getElementById("solve").disabled);
}
async function run() {
  await page.getByRole("button", { name: "Run CP-SAT", exact: true }).click();
  await ready();
}
async function screenshot(name, fullPage = false) {
  await page.screenshot({ path: path.join(output, name), fullPage });
  captures.push(name);
}
try {
  await page.goto(baseUrl);
  await ready();
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await cost(), "5");
  assert.equal(await page.locator(".access").count(), 9);
  await screenshot("01-default.png");
  const baseline = await page.request.post(solveUrl, { data: { capacity: 2, closedWeek: null, enforcePredecessors: true } });
  await writeFile(path.join(output, "baseline-result.json"), JSON.stringify(await baseline.json(), null, 2));

  await page.getByLabel("Unavailable week", { exact: true }).selectOption("2");
  assert.match(await page.locator("#settings-state").innerText(), /Settings changed/);
  assert.equal(await cost(), "5");
  assert.equal(await page.locator("#download").isDisabled(), true);
  await run();
  assert.equal(await cost(), "19");
  assert.equal(await page.locator(".access").count(), 9);
  assert.match(await page.locator("#comparison").innerText(), /4 of 6.*5 → 19/);
  await screenshot("02-closed-week.png");
  const closure = await page.request.post(solveUrl, { data: { capacity: 2, closedWeek: 2, enforcePredecessors: true } });
  await writeFile(path.join(output, "closed-week-result.json"), JSON.stringify(await closure.json(), null, 2));

  await page.getByRole("button", { name: /2 Search within the rules/ }).click();
  assert.match(await page.locator("#step-example").innerText(), /Week 2 is closed/);
  await page.locator("#model").scrollIntoViewIfNeeded();
  await screenshot("03a-how-it-works.png");
  await page.getByRole("button", { name: /3 Prove and explain/ }).click();
  assert.equal(await page.locator("#proof").getAttribute("open"), "");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download result JSON", exact: true }).click();
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), "railplan-teaching-model-result.json");
  await download.saveAs(path.join(output, "browser-downloaded-result.json"));
  await page.locator("#model").scrollIntoViewIfNeeded();
  await page.locator("#model").screenshot({ path: path.join(output, "03-model-proof.png") });
  captures.push("03-model-proof.png");

  await page.getByLabel("Weekly capacity", { exact: true }).selectOption("1");
  await page.getByLabel("Unavailable week", { exact: true }).selectOption("");
  await run();
  assert.match(await page.getByRole("status").innerText(), /Infeasible/);
  assert.equal(await page.locator(".access").count(), 0);
  assert.match(await page.locator("#explanation").innerText(), /only 8/);
  await page.locator("#proof").evaluate((el) => { el.open = false; });
  await page.getByRole("link", { name: "RailPlan Algorithm lab home", exact: true }).focus();
  await page.evaluate(() => window.scrollTo(0, 0));
  await screenshot("04-infeasible.png");

  await page.getByLabel("Weekly capacity", { exact: true }).selectOption("3");
  await run();
  assert.equal(await cost(), "3");
  await page.getByLabel("Weekly capacity", { exact: true }).selectOption("2");
  await page.getByLabel("Enforce predecessors", { exact: true }).uncheck();
  await run();
  assert.equal(await cost(), "2");
  assert.match(await page.locator("#schedule-basis").innerText(), /predecessors off/);

  await page.getByLabel("Enforce predecessors", { exact: true }).check();
  await page.route(solveUrl, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "Temporary test outage. Try again." } }) }), { times: 1 });
  await run();
  assert.equal(await page.getByRole("alert").isVisible(), true);
  assert.match(await page.getByRole("status").innerText(), /previous result/);
  assert.equal(await cost(), "2");
  await run();
  assert.equal(await cost(), "5");
  assert.equal(await page.getByRole("alert").isVisible(), false);

  await page.route(solveUrl, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue();
  }, { times: 1 });
  await page.getByRole("button", { name: "Run CP-SAT", exact: true }).click();
  assert.equal(await page.getByLabel("Weekly capacity", { exact: true }).isDisabled(), true);
  assert.equal(await page.locator("#solve").isDisabled(), true);
  await ready();

  await page.getByLabel("Weekly capacity", { exact: true }).focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.id), "closed-week");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.id), "predecessors");
  await page.getByRole("button", { name: "Inspect A02 Replace rail", exact: true }).click();
  assert.match(await page.locator("#explanation").innerText(), /after A01 finishes in week 1/);

  for (const [width, height] of [[1280, 800], [390, 844], [768, 1024]]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (width === 390) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await screenshot("05-mobile.png", true);
      await page.getByRole("button", { name: "Run CP-SAT", exact: true }).scrollIntoViewIfNeeded();
      await run();
      assert.equal(await cost(), "5");
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true);
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(baseUrl);
  await ready();
  await screenshot("06-full-demo.png", true);
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "browser-qa.json"), JSON.stringify({
    baseUrl, verifiedAt: new Date().toISOString(), captures,
    checks: ["real default solve", "closed-week cost and full workload", "dirty state preserves result", "proof disclosure", "actual JSON download", "infeasible no partial plan", "capacity and predecessor changes", "503 recovery", "pending controls", "keyboard order", "row explanation", "1280/390/768 responsive", "reduced motion", "no page errors"],
    errors,
  }, null, 2));
  console.log(JSON.stringify({ passed: 14, captures, errors }));
} finally {
  await browser.close();
}
