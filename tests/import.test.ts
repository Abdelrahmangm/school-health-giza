import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { interpretHeader, matchAdministration, normalizeArabic, SHEET_COMPREHENSIVE_INDICATORS } from "../lib/catalog";
import { readXlsx, readCsv } from "../lib/spreadsheet";
import { buildImport, parseCount, parseDateish, planSheet, type ProgramCatalog } from "../lib/import";

const names = ["أوسيم", "كرداسة", "البدرشين", "الصف", "أطفيح", "أبو النمرس", "شرق القناطر", "غرب القناطر", "شمال العياط", "جنوب العياط", "الوراق", "الحوامدية", "الواحات"];
const programs: ProgramCatalog[] = [
  { code: "comprehensive", grades: ["kg1", "primary1", "primary4", "preparatory1", "secondary1"], indicators: ["anemia", "obesity", "underweight", "stunting", "glasses", "dental_other", "assistive_devices"] },
  { code: "vision", grades: ["kg2"], indicators: ["visual_impairment", "strabismus", "ptosis"] },
];

describe("header interpretation (spellings from the original sheets)", () => {
  it.each([
    ["مستهدف اولي حضانه ", { kind: "target", grade: "kg1" }],
    ["ما تم  فحصه اولي ابتدائي", { kind: "screened", grade: "primary1" }],
    ["ما تم فحصه رابعه ابتدائي ", { kind: "screened", grade: "primary4" }],
    ["النحافه اولي حضانه  ", { kind: "indicator", indicator: "underweight", grade: "kg1" }],
    ["حالات الانيميا المكتشفه رابعه ابتدائي", { kind: "indicator", indicator: "anemia", grade: "primary4" }],
    ["انيميا بحر متوسط اولي ابتدائي ", { kind: "indicator", indicator: "thalassemia", grade: "primary1" }],
    ["حالات حده الابصار غير الطبيعيه اولي ابتدائي ", { kind: "indicator", indicator: "visual_impairment", grade: "primary1" }],
    ["نضارات اولي اعدادي", { kind: "indicator", indicator: "glasses", grade: "preparatory1" }],
    ["امراض القلب اولي ثانوي\n", { kind: "indicator", indicator: "heart", grade: "secondary1" }],
    ["أجهزه تكميليه اخري اولي ثانوي", { kind: "indicator", indicator: "assistive_devices", grade: "secondary1" }],
    ["امراض اسنان اخري اولي ثانوي", { kind: "indicator", indicator: "dental_other", grade: "secondary1" }],
    ["امراض اسنان اولي ابتدائي", { kind: "indicator", indicator: "dental_diseases", grade: "primary1" }],
    ["حالات اخري أولى ابتدائي", { kind: "indicator", indicator: "other_conditions", grade: "primary1" }],
    ["أعاقه حركيه رابعه ابتدائي ", { kind: "indicator", indicator: "motor_disability", grade: "primary4" }],
    ["مستهدف ثانيه حضانه ", { kind: "target", grade: "kg2" }],
    ["الاداره ", { kind: "administration" }],
    ["Timestamp", { kind: "timestamp" }],
  ])("%s", (header, expected) => expect(interpretHeader(header)).toEqual(expected));
  it("flags unknown columns instead of guessing", () => {
    expect(interpretHeader("ملاحظات").kind).toBe("unknown");
    expect(interpretHeader("فيروس جديد اولي حضانه").kind).toBe("unknown");
  });
  it("every original-sheet comprehensive indicator has a code", () => expect(SHEET_COMPREHENSIVE_INDICATORS).toContain("speech"));
});

describe("administration spellings", () => {
  it("matches hamza, taa marbuta and spacing variants", () => {
    expect(matchAdministration("اوسيم", names)).toBe("أوسيم");
    expect(matchAdministration("كرداسة ", names)).toBe("كرداسة");
    expect(matchAdministration("إدارة الحوامديه الصحية", names)).toBe("الحوامدية");
    expect(matchAdministration("ابوالنمرس", names)).toBe("أبو النمرس");
    expect(matchAdministration("القاهرة", names)).toBeNull();
  });
  it("normalizes Arabic", () => expect(normalizeArabic(" أُولى  حضانة ")).toBe("اولي حضانه"));
});

