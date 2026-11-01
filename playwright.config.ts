import { defineConfig, devices } from "@playwright/test";

// Smoke tests (CRU-57) against a production build of the app (strict nonce
// CSP included) running on the local Supabase stack: `bun run db:start &&
// bun run db:env`, then `bun run test:e2e`, which builds with the Node server
// preset first. They sign in as the seed accounts in supabase/seed.sql, so
// never point them at a hosted project.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  expect: { timeout: 15_000 },
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node --env-file=.env.local .output/server/index.mjs",
    env: { PORT: "8080", NODE_ENV: "production" },
    url: "http://localhost:8080",
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});
