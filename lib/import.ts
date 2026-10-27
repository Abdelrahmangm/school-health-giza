// Turns a sheet (wide "one row per administration" form layout, or the long
// week,program,sector,grade,indicator,count layout) into validated aggregate rows.
// Pure functions: run in the browser for preview and in tests. The database
// validates every row again when it is staged.
import { Temporal } from "@js-temporal/polyfill";
import { interpretHeader, matchAdministration, normalizeArabic, indicatorLabel, type HeaderMeaning } from "./catalog";
import type { Sheet } from "./spreadsheet";

export type Sector = "general" | "azhar";
export type StagedRow = { week: string; program: string; sector: Sector; grade: string; indicator: string; count: number };
export type ProgramCatalog = { code: string; grades: string[]; indicators: string[] };
export type ImportOptions = {
  sector: Sector | "column";
  valueMode: "weekly" | "cumulative";
  weekRule: "previous" | "same";
  defaultAdministration?: string;
  defaultWeek?: string;
};
export type Issue = { level: "error" | "warning"; message: string; row?: number };
export type ColumnPlan = { index: number; header: string; meaning: HeaderMeaning };
export type SheetPlan = { format: "wide" | "long"; headerRow: number; columns: ColumnPlan[] };
export type ImportResult = {
  batches: { administration: string; rows: StagedRow[]; weeks: string[]; screened: number }[];
  issues: Issue[];
  plan: SheetPlan;
};

const LONG = ["week", "program", "sector", "grade", "indicator", "count"];
const gradeLabels: Record<string, string> = {
  kg1: "أولى حضانة", kg2: "تانية حضانة", primary1: "أولى ابتدائي", primary4: "رابعة ابتدائي", preparatory1: "أولى إعدادي", secondary1: "أولى ثانوي",
};

export function detectSector(sheetName: string): Sector | null {
  const n = normalizeArabic(sheetName);
  if (/ازهر/.test(n)) return "azhar";
  if (/(^| )عام( |$)/.test(n)) return "general";
  return null;
}

/** Finds the header row (within the first 10 rows) and explains every column. */
export function planSheet(sheet: Sheet): SheetPlan {
  for (let r = 0; r < Math.min(10, sheet.rows.length); r++) {
    const cells = (sheet.rows[r] ?? []).map((c) => String(c ?? "").trim());
    const lower = cells.map((c) => c.toLowerCase());
    if (LONG.every((k) => lower.includes(k)))
      return {
        format: "long",
        headerRow: r,
        columns: cells.map((header, index) => ({
          index,
          header,
          meaning: lower[index] === "administration" ? { kind: "administration" } : { kind: "unknown", reason: "long" },
        })),
      };
    const columns = cells.map((header, index) => ({ index, header, meaning: interpretHeader(header) }));
    if (columns.some((c) => c.meaning.kind === "administration") && columns.some((c) => c.meaning.kind === "screened"))
      return { format: "wide", headerRow: r, columns };
  }
  throw new Error(
    "مش لاقي صف العناوين. لازم الشيت يكون فيه عمود «الإدارة» وأعمدة «ما تم فحصه» زي شيتات البلاغ الأصلية، أو الأعمدة week,program,sector,grade,indicator,count.",
  );
}

const arabicDigits = /[٠-٩]/g;
/** Parses a count cell. Empty → null (not reported). Throws a friendly message otherwise. */
export function parseCount(raw: unknown): number | null {
  const s = String(raw ?? "").replace(arabicDigits, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[,\s٬]/g, "").trim();
  if (s === "" || s === "-") return null;
  if (!/^\d+(\.0+)?$/.test(s)) throw new Error(`القيمة «${String(raw).slice(0, 20)}» مش رقم صحيح موجب`);
  const n = Number(s);
  if (n > 10_000_000) throw new Error("الرقم أكبر من الحد المسموح");
  return n;
}

