import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

// The saved calendar link never comes back to the browser (CRU-65). A marker
// stands in for the encrypted value, since nothing here should ever decrypt it.
const PASSWORD = "feed-link-password";
const STORED = "stored-value-must-stay-on-the-server";

test("settings shows a connected calendar without its link", async ({ page }) => {
  process.loadEnvFile(".env.local");
  const url = process.env["SUPABASE_URL"]!;
  if (new URL(url).hostname !== "127.0.0.1") throw new Error(`Not the local stack: ${url}`);
  const admin = createClient(url, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const email = `e2e-${crypto.randomUUID()}@myemeris.edu.za`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;

  try {
    await page.goto("/auth");
    await page.getByLabel("University email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    const { error: insertError } = await admin
      .from("calendar_sources")
      .insert({ user_id: data.user.id, ics_url_encrypted: STORED });
    if (insertError) throw insertError;

    const bodies: Promise<string>[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/_serverFn/")) bodies.push(response.text());
    });
    await page.goto("/settings");

    await expect(page.getByText("Your calendar is connected.")).toBeVisible();
    await expect(page.getByLabel("Replace your Brightspace subscription URL")).toHaveValue("");
    await expect(page.getByRole("button", { name: "Save feed" })).toBeDisabled();

    for (const body of await Promise.all(bodies)) expect(body).not.toContain(STORED);
    expect(bodies.length).toBeGreaterThan(0);
  } finally {
    await admin.auth.admin.deleteUser(data.user.id);
  }
});
