import { test, expect, type Page } from "@playwright/test";
import { weekFor } from "../../lib/domain";
const password = "DEMO-only-password-2026!";
async function login(page: Page, name: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(`demo-${name}@example.test`);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3001/");
}
async function metric(page: Page, index: number, value: string) {
  await expect(page.locator(".metric strong").nth(index)).toHaveText(value);
}
test("DEMO end-to-end: scoped entry → review → official amendment → annual target", async ({
  browser,
  request,
}) => {
  test.setTimeout(180000);
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () => browser.newContext()),
  );
  const [entry, admin, viewer, other] = await Promise.all(
    contexts.map((c) => c.newPage()),
  );
  try {
    entry.on("pageerror", (e) => console.log("Browser error:", e.message));
    await login(entry, "entry");
    console.log("DEMO: entry authenticated");
    await entry
      .getByRole("link", { name: "البلاغات الأسبوعية", exact: true })
      .click();
    await entry.getByRole("link", { name: "+ بلاغ جديد" }).click();
    await entry
      .getByLabel("بداية الأسبوع (الأحد)")
      .fill(weekFor(new Date().toISOString()));
    await entry
      .getByRole("checkbox", { name: "تضمين عام أولى ابتدائي", exact: true })
      .check();
    await entry
      .getByRole("spinbutton", {
        name: "المفحوصون عام أولى ابتدائي",
        exact: true,
      })
      .fill("10");
    await entry
      .getByRole("spinbutton", {
        name: "الأنيميا عام أولى ابتدائي",
        exact: true,
      })
      .fill("2");
    await entry
      .getByRole("button", { name: "حفظ المسودة", exact: true })
      .click();
    await expect(entry).toHaveURL(/\/reports\/[a-f0-9-]{36}$/);
    const report = entry.url();
    console.log("DEMO: draft saved");
    await entry
      .getByRole("button", { name: "إرسال للمراجعة", exact: true })
      .click();
    await expect(entry.locator(".badge").first()).toHaveText(
      "أولي — بانتظار الاعتماد",
    );
    await login(admin, "admin");
    await metric(admin, 0, "٠");
    await admin.goto(report);
    await admin
      .getByRole("button", { name: "اعتماد النسخة", exact: true })
      .click();
    await expect(admin.locator(".badge").first()).toHaveText("معتمد");
    await admin.goto("/");
    await metric(admin, 0, "١٠");
    console.log("DEMO: initial approval checked");
    await login(viewer, "viewer");
    await metric(viewer, 0, "١٠");
    await viewer.goto("/reports");
    await expect(viewer.getByRole("link", { name: "+ بلاغ جديد" })).toHaveCount(
      0,
    );
    await login(other, "other");
    await metric(other, 0, "٠");
    await other.goto(report);
    await expect(
      other.getByRole("heading", { name: "الصفحة غير موجودة أو غير متاحة" }),
    ).toBeVisible();
    console.log("DEMO: scope isolation checked");
    await entry.goto(report);
    await entry
      .getByRole("link", { name: "اقتراح تعديل", exact: true })
      .click();
    await entry
      .getByRole("spinbutton", {
        name: "المفحوصون عام أولى ابتدائي",
        exact: true,
      })
      .fill("20");
    await entry
      .getByRole("button", { name: "حفظ المسودة", exact: true })
      .click();
    await expect(entry).toHaveURL(/\/reports\/[a-f0-9-]{36}$/);
    const amended = entry.url();
    await entry
      .getByRole("button", { name: "إرسال للمراجعة", exact: true })
      .click();
    await expect(entry.locator(".badge").first()).toHaveText(
      "أولي — بانتظار الاعتماد",
    );
    await admin.goto("/");
    await metric(admin, 0, "١٠");
    await admin.goto(amended);
    await admin
      .getByRole("button", { name: "اعتماد النسخة", exact: true })
      .click();
    await expect(admin.locator(".badge").first()).toHaveText("معتمد");
    await admin.goto("/");
    await metric(admin, 0, "٢٠");
    console.log("DEMO: amendment checked");
    await entry.goto("/targets");
    await entry
      .getByLabel("العام والبرنامج", { exact: true })
      .selectOption({ label: "2026-27 · الفحص الطبي الشامل" });
    await entry.getByLabel("المستهدف السنوي", { exact: true }).fill("100");
    await entry.getByLabel("الصف", { exact: true }).selectOption("primary1");
    await entry
      .getByRole("button", { name: "إرسال مقترح", exact: true })
      .click();
    await expect(
      entry.locator("tbody tr").filter({ hasText: "100" }),
    ).toContainText("مقترح");
    await admin.goto("/");
    await metric(admin, 1, "٠");
    await admin.goto("/targets");
    await admin.getByRole("button", { name: "اعتماد", exact: true }).click();
    await expect(
      admin.getByText("معتمد", { exact: false }).last(),
    ).toBeVisible();
    await admin.goto("/");
    await metric(admin, 1, "١٠٠");
    await admin.setViewportSize({ width: 1440, height: 1100 });
    await admin.screenshot({
      path: "/tmp/school-health-dashboard.png",
      fullPage: true,
    });
    await admin.goto("/analytics");
    await admin
      .getByRole("button", { name: "حفظ لقطة التقرير للمراجعة" })
      .click();
    await expect(admin.getByRole("link", { name: /تنزيل لقطة/ })).toBeVisible();
    const ministry = await admin.request.get("/export?format=ministry");
    expect(ministry.status()).toBe(409);
    const download = await admin.request.get("/export");
    expect(download.headers()["content-type"]).toContain("text/csv");
    expect(await download.text()).toContain("ليس نموذج الوزارة");
    // Direct REST attack as a real Auth user; bypass all UI and server actions.
    const auth = await request.post(
      process.env.NEXT_PUBLIC_SUPABASE_URL +
        "/auth/v1/token?grant_type=password",
      { data: { email: "demo-viewer@example.test", password } },
    );
    expect(auth.ok()).toBe(true);
    const { access_token } = await auth.json();
    const mutation = await request.post(
      process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/rpc/save_report",
      {
        headers: { Authorization: `Bearer ${access_token}` },
        data: { a: null, y: null, w: null, data: [], r: null },
      },
    );
    expect(mutation.status()).toBe(403);
    for (const [path, title] of [
      ["/programs", "البرامج والأعوام الدراسية"],
      ["/users", "المستخدمون والصلاحيات"],
      ["/audit", "سجل التدقيق"],
    ] as const) {
      await admin.goto(path);
      await expect(
        admin.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
    }
    await entry.goto("/imports");
    // Waiting for hydration prevents input events from being lost during slow CI runs.
    await expect(entry.locator("form[data-hydrated]")).toHaveAttribute("data-hydrated", "true");
    const week = weekFor(new Date().toISOString());
    await entry
      .getByRole("textbox", { name: /CSV مجمّع/ })
      .fill(
        `week,program,sector,grade,indicator,count\n${week},comprehensive,general,primary1,screened,10\n${week},comprehensive,general,primary1,anemia,2`,
      );
    await entry
      .getByRole("button", { name: "معاينة والتحقق", exact: true })
      .click();
    await entry
      .getByRole("button", { name: "حفظ في منطقة التجهيز فقط", exact: true })
      .click();
    await expect(entry.getByRole("status")).toContainText(
      "حُفظت البيانات المجمعة",
    );
  } catch (error) {
    await entry.screenshot({
      path: "/tmp/school-health-failed-entry.png",
      fullPage: true,
    });
    console.log(
      "DEMO page at failure:",
      entry.url(),
      await entry.locator("h1").allTextContents(),
    );
    throw error;
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