/** Accepts Excel serial dates, ISO dates and Google Forms "M/D/YYYY H:MM:SS" (Cairo local time). */
export function parseDateish(raw: unknown): Temporal.PlainDate | null {
  const s = String(raw ?? "").trim().replace(arabicDigits, (d) => String(d.charCodeAt(0) - 0x0660));
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial < 30000 || serial > 80000) return null;
    return Temporal.PlainDate.from("1899-12-30").add({ days: Math.floor(serial) });
  }
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return Temporal.PlainDate.from({ year: +m[1], month: +m[2], day: +m[3] });
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const [a, b, year] = [+m[1], +m[2], +m[3]];
    // Google Sheets exports M/D/YYYY; fall back to D/M/YYYY when the month would be invalid.
    const [month, day] = a > 12 ? [b, a] : [a, b];
    try {
      return Temporal.PlainDate.from({ year, month, day }, { overflow: "reject" });
    } catch {
      return null;
    }
  }
  return null;
}
/** Sortable number for a submission time: YYYYMMDDhhmmss (time of day if present). */
function stampOrder(raw: unknown, date: Temporal.PlainDate) {
  const s = String(raw ?? "");
  let seconds = 0;
  const serial = s.match(/^\d+\.(\d+)$/);
  if (serial) seconds = Math.round(Number("0." + serial[1]) * 86400);
  const t = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|ص|م)?/i);
  if (t) {
    let h = +t[1] % 12;
    if (!t[4] || !/PM|م/i.test(t[4])) h = t[4] ? h : +t[1];
    else h += 12;
    seconds = h * 3600 + +t[2] * 60 + +(t[3] ?? 0);
  }
  const hh = Math.floor(seconds / 3600), mm = Math.floor((seconds % 3600) / 60), ss = seconds % 60;
  return Number(date.toString().replaceAll("-", "")) * 1_000_000 + hh * 10_000 + mm * 100 + ss;
}
function sundayOf(d: Temporal.PlainDate) {
  return d.subtract({ days: d.dayOfWeek % 7 });
}

type Draft = {
  administration: string;
  week: string;
  sector: Sector;
  order: number;
  row: number;
  values: Map<string, number>; // key `${kind}|${grade}|${indicator}`
};

