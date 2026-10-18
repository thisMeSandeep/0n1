import { defineConfig, devices } from "@playwright/test";
import { BUILD_DIR } from "./tests/e2e/build.ts";

const PORT = 4173;
/** A production build, for what only exists there: the service worker (S47). */
const BUILD_PORT = 4174;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: "**/*.build.spec.ts",
    },
    {
      name: "chromium-build",
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${BUILD_PORT}` },
      testMatch: "**/*.build.spec.ts",
    },
  ],
  webServer: [
    {
      command: `bunx vite --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !isCI,
    },
    {
      command: `bunx vite build --outDir ${BUILD_DIR} --emptyOutDir --logLevel warn && bunx vite preview --outDir ${BUILD_DIR} --port ${BUILD_PORT} --strictPort`,
      url: `http://localhost:${BUILD_PORT}`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
});
