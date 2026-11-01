import { defineConfig, devices } from "@playwright/test";

const PORT = 8799;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://127.0.0.1:${PORT}`, channel: "chrome", bypassCSP: false, trace: "off" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel: "chrome" } },
  ],
  webServer: {
    command: "npm run build && npm run start -w @scriptecho/api",
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { PORT: String(PORT), RATE_LIMIT_PER_MINUTE: "1000", LOG_LEVEL: "warn", MODEL_PROVIDER: "mock" },
  },
});
