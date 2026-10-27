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
export type WeekRule = "window" | "previous" | "same";
/** Per-submission decisions made by the reviewer, keyed by the sheet row number. */
export type Override = { week?: string; include?: boolean };
export type ImportOptions = {
  sector: Sector | "column";
  valueMode: "weekly" | "cumulative";
  weekRule: WeekRule;
  defaultAdministration?: string;
  defaultWeek?: string;
  overrides?: Record<number, Override>;
};
export type Issue = { level: "error" | "warning"; message: string; row?: number };
export type ColumnPlan = { index: number; header: string; meaning: HeaderMeaning };
export type SheetPlan = { format: "wide" | "long"; headerRow: number; columns: ColumnPlan[] };
/** One form response (wide sheets) as the reviewer sees it. */
export type SubmissionStatus = "kept" | "superseded" | "excluded";
export type Submission = {
  row: number;
  administration: string;
  sector: Sector;
  submitted: string; // as written in the sheet
  weekday: number | null; // 1 = Monday … 7 = Sunday
  proposedWeek: string; // what the rule (and resubmission detection) chose
  week: string; // final week after the reviewer's override
  overridden: boolean;
  late: boolean; // after Sunday 4 PM following the week
  screened: number;
  status: SubmissionStatus;
  reasons: string[]; // why superseded / excluded
  notes: string[]; // cell clean-ups and other things to look at
  errors: string[]; // problems that block saving while this submission is kept
};
export type ImportResult = {
  batches: { administration: string; rows: StagedRow[]; weeks: string[]; screened: number }[];
  issues: Issue[];
  plan: SheetPlan;
  submissions: Submission[];
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
    const columns: ColumnPlan[] = cells.map((header, index) => ({ index, header, meaning: interpretHeader(header) }));
    if (columns.some((c) => c.meaning.kind === "administration") && columns.some((c) => c.meaning.kind === "screened")) {
      // Some primary sheets shorten a header to "دمج اولي" / "دمج رابعه". Only when the
      // sheet has primary grades and nothing else is that read as "… ابتدائي".
      const grades = new Set(columns.flatMap((c) => ("grade" in c.meaning ? [c.meaning.grade] : [])));
      if ([...grades].every((g) => g === "primary1" || g === "primary4"))
        for (const c of columns)
          if (c.meaning.kind === "unknown" && /( |^)(اولي|رابعه)$/.test(normalizeArabic(c.header))) {
            const again = interpretHeader(c.header + " ابتدائي");
            if (again.kind !== "unknown") c.meaning = again;
          }
      return { format: "wide", headerRow: r, columns };
    }
  }
  throw new Error(
    "مش لاقي صف العناوين. لازم الشيت يكون فيه عمود «الإدارة» وأعمدة «ما تم فحصه» زي شيتات البلاغ الأصلية، أو الأعمدة week,program,sector,grade,indicator,count.",
  );
}

const arabicDigits = /[٠-٩]/g;
/** Parses a count cell. Empty → null (not reported). Throws a friendly message otherwise. */
export function parseCount(raw: unknown): number | null {
  const s = String(raw ?? "").replace(arabicDigits, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[,\s٬،]/g, "").trim();
  if (s === "" || s === "-") return null;
  if (!/^\d+(\.0+)?$/.test(s)) throw new Error(`القيمة «${String(raw).slice(0, 20)}» مش رقم صحيح موجب`);
  const n = Number(s);
  if (n > 10_000_000) throw new Error("الرقم أكبر من الحد المسموح");
  return n;
}

/**
 * Form cells sometimes hold a number with a word next to it ("25 لوز", "1 قلب مفتوح").
 * One number → that number, with a note so the reviewer sees what was read.
 * A stray letter or two ("ج") → treated as empty, with a note. Anything else
 * (several numbers, negative, decimals, "#VALUE!") → an error for that submission.
 */
