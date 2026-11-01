import { defineConfig } from "@playwright/test";

// Drives the real interface against a real local model. It needs a running server, so `npm test` never starts it.
export default defineConfig({
  testDir: "e2e-local",
  workers: 1,
  reporter: "list",
  timeout: 45 * 60_000,
  use: { baseURL: "http://127.0.0.1:8787", channel: "chrome", viewport: { width: 1280, height: 900 } },
});
