import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";
// Local performance profiling against the disposable stack (production build).
export default defineConfig({
  testDir: "tests/perf",
  workers: 1,
  timeout: 300000,
  use: {
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    },
    baseURL: "http://127.0.0.1:3001",
  },
  webServer: {
    command: "npm run build && npm run start -- --port 3001",
    url: "http://127.0.0.1:3001/login",
    reuseExistingServer: false,
    timeout: 300000,
  },
  reporter: "list",
});
