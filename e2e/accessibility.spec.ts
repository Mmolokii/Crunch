import AxeBuilder from "@axe-core/playwright";
import { devices, expect, test, type Page } from "@playwright/test";

// Mobile and accessibility pass (CRU-41). Every page, at phone width, must
// have no WCAG 2.1 A/AA violations that axe can detect and must not scroll
// sideways. Signed-in pages use the seed accounts (supabase/seed.sql).
const PASSWORD = "crunch-local";

test.use({ ...devices["Pixel 7"] });

async function signIn(page: Page, email: string, landing: RegExp) {
  await page.goto("/auth");
  await page.getByLabel("University email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(landing);
}

async function check(page: Page, path: string) {
  if (path) await page.goto(path);
  await page.waitForLoadState("networkidle");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const violations = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n` +
      v.nodes
        .slice(0, 5)
        .map((n) => `    ${n.target.join(" ")}  ${n.failureSummary?.split("\n")[1]?.trim() ?? ""}`)
        .join("\n"),
  );

  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((el) => el.getBoundingClientRect().right > width + 1)
      .filter((el) => !el.closest("[data-allow-overflow]"))
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 3).join(".")}`);
    return { scroll: document.documentElement.scrollWidth > width, wide };
  });

  expect.soft(violations, `axe violations on ${page.url()}`).toEqual([]);
  expect.soft(overflow.scroll ? overflow.wide : [], `sideways scroll on ${page.url()}`).toEqual([]);
}

for (const path of ["/", "/about", "/privacy", "/terms", "/contact", "/auth"]) {
  test(`public ${path}`, async ({ page }) => {
    await check(page, path);
  });
}

test("sign-in form errors", async ({ page }) => {
  await page.goto("/auth");
  await page.getByLabel("University email").fill("someone@gmail.com");
  await page.getByLabel("Password").fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await check(page, "");
});

test("student pages", async ({ page }) => {
  await signIn(page, "student01@myemeris.edu.za", /\/dashboard$/);
  for (const path of [
    "/dashboard",
    "/today",
    "/insights",
    "/log-hours",
    "/settings",
    "/onboarding",
  ]) {
    await check(page, path);
  }
  await page.goto("/dashboard");
  await page.locator('a[href^="/week/"]').first().click();
  await expect(page).toHaveURL(/\/week\//);
  await check(page, "");
});

test("lecturer pages", async ({ page }) => {
  await signIn(page, "lecturer@myemeris.edu.za", /\/(lecturer|dashboard)/);
  await check(page, "/lecturer");
  await check(page, "/lecturer/due-dates");
});
