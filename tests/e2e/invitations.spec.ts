import { test, expect, type Page } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Requires the local stack (scripts/test-integration-local.sh) which captures mail in MAIL_SINK_DIR.
const sink = process.env.MAIL_SINK_DIR;
const password = "DEMO-only-password-2026!";

function decodeQuotedPrintable(text: string) {
  return text.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
async function latestLink(to: string, after: number) {
  for (let i = 0; i < 40; i++) {
    const files = sink ? readdirSync(sink).filter((f) => Number(f.split("-")[0]) >= after) : [];
    for (const f of files.sort().reverse()) {
      const mail = decodeQuotedPrintable(readFileSync(path.join(sink!, f), "utf8"));
      if (!mail.toLowerCase().includes(to)) continue;
      const href = mail.match(/https?:\/\/[^\s"'<>]+\/verify\?[^\s"'<>]+/)?.[0];
      if (href) return href.replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("No DEMO e-mail captured for " + to);
}
async function login(page: Page, email: string, pass: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(pass);
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
}

test("supervisor invites by name/e-mail/role, invitee sets own password, access is scoped, reset and disable work", async ({ browser }) => {
  test.skip(!sink, "Needs the local SMTP sink (scripts/test-integration-local.sh)");
  test.setTimeout(180000);
  const adminContext = await browser.newContext();
  const userContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const user = await userContext.newPage();
  const email = "demo-invited@example.test";
  try {
    await login(admin, "demo-admin@example.test", password);
    await expect(admin).toHaveURL("http://127.0.0.1:3001/");
    await admin.goto("/users");
    const started = Date.now();
    await admin.getByLabel("الاسم بالكامل").fill("DEMO مسؤول تجريبي");
    await admin.getByLabel("الإيميل").fill(email);
    await admin.getByLabel("الدور").first().selectOption("administration_data_entry");
    await admin.getByLabel("الإدارة الصحية").first().selectOption({ label: "الوراق" });
    await admin.getByRole("button", { name: "إرسال الدعوة", exact: true }).click();
    await expect(admin.getByRole("status")).toContainText("إرسال الدعوة");
    await expect(admin.getByText("DEMO مسؤول تجريبي")).toBeVisible();

    // The invitee opens the e-mail link and chooses a password — nobody else ever knows it.
    await user.goto(await latestLink(email, started));
    await expect(user.getByRole("heading", { name: /اختار كلمة السر/ })).toBeVisible();
    expect(user.url()).not.toContain("access_token");
    await user.getByLabel("كلمة السر الجديدة").fill("short1");
    await user.getByLabel("اكتبها تاني للتأكيد").fill("short1");
    await user.getByRole("button", { name: "حفظ كلمة السر" }).click();
    await expect(user.getByLabel("كلمة السر الجديدة")).toBeVisible();
    const chosen = "DEMO invited choice 2026";
    await user.getByLabel("كلمة السر الجديدة").fill(chosen);
    await user.getByLabel("اكتبها تاني للتأكيد").fill(chosen);
    await user.getByRole("button", { name: "حفظ كلمة السر" }).click();
    await expect(user).toHaveURL(/\/\?msg=password_updated$/);
    await expect(user.getByRole("status")).toContainText("كلمة السر");
    // Scoped to الوراق only, no user administration menu.
    await user.goto("/reports/new");
    await expect(user.getByLabel("الإدارة").locator("option")).toHaveText(["الوراق"]);
    await expect(user.getByRole("link", { name: "المستخدمون والصلاحيات" })).toHaveCount(0);

    // Forgot password: generic confirmation, then a working reset link.
    await userContext.clearCookies();
    const resetStarted = Date.now();
    await user.goto("/auth/forgot");
    await user.getByLabel("الإيميل").fill(email);
    await user.getByRole("button", { name: "ابعتلي الرابط" }).click();
    await expect(user.getByRole("status")).toContainText("لو الإيميل ده متسجل");
    await user.goto(await latestLink(email, resetStarted));
    await expect(user.getByRole("heading", { name: /كلمة السر/ })).toBeVisible();
    const second = "DEMO reset choice 2027";
    await user.getByLabel("كلمة السر الجديدة").fill(second);
    await user.getByLabel("اكتبها تاني للتأكيد").fill(second);
    await user.getByRole("button", { name: "حفظ كلمة السر" }).click();
    await expect(user).toHaveURL(/msg=password_updated/);
    await userContext.clearCookies();
    await login(user, email, second);
    await expect(user).toHaveURL("http://127.0.0.1:3001/");

    // Supervisor disables the account: it loses access immediately.
    await admin.goto("/users");
    const row = admin.locator("tr", { hasText: email });
    await row.getByText("تعديل").click();
    await row.getByLabel("حالة الحساب").selectOption("disabled");
    await row.getByRole("button", { name: "حفظ", exact: true }).click();
    await expect(admin.getByRole("status")).toContainText("اتحفظت الصلاحية");
    await user.goto("/reports");
    await expect(user).toHaveURL(/\/login/);
    console.log("DEMO: invitation, password set/reset and disable checked");
  } finally {
    await adminContext.close();
    await userContext.close();
  }
});