describe("cell parsing", () => {
  it("counts", () => {
    expect(parseCount("")).toBeNull();
    expect(parseCount("١٢٣")).toBe(123);
    expect(parseCount("1,200")).toBe(1200);
    expect(() => parseCount("#VALUE!")).toThrow();
    expect(() => parseCount("-3")).toThrow();
    expect(() => parseCount("2.5")).toThrow();
  });
  it("dates", () => {
    expect(parseDateish("10/26/2026 9:14:02")?.toString()).toBe("2026-10-26");
    expect(parseDateish("2026-10-25")?.toString()).toBe("2026-10-25");
    expect(parseDateish("46320.5")?.toString()).toBe("2026-10-25");
    expect(parseDateish("hello")).toBeNull();
  });
});

const wideHeader = ["Timestamp", "الاداره ", "مستهدف اولي حضانه ", "ما تم فحصه اولي حضانه ", "السمنه اولي حضانه", "النحافه اولي حضانه  ", "ملاحظات"];
function wide(rows: string[][], name = "أولات عام") {
  return { name, rows: [wideHeader, ...rows] };
}

describe("wide form-response import", () => {
  it("maps a submission to the previous reporting week, separates sector, and stages targets separately", () => {
    // Monday 26 Oct 2026 submission → reporting week Sunday 18 Oct.
    const r = buildImport(wide([["10/26/2026 10:00:00", "اوسيم", "500", "40", "3", "2", "x"]]), { sector: "column", valueMode: "weekly", weekRule: "previous" }, { administrations: names, programs });
    expect(r.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(r.batches).toHaveLength(1);
    const rows = r.batches[0].rows;
    expect(r.batches[0].administration).toBe("أوسيم");
    expect(rows.every((x) => x.sector === "general" && x.week === "2026-10-18")).toBe(true);
    expect(rows.find((x) => x.indicator === "screened")?.count).toBe(40);
    expect(rows.find((x) => x.indicator === "target")?.count).toBe(500);
    expect(r.issues.some((i) => i.message.includes("ملاحظات"))).toBe(true);
  });
  it("detects Azhar from the sheet name", () => {
    const r = buildImport(wide([["10/26/2026 10:00:00", "الصف", "1", "4", "", "", ""]], "أولات ازهر "), { sector: "column", valueMode: "weekly", weekRule: "same" }, { administrations: names, programs });
    expect(r.batches[0].rows[0].sector).toBe("azhar");
    expect(r.batches[0].rows[0].week).toBe("2026-10-25");
  });
  it("keeps only the latest duplicate submission and warns", () => {
    const r = buildImport(
      wide([
        ["10/26/2026 11:00:00", "الصف", "", "30", "", "", ""],
        ["10/26/2026 09:00:00", "الصف", "", "20", "", "", ""],
      ]),
      { sector: "general", valueMode: "weekly", weekRule: "previous" },
      { administrations: names, programs },
    );
    expect(r.batches[0].rows.find((x) => x.indicator === "screened")?.count).toBe(30);
    expect(r.issues.some((i) => i.level === "warning" && i.message.includes("آخر إرسال"))).toBe(true);
  });
  it("converts cumulative totals into weekly new counts and rejects decreases", () => {
    const r = buildImport(
      wide([
        ["10/12/2026 10:00:00", "الواحات", "", "10", "1", "", ""],
        ["10/19/2026 10:00:00", "الواحات", "", "25", "3", "", ""],
        ["10/26/2026 10:00:00", "الواحات", "", "20", "3", "", ""],
      ]),
      { sector: "general", valueMode: "cumulative", weekRule: "previous" },
      { administrations: names, programs },
    );
    const s = r.batches[0].rows.filter((x) => x.indicator === "screened");
    expect(s.map((x) => [x.week, x.count])).toEqual([["2026-10-04", 10], ["2026-10-11", 15]]);
    expect(r.issues.some((i) => i.level === "error" && i.message.includes("قلّ"))).toBe(true);
  });
  it("blocks unknown administrations, invalid numbers, findings above screened, and indicators missing from the catalog", () => {
    const r = buildImport(
      { name: "أولات عام", rows: [[...wideHeader, "تخاطب اولي حضانه"], ["10/26/2026", "القاهرة", "", "5", "", "", "", ""], ["10/26/2026", "الوراق", "", "5", "9", "#VALUE!", "", ""], ["10/26/2026", "الصف", "", "5", "1", "", "", "2"]] },
      { sector: "general", valueMode: "weekly", weekRule: "previous" },
      { administrations: names, programs },
    );
    const errors = r.issues.filter((i) => i.level === "error").map((i) => i.message).join("\n");
    expect(errors).toContain("القاهرة");
    expect(errors).toContain("#VALUE!");
    expect(errors).toContain("تخاطب");
  });
  it("flags findings above screened", () => {
    const r = buildImport(wide([["10/26/2026", "الصف", "", "5", "9", "", ""]]), { sector: "general", valueMode: "weekly", weekRule: "previous" }, { administrations: names, programs });
    expect(r.issues.some((i) => i.level === "error" && i.message.includes("أكبر من عدد المفحوصين"))).toBe(true);
  });
  it("restricts an officer to their own administration", () => {
    const r = buildImport(wide([["10/26/2026", "الصف", "", "5", "", "", ""], ["10/26/2026", "الوراق", "", "6", "", "", ""]]), { sector: "general", valueMode: "weekly", weekRule: "previous" }, { administrations: names, programs, allowed: ["الصف"] });
    expect(r.batches.map((b) => b.administration)).toEqual(["الصف"]);
    expect(r.issues.some((i) => i.level === "error" && i.message.includes("الوراق"))).toBe(true);
  });
  it("routes KG2 only to the vision program", () => {
    const r = buildImport(
      { name: "ثانية حضانة عام", rows: [["Timestamp", "الاداره", "ما تم فحصه ثانيه حضانه", "ضعف الابصار ثانيه حضانه"], ["10/26/2026", "الصف", "12", "2"]] },
      { sector: "general", valueMode: "weekly", weekRule: "previous" },
      { administrations: names, programs },
    );
    expect(r.batches[0].rows.every((x) => x.program === "vision" && x.grade === "kg2")).toBe(true);
  });
});

describe("long layout", () => {
  it("keeps compatibility with the documented CSV layout", () => {
    const [sheet] = readCsv("﻿week,program,sector,grade,indicator,count\n2026-10-25,comprehensive,general,primary1,screened,10\n2026-10-25,comprehensive,general,primary1,anemia,2\n2026-10-25,comprehensive,general,kg2,screened,3");
    expect(planSheet(sheet).format).toBe("long");
    const r = buildImport(sheet, { sector: "column", valueMode: "weekly", weekRule: "same", defaultAdministration: "الصف" }, { administrations: names, programs });
    expect(r.batches[0].rows).toHaveLength(2);
    expect(r.issues.some((i) => i.level === "error" && i.message.includes("للإبصار"))).toBe(true);
  });
});

describe("file readers", () => {
  it("reads xlsx shared and inline strings", () => {
    const xml = (s: string) => strToU8('<?xml version="1.0" encoding="UTF-8"?>' + s);
    const bytes = zipSync({
      "xl/workbook.xml": xml('<workbook xmlns:r="r"><sheets><sheet name="أولات عام" sheetId="1" r:id="rId1"/></sheets></workbook>'),
      "xl/_rels/workbook.xml.rels": xml('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
      "xl/sharedStrings.xml": xml("<sst><si><t>الاداره</t></si><si><r><t>ما تم </t></r><r><t>فحصه اولي حضانه</t></r></si><si><t>اوسيم &amp; </t></si></sst>"),
      "xl/worksheets/sheet1.xml": xml('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>الصف</t></is></c><c r="C2"><v>17</v></c></row></sheetData></worksheet>'),
    });
    const [sheet] = readXlsx(bytes);
    expect(sheet.name).toBe("أولات عام");
    expect(sheet.rows[0]).toEqual(["الاداره", "", "ما تم فحصه اولي حضانه"]);
    expect(sheet.rows[1]).toEqual(["الصف", "", "17"]);
  });
  it("rejects non-xlsx bytes", () => expect(() => readXlsx(new Uint8Array([1, 2, 3]))).toThrow());
  it("reads quoted CSV with semicolons", () => {
    const [sheet] = readCsv('a;b\n"x;1";"he said ""hi"""\n');
    expect(sheet.rows[1]).toEqual(["x;1", 'he said "hi"']);
  });
});

import headers from "./fixtures/sheet-headers.json";
import { readCell, reportingWeek } from "../lib/import";
import { Temporal } from "@js-temporal/polyfill";
import { INDICATORS } from "../lib/catalog";

const ministryCatalog: ProgramCatalog[] = [
  {
    code: "comprehensive",
    grades: ["kg1", "primary1", "primary4", "preparatory1", "secondary1"],
    indicators: INDICATORS.filter((i) => i.aliases.length && !["strabismus", "ptosis"].includes(i.code)).map((i) => i.code),
  },
  { code: "vision", grades: ["kg2"], indicators: ["visual_impairment", "strabismus", "ptosis"] },
];

describe("every column header of the four directorate tabs (headers only, no data)", () => {
  it.each(Object.entries(headers as Record<string, string[]>))("%s", (name, row) => {
    const plan = planSheet({ name, rows: [row, row.map(() => "")] });
    const unknown = plan.columns.filter((c) => c.meaning.kind === "unknown" && c.header.trim()).map((c) => c.header.trim());
    expect(unknown.filter((h) => !h.startsWith("اجمالي"))).toEqual([]);
    expect(plan.columns.find((c) => c.header.startsWith("مستهدف اولي حضانه أزهر"))?.meaning ?? { kind: "target", grade: "kg1" }).toEqual({ kind: "target", grade: "kg1" });
    if (name === "أزهر أولى ورابعة") expect(plan.columns.find((c) => c.header === "دمج رابعه")?.meaning).toEqual({ kind: "indicator", indicator: "inclusion", grade: "primary4" });
  });
});

describe("cells written by people", () => {
  it.each([
    ["25 لوز", 25, true],
    ["1 قلب مفتوح", 1, true],
    ["4التهاب لثه", 4, true],
    ["،121", 121, false],
    ["0 0", 0, false],
    ["01", 1, false],
    ["ج", null, true],
  ])("%s", (raw, value, noted) => {
    const c = readCell(raw);
    expect(c.error).toBeUndefined();
    expect(c.value).toBe(value);
    expect(!!c.note).toBe(noted);
  });
  it.each(["12 و عملقه 1", "-3", "2.5", "#VALUE!"])("rejects %s", (raw) => expect(readCell(raw).error).toBeTruthy());
});

describe("reporting week (Sunday–Saturday, deadline Sunday 4 PM)", () => {
  const w = (d: string) => reportingWeek(Temporal.PlainDate.from(d), "window").toString();
  it("Saturday, Sunday and a late Monday/Tuesday go to the week that just ended; Wednesday on is the current week", () => {
    expect(w("2026-10-10")).toBe("2026-10-04"); // Saturday
    expect(w("2026-10-11")).toBe("2026-10-04"); // Sunday
    expect(w("2026-10-13")).toBe("2026-10-04"); // Tuesday (late)
    expect(w("2026-10-14")).toBe("2026-10-11"); // Wednesday
    expect(w("2026-10-16")).toBe("2026-10-11"); // Friday
  });
});

const h2 = ["Timestamp", "الاداره", "مستهدف اولي اعدادي", "ما تم فحصه اولي اعدادي", "السمنه اولي اعدادي", "النحافه اولي اعدادي"];
const opts = { sector: "general" as const, valueMode: "weekly" as const, weekRule: "window" as const };
const run = (rows: string[][], overrides?: Record<number, { week?: string; include?: boolean }>) =>
  buildImport({ name: "أولات عام", rows: [h2, ...rows] }, { ...opts, overrides }, { administrations: names, programs: ministryCatalog });

describe("submission review", () => {
  it("treats a resubmission with the same screened counts as a correction of the same week", () => {
    const r = run([
      ["9/29/2026 14:42:29", "الحوامديه", "100", "50", "12 و عملقه 1", "3"], // Tuesday → week 20/9, has a bad cell
      ["10/2/2026 22:54:18", "الحوامديه", "100", "50", "7", "3"], // Friday → week 27/9
      ["10/6/2026 19:44:27", "الحوامديه", "100", "50", "8", "3"], // Tuesday → same report again
    ]);
    expect(r.submissions.map((s) => [s.row, s.week, s.status])).toEqual([
      [2, "2026-09-20", "superseded"],
      [3, "2026-09-20", "superseded"],
      [4, "2026-09-20", "kept"],
    ]);
    // The bad cell is in a superseded submission, so it does not block saving.
    expect(r.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(r.batches[0].rows.find((x) => x.indicator === "obesity")?.count).toBe(8);
  });
  it("sets aside an identical copy and an all-zero submission, and ignores targets copied from another administration", () => {
    const r = run([
      ["10/10/2026 16:44:59", "شرق القناطر", "5568", "548", "4", "5"],
      ["10/16/2026 17:03:05", "شرق القناطر", "5568", "372", "10", "4"],
      ["10/18/2026 09:30:51", "شرق القناطر", "5568", "548", "4", "5"], // copy of the 10/10 report
      ["10/17/2026 12:00:00", "الصف", "10434", "367", "12", "16"],
      ["10/24/2026 12:00:00", "الصف", "10434", "200", "1", "1"],
      ["10/24/2026 22:20:33", "البدرشين", "10434", "0", "0", "0"], // zeros + الصف's target
      ["10/18/2026 13:49:27", "البدرشين", "11644", "1313", "83", "37"],
    ]);
    const byRow = new Map(r.submissions.map((s) => [s.row, s]));
    expect(byRow.get(4)!.week).toBe("2026-10-04");
    expect(byRow.get(3)!.status).toBe("kept"); // 10/16 stays the week of 11/10
    expect(byRow.get(7)!.status).toBe("excluded");
    const targets = r.batches.find((b) => b.administration === "البدرشين")!.rows.filter((x) => x.indicator === "target");
    expect(targets.map((x) => x.count)).toEqual([11644]);
  });
  it("lets the reviewer move a submission to another week or leave it out", () => {
    const rows = [
      ["10/3/2026 21:05:10", "غرب القناطر", "6359", "748", "103", "19"],
      ["10/4/2026 11:06:06", "غرب القناطر", "6359", "494", "65", "15"],
    ];
    expect(run(rows).submissions.map((s) => s.status)).toEqual(["superseded", "kept"]);
    const moved = run(rows, { 3: { week: "2026-10-04" } });
    expect(moved.submissions.map((s) => [s.week, s.status])).toEqual([["2026-09-27", "kept"], ["2026-10-04", "kept"]]);
    expect(moved.submissions[1].overridden).toBe(true);
    const out = run(rows, { 3: { include: false } });
    expect(out.submissions.map((s) => s.status)).toEqual(["kept", "excluded"]);
  });
  it("marks submissions after Sunday 4 PM as late and ignores zero targets", () => {
    const r = run([["10/12/2026 14:29:24", "اوسيم", "0", "669", "21", "19"]]);
    expect(r.submissions[0].late).toBe(true);
    expect(r.submissions[0].week).toBe("2026-10-04");
    expect(r.batches[0].rows.some((x) => x.indicator === "target")).toBe(false);
  });
});