export function buildImport(
  sheet: Sheet,
  options: ImportOptions,
  context: { administrations: string[]; programs: ProgramCatalog[]; allowed?: string[] },
): ImportResult {
  const plan = planSheet(sheet);
  const issues: Issue[] = [];
  const programFor = (grade: string) => (grade === "kg2" ? "vision" : "comprehensive");
  const catalog = new Map(context.programs.map((p) => [p.code, p]));
  const sheetSector = detectSector(sheet.name);
  const col = (kind: HeaderMeaning["kind"]) => plan.columns.find((c) => c.meaning.kind === kind)?.index;
  const drafts: Draft[] = [];
  const missingIndicators = new Map<string, Set<string>>();
  const unknownAdministrations = new Set<string>();

  if (plan.format === "wide") {
    for (const c of plan.columns)
      if (c.meaning.kind === "unknown" && c.header.trim())
        issues.push({ level: "warning", message: `العمود «${c.header.trim()}» اتجاهل: ${c.meaning.reason}` });
  }

  for (let r = plan.headerRow + 1; r < sheet.rows.length; r++) {
    const cells = sheet.rows[r] ?? [];
    if (!cells.some((c) => String(c ?? "").trim())) continue;
    const rowNo = r + 1;
    const fail = (message: string) => issues.push({ level: "error", row: rowNo, message });
    if (plan.format === "long") {
      const get = (k: string) => String(cells[plan.columns.findIndex((c) => c.header.toLowerCase() === k)] ?? "").trim();
      const adminCell = get("administration");
      const administration = adminCell ? matchAdministration(adminCell, context.administrations) : options.defaultAdministration ?? null;
      if (!administration) {
        unknownAdministrations.add(adminCell || "(فاضي)");
        continue;
      }
      const date = parseDateish(get("week"));
      const grade = get("grade");
      const program = get("program");
      const sector = get("sector") as Sector;
      const indicator = get("indicator");
      if (!date || date.dayOfWeek !== 7) {
        fail("الأسبوع لازم يكون تاريخ يوم أحد");
        continue;
      }
      if (!["general", "azhar"].includes(sector)) {
        fail("القطاع لازم يكون general أو azhar");
        continue;
      }
      if (programFor(grade) !== program || !gradeLabels[grade]) {
        fail(`الصف «${grade}» مش تبع البرنامج «${program}» (رياض أطفال تانية للإبصار بس)`);
        continue;
      }
      let count: number | null;
      try {
        count = parseCount(get("count"));
      } catch (e) {
        fail((e as Error).message);
        continue;
      }
      if (count === null) continue;
      const kind = indicator === "screened" ? "screened" : indicator === "target" ? "target" : "indicator";
      const key = `${kind}|${grade}|${kind === "indicator" ? indicator : ""}`;
      const week = date.toString();
      let d = drafts.find((x) => x.administration === administration && x.week === week && x.sector === sector);
      if (!d) drafts.push((d = { administration, week, sector, order: rowNo, row: rowNo, values: new Map() }));
      if (d.values.has(key)) {
        fail(`تكرار لنفس الأسبوع والقطاع والصف والمؤشر (${indicator})`);
        continue;
      }
      d.values.set(key, count);
      continue;
    }

    // Wide layout: one form response per administration.
    const adminIndex = col("administration");
    const adminCell = adminIndex === undefined ? "" : String(cells[adminIndex] ?? "").trim();
    const administration = adminCell ? matchAdministration(adminCell, context.administrations) : options.defaultAdministration ?? null;
    if (!administration) {
      unknownAdministrations.add(adminCell || "(فاضي)");
      continue;
    }
    let sector: Sector | null = options.sector === "column" ? null : options.sector;
    if (options.sector === "column") {
      const si = col("sector");
      const raw = si === undefined ? "" : normalizeArabic(String(cells[si] ?? ""));
      sector = /ازهر/.test(raw) ? "azhar" : /عام/.test(raw) ? "general" : sheetSector;
    }
    if (!sector) {
      fail("مش عارف القطاع (عام ولا أزهري). اختار القطاع من الإعدادات.");
      continue;
    }
    const weekIndex = col("week");
    const timeIndex = col("timestamp");
    let date = weekIndex !== undefined ? parseDateish(cells[weekIndex]) : null;
    let order = rowNo;
    if (!date && timeIndex !== undefined) {
      const stamp = parseDateish(cells[timeIndex]);
      if (stamp) {
        order = stampOrder(cells[timeIndex], stamp);
        date = options.weekRule === "previous" ? sundayOf(stamp).subtract({ days: 7 }) : sundayOf(stamp);
      }
    }
    if (!date && options.defaultWeek) date = Temporal.PlainDate.from(options.defaultWeek);
    if (!date) {
      fail("مفيش تاريخ أو أسبوع للصف ده. حدد «أسبوع البلاغ» من الإعدادات.");
      continue;
    }
    const week = sundayOf(date).toString();
    const values = new Map<string, number>();
    let bad = false;
    for (const c of plan.columns) {
      const m = c.meaning;
      if (m.kind !== "screened" && m.kind !== "target" && m.kind !== "indicator") continue;
      let count: number | null;
      try {
        count = parseCount(cells[c.index]);
      } catch (e) {
        fail(`عمود «${c.header.trim()}»: ${(e as Error).message}`);
        bad = true;
        continue;
      }
      if (count === null) continue;
      if (m.kind === "indicator") {
        const program = catalog.get(programFor(m.grade));
        if (!program?.indicators.includes(m.indicator)) {
          const set = missingIndicators.get(programFor(m.grade)) ?? new Set();
          set.add(m.indicator);
          missingIndicators.set(programFor(m.grade), set);
          continue;
        }
      }
      values.set(`${m.kind}|${m.grade}|${m.kind === "indicator" ? m.indicator : ""}`, count);
    }
    if (bad) continue;
    drafts.push({ administration, week, sector, order, row: rowNo, values });
  }

  if (unknownAdministrations.size)
    issues.push({
      level: "error",
      message: `أسماء إدارات مش متطابقة مع الـ 13 إدارة: ${[...unknownAdministrations].slice(0, 8).join("، ")}. صحّح الاسم في الملف أو اختار الإدارة من الإعدادات.`,
    });
  for (const [program, set] of missingIndicators)
    issues.push({
      level: "error",
      message: `المؤشرات دي موجودة في الملف ومش متسجلة في برنامج ${program === "vision" ? "الإبصار" : "الفحص الشامل"} للعام المختار: ${[...set]
        .map((c) => indicatorLabel(c) ?? c)
        .join("، ")}. المشرف العام أو مسؤول البرنامج يقدر يضيفها من صفحة «البرامج والأعوام» قبل الاستيراد.`,
    });

  // Duplicate submissions for the same administration/week/sector: keep the latest one.
  const byKey = new Map<string, Draft[]>();
  for (const d of drafts) {
    const k = `${d.administration}|${d.week}|${d.sector}`;
    byKey.set(k, [...(byKey.get(k) ?? []), d]);
  }
  const kept: Draft[] = [];
  for (const [k, list] of byKey) {
    list.sort((a, b) => a.order - b.order || a.row - b.row);
    if (list.length > 1 && plan.format === "wide") {
      const [administration, week, sector] = k.split("|");
      issues.push({
        level: "warning",
        message: `${administration} بعتت ${list.length} مرات لأسبوع ${week} (${sector === "azhar" ? "أزهري" : "عام"}) — الصفوف ${list.map((d) => d.row).join("، ")}. اتاخد آخر إرسال بس (صف ${list.at(-1)!.row}).`,
      });
    }
    kept.push(list.at(-1)!);
  }

  // Cumulative sheets: convert running totals into new weekly counts.
  if (options.valueMode === "cumulative") {
    const groups = new Map<string, Draft[]>();
    for (const d of kept) groups.set(`${d.administration}|${d.sector}`, [...(groups.get(`${d.administration}|${d.sector}`) ?? []), d]);
    for (const list of groups.values()) {
      list.sort((a, b) => a.week.localeCompare(b.week));
      const previous = new Map<string, number>();
      for (const d of list) {
        for (const [key, value] of [...d.values]) {
          if (key.startsWith("target|")) continue;
          const before = previous.get(key) ?? 0;
          if (value < before) {
            issues.push({ level: "error", row: d.row, message: `الرقم التراكمي قلّ عن الأسبوع اللي قبله (${before} ← ${value}) في ${d.administration} أسبوع ${d.week}. راجع الملف.` });
            d.values.delete(key);
          } else d.values.set(key, value - before);
          previous.set(key, value);
        }
      }
      if (list.length)
        issues.push({ level: "warning", message: `${list[0].administration}: أول أسبوع (${list[0].week}) اتحسب بالقيمة التراكمية كاملة لأنه مفيش أسبوع قبله في الملف.` });
    }
  }

  const batches = new Map<string, StagedRow[]>();
  const latestTarget = new Map<string, { week: string; row: StagedRow }>();
  for (const d of kept) {
    const rows = batches.get(d.administration) ?? [];
    const grades = new Set([...d.values.keys()].map((k) => k.split("|")[1]));
    for (const grade of grades) {
      const program = programFor(grade);
      const screened = d.values.get(`screened|${grade}|`);
      const findings = [...d.values].filter(([k]) => k.startsWith(`indicator|${grade}|`));
      if (screened === undefined && findings.length) {
        issues.push({ level: "error", row: d.row, message: `${d.administration} أسبوع ${d.week}: فيه مؤشرات لـ${gradeLabels[grade]} من غير عدد المفحوصين.` });
        continue;
      }
      for (const [k, v] of findings)
        if (screened !== undefined && v > screened)
          issues.push({
            level: "error",
            row: d.row,
            message: `${d.administration} أسبوع ${d.week}: «${indicatorLabel(k.split("|")[2]) ?? k}» (${v}) أكبر من عدد المفحوصين (${screened}) في ${gradeLabels[grade]}.`,
          });
      if (screened !== undefined) rows.push({ week: d.week, program, sector: d.sector, grade, indicator: "screened", count: screened });
      for (const [k, v] of findings) rows.push({ week: d.week, program, sector: d.sector, grade, indicator: k.split("|")[2], count: v });
      const target = d.values.get(`target|${grade}|`);
      if (target !== undefined) {
        const tk = `${d.administration}|${d.sector}|${grade}`;
        const old = latestTarget.get(tk);
        if (!old || old.week <= d.week)
          latestTarget.set(tk, { week: d.week, row: { week: d.week, program, sector: d.sector, grade, indicator: "target", count: target } });
      }
    }
    batches.set(d.administration, rows);
  }
  for (const [tk, t] of latestTarget) {
    const administration = tk.split("|")[0];
    batches.get(administration)!.push(t.row);
  }

  if (context.allowed)
    for (const name of batches.keys())
      if (!context.allowed.includes(name)) {
        issues.push({ level: "error", message: `الملف فيه بيانات إدارة ${name}، وحسابك مسموح له بإدارته بس. احذف صفوفها أو اطلب من المديرية رفعها.` });
        batches.delete(name);
      }

  return {
    plan,
    issues,
    batches: [...batches].map(([administration, rows]) => ({
      administration,
      rows,
      weeks: [...new Set(rows.filter((r) => r.indicator !== "target").map((r) => r.week))].sort(),
      screened: rows.filter((r) => r.indicator === "screened").reduce((n, r) => n + r.count, 0),
    })),
  };
}
