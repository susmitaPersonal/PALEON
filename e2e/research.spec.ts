import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import sharp from "sharp";

const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

// A generated image with three separate marks. It proves the workflow, and says nothing about real inscriptions.
const image = () => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="120"><rect width="100%" height="100%" fill="#fff"/>
  <rect x="40" y="30" width="12" height="60"/><path d="M130 30h12v48h26v12h-38z"/><rect x="240" y="30" width="12" height="60"/></svg>`)).png().toBuffer();

test("a researcher takes an inscription from image to a hedged report", async ({ page }) => {
  await page.goto("/cases");
  await page.getByLabel("Inscription image").setInputFiles({ name: "stone.png", mimeType: "image/png", buffer: await image() });
  await page.getByLabel("Title").fill(`Generated stone ${Date.now()}`);
  await page.getByLabel("Rights and licence").fill("Generated test image");
  await page.getByRole("button", { name: "Create case" }).click();
  await expect(page.getByText("Revision 2")).toBeVisible();

  await page.getByLabel("Script for reading").selectOption("latin");
  await expect(page.getByText("Revision 3")).toBeVisible();
  await page.getByRole("button", { name: "Find signs" }).click();
  await expect(page.getByRole("heading", { name: "Signs (3)" })).toBeVisible();
  await page.getByLabel("Your name").fill("Test Researcher");

  await page.getByRole("button", { name: "Draw boxes" }).click();
  const frame = (await page.locator("figure.inscription svg").boundingBox())!;
  await page.mouse.move(frame.x + frame.width * 0.8, frame.y + frame.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(frame.x + frame.width * 0.9, frame.y + frame.height * 0.8, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole("heading", { name: "Signs (4)" })).toBeVisible();
  await page.getByRole("button", { name: "Stop drawing" }).click();
  await page.getByLabel("Selected sign").selectOption("0");

  await page.getByLabel("Status").selectOption("certain");
  await page.getByRole("button", { name: "Add reading" }).click();
  await page.getByLabel("Reading 1").selectOption({ label: "V u / v" });
  await page.getByRole("button", { name: "Save readings" }).click();
  await expect(page.locator("pre.reading")).toContainText("(ụ/ṿ)");

  await page.getByLabel("Language").selectOption("latin");
  await expect(page.getByText(/Words with a lexical match: 0/)).toBeVisible();

  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => (await (window as any).axe.run()).violations.map((item: { id: string }) => item.id));
  expect(violations).toEqual([]);

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export report (Markdown)" }).click();
  expect((await download).suggestedFilename()).toMatch(/^paleon-.*\.md$/);

  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete case" }).click();
  await expect(page.getByRole("heading", { name: "Research cases" })).toBeVisible();
});
