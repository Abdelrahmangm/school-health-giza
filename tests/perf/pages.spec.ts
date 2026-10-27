// Local profiling only (SEED_VOLUME=1). Measures server response time and bytes
// for the main pages with one simulated school year of synthetic DEMO data.
import { test, type Page } from "@playwright/test";
const password = "DEMO-only-password-2026!";
async function login(page: Page, name: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(`demo-${name}@example.test`);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await page.waitForURL("http://127.0.0.1:3001/");
}
test("page timings with a full synthetic year", async ({ page }) => {
  test.setTimeout(300000);
  await login(page, "admin");
  const year = "9e000000-0000-0000-0000-000000000001";
  const revision = await page.evaluate(async () => "");
  void revision;
  const paths = [
    `/?year=${year}`,
    `/?year=${year}&mode=pending&sector=combined`,
    "/reports",
    `/analytics?year=${year}`,
    "/reports/new",
    "/targets",
    "/audit",
  ];
  // Warm compile in dev mode so the numbers reflect data work, not bundling.
  for (const p of paths) await page.goto(p);
  const rows: string[] = [];
  for (const p of paths) {
    const samples: number[] = [];
    let bytes = 0;
    for (let i = 0; i < 3; i++) {
      const started = Date.now();
      const response = await page.goto(p);
      samples.push(Date.now() - started);
      bytes = (await response!.body()).length;
    }
    samples.sort((a, b) => a - b);
    rows.push(`${p.padEnd(70)} median ${samples[1]}ms  html ${(bytes / 1024).toFixed(0)}KB`);
  }
  const first = page.locator('a[href^="/reports/"]').first();
  await page.goto("/reports");
  const href = await first.getAttribute("href");
  if (href) {
    const samples: number[] = [];
    let bytes = 0;
    for (let i = 0; i < 3; i++) {
      const started = Date.now();
      const response = await page.goto(href);
      samples.push(Date.now() - started);
      bytes = (await response!.body()).length;
    }
    samples.sort((a, b) => a - b);
    rows.push(`${"/reports/[id]".padEnd(70)} median ${samples[1]}ms  html ${(bytes / 1024).toFixed(0)}KB`);
  }
  console.log("\nPERF RESULTS\n" + rows.join("\n"));
});
