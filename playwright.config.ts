import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  timeout: 45000,
  expect: { timeout: 12000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.FORMA_TEST_URL || "http://localhost:5186",
    channel: "msedge",
    viewport: { width: 1512, height: 982 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
