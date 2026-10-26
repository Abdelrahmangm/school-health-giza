import { test, expect } from "@playwright/test";
test("protected pages redirect to setup without showing fabricated metrics", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  await expect(
    page.getByRole("heading", { name: "يلزم ربط مشروع Supabase اختباري" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});
test("login requires configured authentication and never offers demo access", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.getByText("لم تُضبط خدمة المصادقة بعد.")).toBeVisible();
  await expect(page.locator("input[type=password]")).toHaveCount(0);
});
test("export cannot leak data without authentication", async ({ request }) => {
  const result = await request.get("/export", { maxRedirects: 0 });
  expect([303, 307]).toContain(result.status());
  expect(result.headers().location).toBe("/setup");
});
test("security headers prevent framing and indexing", async ({ request }) => {
  const result = await request.get("/setup");
  expect(result.headers()["x-frame-options"]).toBe("DENY");
  expect(result.headers()["x-content-type-options"]).toBe("nosniff");
  expect(await result.text()).toContain("noindex");
});
