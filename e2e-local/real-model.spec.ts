import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import sharp from "sharp";

// REAL inference. No request here is mocked. Results say nothing about accuracy, and they are not M0 results.
const ROW = process.env.DATASET_ROW ?? "SE031";
const IMAGE = resolve(`experiments/m0_feasibility/data/images/${ROW}.jpg`);
const RECORDS = resolve("experiments/local_vlm/records");

test("the page says a real local model is active, with no demo controls", async ({ page }) => {
  await page.goto("/investigate");
  await expect(page.getByRole("note")).toContainText("analysed on this computer by qwen2.5vl:3b");
  await expect(page.getByText(/simulated fixtures/)).toHaveCount(0);
  await expect(page.getByLabel(/Simulated scenario/)).toHaveCount(0);
  await expect(page.getByText(/third-party/)).toHaveCount(0);
});

test("cancelling stops a real analysis and leaves the page usable", async ({ page }) => {
  const blank = await sharp({ create: { width: 256, height: 256, channels: 3, background: "#ffffff" } }).png().toBuffer();
  await page.goto("/investigate");
  await page.locator("input[type=file]").setInputFiles({ name: "blank.png", mimeType: "image/png", buffer: blank });
  await page.getByRole("button", { name: "Analyse image" }).click();
  await expect(page.getByRole("status")).toContainText("local model is examining");
  await page.waitForTimeout(8000);
  await page.getByRole("button", { name: "Cancel analysis" }).click();
  await expect(page.getByText("The analysis was cancelled.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Analyse image" })).toBeEnabled();
});

test("a real inscription goes through the interface to a downloaded report", async ({ page }) => {
  const network: string[] = [];
  const consoleErrors: string[] = [];
  page.on("response", (response) => { if (response.url().includes("/api/")) network.push(`${response.request().method()} ${new URL(response.url()).pathname} ${response.status()} ${response.headers()["content-type"] ?? ""}`); });
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  const started = Date.now();
  await page.goto("/investigate");
  await page.locator("input[type=file]").setInputFiles(IMAGE);
  await expect(page.getByAltText(/Preview of/)).toBeVisible();
  await page.getByRole("button", { name: "Analyse image" }).click();
  await expect(page.getByRole("status")).toContainText(/\(\d+ s\)/);
  await expect(page.getByRole("button", { name: "Analysing" })).toBeDisabled();
  await expect(page.getByText("Local model result")).toBeVisible({ timeout: 40 * 60_000 });
  await expect(page.getByText("Genuine local model inference, on this computer")).toBeVisible();
  await expect(page.getByText("qwen2.5vl:3b", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/simulated/i)).toHaveCount(0);
  await expect(page.getByText(/\d+\s?%/)).toHaveCount(0);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download report (JSON)" }).click()]);
  mkdirSync(RECORDS, { recursive: true });
  const path = resolve(RECORDS, `browser-${ROW}-${Date.now()}.json`);
  await download.saveAs(path);
  const report = JSON.parse(await (await import("node:fs/promises")).readFile(path, "utf8"));
  expect(report.result.provenance).toMatchObject({ simulated: false, inferenceMode: "local" });
  const evidence = { row: ROW, browserMs: Date.now() - started, network, consoleErrors, status: report.result.status };
  writeFileSync(`${path}.page.txt`, `${JSON.stringify(evidence, null, 2)}\n\n${await page.locator("main").innerText()}\n`);
  expect(consoleErrors).toEqual([]);
});
