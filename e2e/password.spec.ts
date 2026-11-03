import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

// Password reset and change (CRU-64), and confirming an email ending signed
// out. The local stack runs no mail server, so links come from the admin API,
// on throwaway accounts so the seed accounts keep their passwords.
const OLD_PASSWORD = "old-password-1";
const NEW_PASSWORD = "new-password-2";

let admin: SupabaseClient;
const created: string[] = [];

test.beforeAll(() => {
  process.loadEnvFile(".env.local");
  const url = process.env["SUPABASE_URL"]!;
  if (new URL(url).hostname !== "127.0.0.1") throw new Error(`Not the local stack: ${url}`);
  admin = createClient(url, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
});

test.afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

async function newAccount(): Promise<string> {
  const email = `e2e-${crypto.randomUUID()}@myemeris.edu.za`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: OLD_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  created.push(data.user.id);
  return email;
}

async function linkFor(type: "recovery" | "magiclink", email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({ type, email });
  if (error) throw error;
  return `/auth/confirm?token_hash=${data.properties.hashed_token}&type=${type}`;
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/auth");
  await page.getByLabel("University email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("a reset link sets a new password, names the account and ends the session", async ({
  page,
}) => {
  const email = await newAccount();
  await page.goto(await linkFor("recovery", email));
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/auth\/reset$/);
  await expect(page.getByText(email)).toBeVisible();

  await page.getByLabel("New password", { exact: true }).fill("short");
  await page.getByLabel("Repeat new password").fill("short");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText(/at least 10 characters/i)).toBeVisible();

  await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Repeat new password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL(/\/auth$/);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth$/);

  await signIn(page, email, OLD_PASSWORD);
  await expect(page.getByText(/invalid login credentials/i)).toBeVisible();

  await signIn(page, email, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("a used reset link doesn't work twice", async ({ page }) => {
  const email = await newAccount();
  const link = await linkFor("recovery", email);
  await page.goto(link);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/auth\/reset$/);

  await page.evaluate(() => localStorage.clear());
  await page.goto(link);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("This link didn't work")).toBeVisible();
});

test("settings changes the password only with the current one", async ({ page }) => {
  const email = await newAccount();
  await signIn(page, email, OLD_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/settings");

  await page.getByLabel("Current password").fill("not-the-password");
  await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Repeat new password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Your current password isn't right.")).toBeVisible();

  await page.getByLabel("Current password").fill(OLD_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText(/Password changed/)).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL(/\/auth$/);
  await signIn(page, email, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("confirming an email leaves nobody signed in", async ({ page }) => {
  const email = await newAccount();
  await page.goto(await linkFor("magiclink", email));
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page).toHaveURL(/\/auth$/);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth$/);
});

test("forgot password answers the same for an unknown address", async ({ page }) => {
  await page.goto("/auth");
  await page.getByRole("button", { name: "Forgot your password?" }).click();
  await page.getByLabel("University email").fill(`nobody-${crypto.randomUUID()}@myemeris.edu.za`);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/If that address has a Crunch account/)).toBeVisible();
});

test("deleting an account needs the password; a wrong one deletes nothing", async ({ page }) => {
  const email = await newAccount();
  await signIn(page, email, OLD_PASSWORD);
  await expect(page).not.toHaveURL(/\/auth$/);
  await page.goto("/settings");

  // The Overview tells IT that passwords never reach Crunch's own server.
  const secret = "not-the-password";
  const leaked: string[] = [];
  page.on("request", (request) => {
    const body = request.postData() ?? "";
    const toCrunch = new URL(request.url()).hostname === "localhost";
    if (toCrunch && (body.includes(secret) || body.includes(OLD_PASSWORD))) {
      leaked.push(request.url());
    }
  });

  await page.getByRole("button", { name: "Delete account" }).click();
  const confirm = page.getByRole("button", { name: "Delete permanently" });
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await expect(confirm).toBeDisabled();

  await page.getByLabel("Your password").fill(secret);
  await confirm.click();
  await expect(page.getByRole("alert").filter({ hasText: "isn't right" })).toBeVisible();
  const { data: stillThere } = await admin.auth.admin.listUsers();
  expect(stillThere.users.some((u) => u.email === email)).toBe(true);

  await page.getByLabel("Your password").fill(OLD_PASSWORD);
  await confirm.click();
  await expect(page).toHaveURL(/\/$/);
  expect(leaked).toEqual([]);
  const { data: after } = await admin.auth.admin.listUsers();
  expect(after.users.some((u) => u.email === email)).toBe(false);
});
