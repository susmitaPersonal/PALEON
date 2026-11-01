import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

const axePath = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const axeSource = readFileSync(axePath, "utf8");

/** Synthetic marks on a flat surface. No dataset image is used here. */
const syntheticImage = () => sharp({
  create: { width: 640, height: 420, channels: 3, background: { r: 176, g: 160, b: 132 } },
}).composite([{ input: Buffer.from(`<svg width="640" height="420"><g stroke="#3b3227" stroke-width="9" fill="none">
  <path d="M90 130 l50 110 M170 130 v110 l50 -55 M270 130 h70 M305 130 v110 M380 240 l40 -110 l40 110 M500 130 v110 h50"/></g></svg>`) }]).png().toBuffer();

const chooseImage = async (page: Page, name = "synthetic.png") =>
  page.getByLabel(/Choose an image/).setInputFiles({ name, mimeType: "image/png", buffer: await syntheticImage() });

const investigate = async (page: Page, scenario: string) => {
  await page.goto("/investigate");
  await chooseImage(page);
  await page.getByLabel(/Simulated scenario/).selectOption(scenario);
  await page.getByRole("button", { name: "Analyse image" }).click();
};

const noHorizontalScroll = async (page: Page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
};

const accessibilityViolations = async (page: Page) => {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const { violations } = await (window as any).axe.run();
    return violations.map((violation: any) => `${violation.id}: ${violation.nodes.map((node: any) => node.target).join(" ")}`);
  });
};

test("health and readiness pass", async ({ request }) => {
  expect((await (await request.get("/health")).json()).data.status).toBe("ok");
  expect((await (await request.get("/ready")).json()).data).toMatchObject({ status: "ready", scripts: 6, simulated: true });
});

test("demo mode is clearly labelled, and needs no key", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("note")).toContainText("simulated fixtures, not AI inference");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Investigate an unfamiliar inscription");
});

test("full investigation with ambiguous candidates", async ({ page }, info) => {
  await investigate(page, "ambiguous_candidates");
  await expect(page.getByRole("heading", { name: "Candidate scripts found" })).toBeVisible();
  await expect(page.getByText("Simulated result", { exact: true })).toBeVisible();
  await expect(page.locator(".candidate")).toHaveCount(3);
  await expect(page.getByText("Expert review recommended.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Seen in the image" })).toContainText("AI observation, not verified");

  const reference = page.getByRole("region", { name: "Brahmi: reference record" });
  await expect(reference).toContainText("third century BCE");
  await expect(reference.getByRole("link", { name: /View source/ }).first()).toHaveAttribute("href", /unicode\.org/);

  await expect(page.getByRole("region", { name: "Compare candidates" })).toContainText("Writing direction: no stored claim for Brahmi");
  await page.getByLabel("Pair to compare").selectOption({ label: "Brahmi and Phoenician" });
  await expect(page.getByRole("region", { name: "Compare candidates" })).toContainText("Phoenician reference characters");
  await expect(page.getByText("does not establish historical descent")).toBeVisible();

  expect(await page.locator("main").innerText()).not.toMatch(/\d\s*%/);
  await noHorizontalScroll(page);
  await page.screenshot({ path: `docs/screenshots/results-${info.project.name}.png`, fullPage: true });
});

test.describe("abstaining outcomes", () => {
  for (const [scenario, heading] of [["out_of_scope", "Outside the supported scripts"], ["no_writing", "No writing detected"],
    ["insufficient_evidence", "Not enough evidence to identify a script"]] as const) {
    test(scenario, async ({ page }) => {
      await investigate(page, scenario);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      await expect(page.locator(".candidate")).toHaveCount(0);
    });
  }
});

test("the same image gets the same automatic result", async ({ page }) => {
  await investigate(page, "auto");
  await page.waitForURL("**/results");
  const first = await page.locator("#result-heading").innerText();
  await investigate(page, "auto");
  await page.waitForURL("**/results");
  expect(await page.locator("#result-heading").innerText()).toBe(first);
});