export function readCell(raw: unknown): { value: number | null; note?: string; error?: string } {
  try {
    return { value: parseCount(raw) };
  } catch (e) {
    const text = String(raw ?? "").trim();
    const shown = text.replace(/\s+/g, " ").slice(0, 40);
    const latin = text.replace(arabicDigits, (d) => String(d.charCodeAt(0) - 0x0660));
    const numbers = latin.match(/\d+/g) ?? [];
    if (/^-\s*\d/.test(latin) || /\d[.]\d/.test(latin)) return { value: null, error: `«${shown}» مش رقم صحيح موجب` };
    if (!numbers.length) {
      if (text.replace(/\s/g, "").length <= 2) return { value: null, note: `«${shown}» مش رقم، واتعاملت كخانة فاضية` };
      return { value: null, error: (e as Error).message };
    }
    if (numbers.length === 1) {
      const value = Number(numbers[0]);
      if (value > 10_000_000) return { value: null, error: "الرقم أكبر من الحد المسموح" };
      return { value, note: `«${shown}» اتاخد منها الرقم ${value}` };
    }
    return { value: null, error: `«${shown}» فيها أكتر من رقم — اكتب رقم واحد أو استبعد الإرسال ده` };
  }
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
/** Seconds since midnight written in a timestamp cell (0 when absent). */
function stampSeconds(raw: unknown) {
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
  return seconds;
}
/** Sortable number for a submission time: YYYYMMDDhhmmss. */
function stampOrder(raw: unknown, date: Temporal.PlainDate) {
  const seconds = stampSeconds(raw);
  const hh = Math.floor(seconds / 3600), mm = Math.floor((seconds % 3600) / 60), ss = seconds % 60;
  return Number(date.toString().replaceAll("-", "")) * 1_000_000 + hh * 10_000 + mm * 100 + ss;
}
export function sundayOf(d: Temporal.PlainDate) {
  return d.subtract({ days: d.dayOfWeek % 7 });
}
/**
 * Reporting week (Sunday) for a submission date.
 * window (default): Wednesday → the following Tuesday belong to the week that started
 *   on the Sunday before — administrations send on Saturday, Sunday morning (deadline
 *   Sunday 4 PM) or a day or two late.
 * previous: always the week before the submission's week. same: the submission's week.
 */
export function reportingWeek(d: Temporal.PlainDate, rule: WeekRule) {
  if (rule === "same") return sundayOf(d);
  if (rule === "previous") return sundayOf(d).subtract({ days: 7 });
  return sundayOf(d.subtract({ days: 3 }));
}

type Draft = {
  administration: string;
  week: string;
  sector: Sector;
  order: number;
  row: number;
  values: Map<string, number>; // key `${kind}|${grade}|${indicator}`
  submission?: Submission;
};
const WEEKDAYS = ["", "الاتنين", "التلات", "الأربع", "الخميس", "الجمعة", "السبت", "الحد"];
export const weekdayName = (d: number | null) => (d ? WEEKDAYS[d] : "");

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
    let weekday: number | null = null;
    let late = false;
    const submitted = timeIndex !== undefined ? String(cells[timeIndex] ?? "").trim() : "";
    if (!date && timeIndex !== undefined) {
      const stamp = parseDateish(cells[timeIndex]);
      if (stamp) {
        order = stampOrder(cells[timeIndex], stamp);
        weekday = stamp.dayOfWeek;
        date = reportingWeek(stamp, options.weekRule);
        // Deadline: Sunday 4 PM (Cairo) right after the week ends.
        const deadline = date.add({ days: 7 });
        late = Temporal.PlainDate.compare(stamp, deadline) > 0 || (stamp.equals(deadline) && stampSeconds(cells[timeIndex]) >= 16 * 3600);
      }
    }
    if (!date && options.defaultWeek) date = Temporal.PlainDate.from(options.defaultWeek);
    if (!date) {
      fail("مفيش تاريخ أو أسبوع للصف ده. حدد «أسبوع البلاغ» من الإعدادات.");
      continue;
    }
    const week = sundayOf(date).toString();
    const values = new Map<string, number>();
    const notes: string[] = [];
    const errors: string[] = [];
    for (const c of plan.columns) {
      const m = c.meaning;
      if (m.kind !== "screened" && m.kind !== "target" && m.kind !== "indicator") continue;
      const cell = readCell(cells[c.index]);
      const where = `عمود «${c.header.trim().replace(/\s+/g, " ")}»`;
      if (cell.error) {
        errors.push(`${where}: ${cell.error}`);
        continue;
      }
      if (cell.note) notes.push(`${where}: ${cell.note}`);
      if (cell.value === null) continue;
      if (m.kind === "indicator") {
        const program = catalog.get(programFor(m.grade));
        if (!program?.indicators.includes(m.indicator)) {
          const set = missingIndicators.get(programFor(m.grade)) ?? new Set();
          set.add(m.indicator);
          missingIndicators.set(programFor(m.grade), set);
          continue;
        }
      }
      values.set(`${m.kind}|${m.grade}|${m.kind === "indicator" ? m.indicator : ""}`, cell.value);
    }
    const submission: Submission = {
      row: rowNo,
      administration,
      sector,
      submitted,
      weekday,
      proposedWeek: week,
      week,
      overridden: false,
      late,
      screened: [...values].filter(([k]) => k.startsWith("screened|")).reduce((n, [, v]) => n + v, 0),
      status: "kept",
      reasons: [],
      notes,
      errors,
    };
    drafts.push({ administration, week, sector, order, row: rowNo, values, submission });
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

  if (plan.format === "wide") reviewSubmissions(drafts, options.overrides ?? {});

  // Duplicate submissions for the same administration/week/sector: keep the latest one.
  const byKey = new Map<string, Draft[]>();
  for (const d of drafts) {
    if (d.submission?.status === "excluded") continue;
    const k = `${d.administration}|${d.week}|${d.sector}`;
    byKey.set(k, [...(byKey.get(k) ?? []), d]);
  }
  const kept: Draft[] = [];
  for (const [k, list] of byKey) {
    list.sort((a, b) => a.order - b.order || a.row - b.row);
    const last = list.at(-1)!;
    if (list.length > 1 && plan.format === "wide") {
      const [administration, week, sector] = k.split("|");
      for (const d of list.slice(0, -1)) {
        d.submission!.status = "superseded";
        d.submission!.reasons.push(`فيه إرسال أحدث لنفس الأسبوع (صف ${last.row})، فاتاخد الأحدث`);
      }
      issues.push({
        level: "warning",
        message: `${administration} بعتت ${list.length} مرات لأسبوع ${week} (${sector === "azhar" ? "أزهري" : "عام"}) — الصفوف ${list.map((d) => d.row).join("، ")}. اتاخد آخر إرسال بس (صف ${last.row}). تقدر تغيّر ده من جدول الإرسالات.`,
      });
    }
    kept.push(last);
  }
  // Problems inside a submission only block saving when that submission is used.
  for (const d of kept) for (const message of d.submission?.errors ?? []) issues.push({ level: "error", row: d.row, message: `${d.administration}: ${message}` });

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
        const message = `${d.administration} أسبوع ${d.week}: فيه مؤشرات لـ${gradeLabels[grade]} من غير عدد المفحوصين.`;
        issues.push({ level: "error", row: d.row, message });
        d.submission?.errors.push(message);
        continue;
      }
      for (const [k, v] of findings)
        if (screened !== undefined && v > screened) {
          const message = `${d.administration} أسبوع ${d.week}: «${indicatorLabel(k.split("|")[2]) ?? k}» (${v}) أكبر من عدد المفحوصين (${screened}) في ${gradeLabels[grade]}.`;
          issues.push({ level: "error", row: d.row, message });
          d.submission?.errors.push(message);
        }
      if (screened !== undefined) rows.push({ week: d.week, program, sector: d.sector, grade, indicator: "screened", count: screened });
      for (const [k, v] of findings) rows.push({ week: d.week, program, sector: d.sector, grade, indicator: k.split("|")[2], count: v });
      const target = d.values.get(`target|${grade}|`);
      // A zero target means "not filled in" in the forms; the latest real target wins.
      if (target !== undefined && target > 0) {
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
    submissions: drafts.flatMap((d) => (d.submission ? [d.submission] : [])).sort((a, b) => a.row - b.row),
    batches: [...batches].map(([administration, rows]) => ({
      administration,
      rows,
      weeks: [...new Set(rows.filter((r) => r.indicator !== "target").map((r) => r.week))].sort(),
      screened: rows.filter((r) => r.indicator === "screened").reduce((n, r) => n + r.count, 0),
    })),
  };
}

