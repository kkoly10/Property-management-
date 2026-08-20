import { test, expect } from "@playwright/test";

// Connected-mode E2E — messaging (resident <-> operator, one auto-provisioned conversation).
// Resident sends a message; operator reads it and replies; resident sees the reply.
// E2E_CONV_ID is the operator_resident conversation id (provisioned by sync_relationship_conversation).
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const RES_EMAIL = process.env.E2E_RESIDENT_EMAIL;
const RES_PASSWORD = process.env.E2E_RESIDENT_PASSWORD;
const CONV = process.env.E2E_CONV_ID;
const CONFIGURED = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && EMAIL && PASSWORD && RES_EMAIL && RES_PASSWORD && CONV);
test.skip(!CONFIGURED, "Set connected env + resident creds + E2E_CONV_ID to run the messaging leg.");

test.describe.configure({ mode: "serial" });

const FROM_RESIDENT = `Resident ping ${String(Date.now()).slice(-6)}`;
const FROM_OPERATOR = `Operator reply ${String(Date.now()).slice(-6)}`;

async function signIn(page: import("@playwright/test").Page, email: string, password: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

async function sendMessage(page: import("@playwright/test").Page, text: string) {
  const box = page.getByRole("textbox", { name: /Message/i });
  await box.fill(text);
  await page.getByRole("button", { name: /^Send$/ }).click();
  // The thread only clears the textarea on a persisted send (router.refresh re-renders the
  // server messages); on failure it keeps the text and shows an error alert. Assert the
  // cleared textarea + the rendered message bubble so a failed send cannot false-pass.
  await expect(box).toHaveValue("", { timeout: 30_000 });
  await expect(page.locator("p", { hasText: text })).toBeVisible();
}

test("resident sends a message to the operator", async ({ page }) => {
  await signIn(page, RES_EMAIL!, RES_PASSWORD!, `/messages/${CONV}`);
  await page.goto(`/messages/${CONV}`);
  await sendMessage(page, FROM_RESIDENT);
});

test("operator sees the resident message and replies", async ({ page }) => {
  await signIn(page, EMAIL!, PASSWORD!, `/app/messages/${CONV}`);
  await page.goto(`/app/messages/${CONV}`);
  await expect(page.getByText(FROM_RESIDENT).first()).toBeVisible({ timeout: 30_000 });
  await sendMessage(page, FROM_OPERATOR);
});

test("resident sees the operator reply", async ({ page }) => {
  await signIn(page, RES_EMAIL!, RES_PASSWORD!, `/messages/${CONV}`);
  await page.goto(`/messages/${CONV}`);
  await expect(page.getByText(FROM_OPERATOR).first()).toBeVisible({ timeout: 30_000 });
});