test("an invalid upload is rejected by the server, whatever its name says", async ({ page }) => {
  await page.goto("/investigate");
  await page.getByLabel(/Choose an image/).setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("<svg onload=alert(1)>") });
  await page.getByRole("button", { name: "Analyse image" }).click();
  await expect(page.getByRole("alert")).toContainText("Upload a JPEG, PNG, or WebP image.");
  await expect(page).toHaveURL(/investigate/);
});

test("a non-image is rejected in the browser", async ({ page }) => {
  await page.goto("/investigate");
  await page.getByLabel(/Choose an image/).setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("x") });
  await expect(page.getByRole("alert")).toContainText("Choose a JPEG, PNG, or WebP image.");
});

test("a provider failure can be retried", async ({ page }) => {
  await investigate(page, "provider_failure");
  await expect(page.getByRole("alert")).toContainText("The analysis service is unavailable");
  await page.getByLabel(/Simulated scenario/).selectOption("clear_candidate");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Candidate scripts found" })).toBeVisible();
});

test("reference pages load, and citations resolve to stored sources", async ({ page, request }, info) => {
  await page.goto("/scripts");
  await page.getByRole("link", { name: /Kharosthi/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Kharosthi");
  await expect(page.getByRole("region", { name: "Reference record" })).toContainText("right to left");
  await expect(page.getByText("Not reviewed by an epigrapher")).toBeVisible();
  const citation = page.getByRole("link", { name: "Source 1" }).first();
  const target = await citation.getAttribute("href");
  await expect(page.locator(target!)).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: `docs/screenshots/script-${info.project.name}.png`, fullPage: true });

  const listing = await (await request.get("/api/v1/scripts")).json();
  for (const script of listing.data) {
    const { data } = await (await request.get(`/api/v1/scripts/${script.id}`)).json();
    const ids = new Set(data.sources.map((source: { id: string }) => source.id));
    const claims = [data.script.historicalPeriod, data.script.geographicDistribution, data.script.directionality,
      ...data.script.characteristics, ...data.script.relationships].filter(Boolean);
    for (const claim of claims) for (const id of claim.sourceIds) expect(ids.has(id)).toBe(true);
  }
});

test("standalone comparison works", async ({ page }) => {
  await page.goto("/compare");
  await expect(page.getByText("Writing direction: no stored claim for Brahmi")).toBeVisible();
  await page.getByLabel("First script").selectOption("phoenician");
  await page.getByLabel("Second script").selectOption("greek");
  await expect(page.locator("main")).toContainText("Written horizontally from right to left.");
});

test("an unknown API route and page fail cleanly", async ({ page, request }) => {
  expect((await (await request.get("/api/v1/nothing")).json()).error.code).toBe("not_found");
  await page.goto("/nowhere");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test("the server sends a content security policy, and the app runs under it", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const response = await page.goto("/");
  expect(response!.headers()["content-security-policy"]).toContain("default-src 'self'");
  await expect(page.getByRole("link", { name: "Brahmi" }).first()).toBeVisible();
  await investigate(page, "ambiguous_candidates");
  await expect(page.getByRole("heading", { name: "Candidate scripts found" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(errors).toEqual([]);
});

test("every page fits a narrow viewport and passes an accessibility scan", async ({ page }) => {
  for (const path of ["/", "/investigate", "/scripts", "/scripts/brahmi", "/compare", "/transparency"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await noHorizontalScroll(page);
    expect(await accessibilityViolations(page), path).toEqual([]);
  }
});

test("the results page passes an accessibility scan", async ({ page }) => {
  await investigate(page, "ambiguous_candidates");
  await expect(page.getByText("Phoenician: reference record")).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(await accessibilityViolations(page)).toEqual([]);
});

test("the upload flow works from the keyboard", async ({ page }) => {
  await page.goto("/investigate");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeVisible();
  await chooseImage(page);
  await page.getByRole("button", { name: "Analyse image" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/results/);
});

test("home screenshot", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Brahmi" }).first()).toBeVisible();
  await page.screenshot({ path: `docs/screenshots/home-${info.project.name}.png`, fullPage: true });
});