const signature = (values: Map<string, number>, prefix?: string) =>
  [...values]
    .filter(([k]) => !prefix || k.startsWith(prefix))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => k + "=" + v)
    .join(";");

/**
 * Applies what the forms data shows in practice, always visibly and always overridable:
 * - a submission with nothing screened is set aside;
 * - a resubmission (same screened counts as an earlier one from the same administration)
 *   is a correction of that earlier report, so it goes to the same week;
 * - targets copied from another administration are ignored;
 * - then the reviewer's own choices (week / include) win.
 */
function reviewSubmissions(drafts: Draft[], overrides: Record<number, Override>) {
  const ordered = [...drafts].sort((a, b) => a.order - b.order || a.row - b.row);
  const seen = new Map<string, Draft>();
  for (const d of ordered) {
    const s = d.submission!;
    const screenedSig = signature(new Map([...d.values].filter(([k, v]) => k.startsWith("screened|") && v > 0)));
    const anything = [...d.values].some(([k, v]) => !k.startsWith("target|") && v > 0);
    if (!anything) {
      s.status = "excluded";
      s.reasons.push("مفيش أي فحص أو حالات في الإرسال ده (كله أصفار أو فاضي)");
    } else if (screenedSig) {
      const key = `${d.administration}|${d.sector}|${screenedSig}`;
      const earlier = seen.get(key);
      if (earlier) {
        const identical = signature(earlier.values) === signature(d.values);
        d.week = earlier.week;
        s.proposedWeek = earlier.week;
        s.notes.push(
          identical
            ? `نسخة مطابقة لإرسال صف ${earlier.row} — اتحسبت على نفس الأسبوع`
            : `نفس أعداد المفحوصين بتاعة إرسال صف ${earlier.row}، فاتعاملت كتعديل لنفس البلاغ (نفس الأسبوع)`,
        );
      } else seen.set(key, d);
    }
  }
  // Targets identical to another administration's are almost certainly copied by mistake.
  const targetSigs = new Map<string, Set<string>>();
  for (const d of drafts) {
    const sig = signature(new Map([...d.values].filter(([k, v]) => k.startsWith("target|") && v > 0)));
    if (sig) targetSigs.set(sig, new Set([...(targetSigs.get(sig) ?? []), d.administration]));
  }
  for (const d of drafts) {
    const sig = signature(new Map([...d.values].filter(([k, v]) => k.startsWith("target|") && v > 0)));
    const owners = sig ? targetSigs.get(sig) : undefined;
    if (owners && owners.size > 1) {
      const others = [...owners].filter((n) => n !== d.administration);
      // Keep the targets for the administration that used them most often.
      const count = (name: string) => drafts.filter((x) => x.administration === name && signature(new Map([...x.values].filter(([k, v]) => k.startsWith("target|") && v > 0))) === sig).length;
      if (others.some((n) => count(n) > count(d.administration))) {
        for (const k of [...d.values.keys()]) if (k.startsWith("target|")) d.values.delete(k);
        d.submission!.notes.push(`المستهدفات في الإرسال ده هي نفسها مستهدفات ${others.join("، ")} — اتجاهلت`);
      }
    }
  }
  for (const d of drafts) {
    const s = d.submission!;
    const o = overrides[s.row];
    if (!o) continue;
    if (o.week && o.week !== d.week) {
      d.week = o.week;
      s.overridden = true;
    }
    if (o.include === false && s.status !== "excluded") {
      s.status = "excluded";
      s.reasons.push("استبعدته من المراجعة");
    } else if (o.include === true && s.status === "excluded") {
      s.status = "kept";
      s.reasons = [];
    }
  }
  for (const d of drafts) d.submission!.week = d.week;
}
