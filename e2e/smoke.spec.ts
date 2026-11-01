import { expect, test as base, type Page } from "@playwright/test";

// Seed accounts (supabase/seed.sql); local stack only.
const PASSWORD = "crunch-local";

// Every test fails if its page throws or logs a console error.
const test = base.extend<{ page: Page }>({
  page: async ({ page }, provide) => {
    const problems: string[] = [];
    page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") problems.push(`console: ${msg.text()}`);
    });
    await provide(page);
    expect(problems).toEqual([]);
  },
});

async function signIn(page: Page, email: string) {
  await page.goto("/auth");
  await page.getByLabel("University email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("landing page renders with a nonce-based CSP", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src[^;]*'nonce-[A-Za-z0-9+/=]+'/);
  await expect(page.getByRole("link", { name: /sign in|get started/i }).first()).toBeVisible();
});

test("sign-up refuses a non-university email", async ({ page }) => {
  await page.goto("/auth");
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("University email").fill("someone@gmail.com");
  await page.getByLabel("Password").fill(PASSWORD);
  await page
    .getByRole("button", { name: /create account/i })
    .last()
    .click();
  await expect(page.getByText(/subdomains aren't accepted/)).toBeVisible();
  await expect(page).toHaveURL(/\/auth$/);
});

test("a student signs in and sees their weeks", async ({ page }) => {
  await signIn(page, "student01@myemeris.edu.za");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "The weeks ahead" })).toBeVisible();
  await expect(page.getByText("No due dates yet")).toHaveCount(0);
  // The seed puts Class Test 2 and the ADDB6311 semester test on the same day.
  await expect(page.getByText("Same-day high-stakes clashes")).toBeVisible();
  await expect(page.getByText(/class test 2 and Advanced Databases semester test/i)).toBeVisible();
});

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth$/);
});

test("a lecturer sees the heatmap for a large course and nothing for a small one", async ({
  page,
}) => {
  await signIn(page, "lecturer@myemeris.edu.za");
  await expect(page).toHaveURL(/\/lecturer$/);
  await expect(page.getByRole("heading", { name: "Heaviest weeks" })).toBeVisible();
  await expect(page.getByText("Cohort too small to show")).toHaveCount(0);

  await page.getByLabel("Course").selectOption("XISD5319");
  await expect(page.getByText("Cohort too small to show")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Heaviest weeks" })).toHaveCount(0);
});

test("a brand-new student's first sign-in creates their account", async ({ page }) => {
  await signIn(page, "newstudent@myemeris.edu.za");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("No due dates yet")).toBeVisible();
  await expect(page.getByRole("link", { name: "Connect calendar" })).toBeVisible();
});
