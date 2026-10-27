// Local visual review only: screenshots of key screens with synthetic DEMO data.
import { test, type Page } from "@playwright/test";
import { zipSync, strToU8 } from "fflate";
const out = process.env.SCREENSHOT_DIR || "/tmp";
const password = "DEMO-only-password-2026!";
async function login(page: Page, name: string) {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill(`demo-${name}@example.test`);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await page.waitForURL("http://127.0.0.1:3001/");
}
function xlsx(name: string, rows: string[][]) {
  const shared: string[] = [];
  const idx = (v: string) => (shared.includes(v) ? shared.indexOf(v) : shared.push(v) - 1);
  const col = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const sheet = rows
    .map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => (/^\d+$/.test(v) ? `<c r="${col(ci)}${ri + 1}"><v>${v}</v></c>` : `<c r="${col(ci)}${ri + 1}" t="s"><v>${idx(v)}</v></c>`)).join("")}</row>`)
    .join("");
  return Buffer.from(
    zipSync({
      "xl/workbook.xml": strToU8(`<workbook xmlns:r="r"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
      "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
      "xl/sharedStrings.xml": strToU8(`<sst>${shared.map((s) => `<si><t>${esc(s)}</t></si>`).join("")}</sst>`),
      "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData>${sheet}</sheetData></worksheet>`),
    }),
  );
}
test("screens", async ({ browser }) => {
  test.setTimeout(240000);
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await login(page, "admin");
  await page.screenshot({ path: out + "/01-dashboard.png", fullPage: true });
  await page.goto("/users");
  await page.screenshot({ path: out + "/02-users.png", fullPage: true });
  await page.goto("/imports");
  const header = ["Timestamp", "الاداره ", "مستهدف اولي حضانه ", "ما تم فحصه اولي حضانه ", "السمنه اولي حضانه", "النحافه اولي حضانه  ", "تخاطب اولي حضانه", "ملاحظات"];
  await page.locator('input[type="file"]').setInputFiles({
    name: "DEMO-wide.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: xlsx("أولات عام", [header, ["10/26/2026 10:00:00", "اوسيم", "500", "40", "3", "2", "1", ""], ["10/26/2026 11:00:00", "كرداسة ", "400", "30", "2", "1", "", ""], ["10/26/2026 12:00:00", "اوسيم", "500", "42", "3", "2", "1", ""]]),
  });
  await page.waitForTimeout(800);
  await page.locator("details").first().evaluate((d) => ((d as HTMLDetailsElement).open = true));
  await page.screenshot({ path: out + "/03-import-preview.png", fullPage: true });
  await page.goto("/programs");
  await page.screenshot({ path: out + "/04-programs.png", fullPage: true });
  const entry = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await login(entry, "entry");
  await entry.goto("/reports/new");
  await entry.getByRole("spinbutton", { name: "المفحوصون عام أولى ابتدائي", exact: true }).fill("10");
  await entry.getByRole("spinbutton", { name: "الأنيميا عام أولى ابتدائي", exact: true }).fill("12");
  await entry.screenshot({ path: out + "/05-report-entry.png", fullPage: false });
  const mobile = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await login(mobile, "viewer");
  await mobile.screenshot({ path: out + "/06-mobile.png", fullPage: false });
  await mobile.goto("/auth/forgot");
  await mobile.screenshot({ path: out + "/07-forgot.png" });
});
