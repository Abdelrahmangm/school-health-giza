import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "authenticated.spec.ts",
  workers: 1,
  expect: { timeout: 15000 },
  timeout: 180000,
  use: {
    actionTimeout: 15000,
    navigationTimeout: 30000,
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    },
    baseURL: "http://127.0.0.1:3001",
  },
  webServer: {
    command: "npm run dev -- --port 3001",
    url: "http://127.0.0.1:3001/login",
    reuseExistingServer: false,
    timeout: 60000,
  },
  reporter: "list",
});
