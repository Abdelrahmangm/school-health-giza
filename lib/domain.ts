import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
export const roles = [
  "directorate_admin",
  "directorate_viewer",
  "administration_data_entry",
] as const;
export type Role = (typeof roles)[number];
export type Profile = {
  user_id: string;
  role: Role;
  administration_id: string | null;
};
export type Administration = { id: string; name_ar: string };
export type SchoolYear = {
  id: string;
  label: string;
  starts_on: string;
  ends_on: string;
};
export type Program = {
  id: string;
  school_year_id: string;
  code: string;
  name_ar: string;
  version: number;
  enabled: boolean;
  grades: string[];
  indicators: string[];
};
export type Submission = {
  id: string;
  administration_id: string;
  school_year_id: string;
  week_start: string;
  official_revision_id: string | null;
  reopened_until: string | null;
  reopen_reason: string | null;
};
export type Revision = {
  id: string;
  submission_id: string;
  revision_number: number;
  status: string;
  submitted_at: string | null;
  review_comment: string | null;
  created_at: string;
};
export type Line = {
  id?: string;
  revision_id?: string;
  program_version_id: string;
  program_code?: string;
  sector: "general" | "azhar";
  grade_code: string;
  screened: number;
  findings: Record<string, number>;
};
export type Target = {
  id: string;
  administration_id: string;
  school_year_id: string;
  program_version_id: string;
  program_code: string;
  sector: string;
  grade_code: string;
  target_count: number;
  version: number;
  status: string;
  effective_at: string | null;
  review_comment: string | null;
};
export const labels: Record<string, string> = Object.assign(
  Object.create(null),
  {
    directorate_admin: "مدير المديرية",
    directorate_viewer: "مشاهد المديرية",
    administration_data_entry: "مدخل بيانات الإدارة",
    general: "عام",
    azhar: "أزهري",
    combined: "القطاعان معًا",
    kg1: "رياض أطفال أولى",
    kg2: "رياض أطفال ثانية",
    primary1: "أولى ابتدائي",
    primary4: "رابعة ابتدائي",
    preparatory1: "أولى إعدادي",
    secondary1: "أولى ثانوي",
    comprehensive: "الفحص الشامل",
    vision: "الإبصار",
    anemia: "الأنيميا",
    obesity: "السمنة",
    underweight: "نقص الوزن",
    dental: "الأسنان",
    hearing: "السمع",
    visual_impairment: "ضعف الإبصار",
    strabismus: "الحول",
    ptosis: "سقوط الجفن",
    draft: "مسودة",
    provisional: "أولي — بانتظار الاعتماد",
    approved: "معتمد",
    needs_correction: "معاد للتصحيح",
    superseded: "نسخة سابقة",
    proposed: "مقترح",
    rejected: "مرفوض",
  },
);
export function weekFor(instant: string) {
  const d = Temporal.Instant.from(instant)
    .toZonedDateTimeISO("Africa/Cairo")
    .toPlainDate();
  return d.subtract({ days: d.dayOfWeek % 7 }).toString();
}
export function deadline(week: string) {
  const d = Temporal.PlainDate.from(week);
  if (d.dayOfWeek !== 7) throw new Error("WEEK_MUST_START_SUNDAY");
  return d
    .add({ days: 7 })
    .toZonedDateTime({ timeZone: "Africa/Cairo", plainTime: "16:00" })
    .toInstant()
    .toString();
}
export function canEdit(
  role: Role,
  week: string,
  now: string,
  reopenedUntil?: string | null,
) {
  if (role === "directorate_viewer") return false;
  if (role === "directorate_admin") return true;
  const limit = Math.max(
    Date.parse(deadline(week)),
    reopenedUntil ? Date.parse(reopenedUntil) : 0,
  );
  return Date.parse(now) < limit;
}
export function authorize(profile: Profile, write = false, admin?: string) {
  if (write && profile.role === "directorate_viewer")
    throw new Error("FORBIDDEN");
  if (
    admin &&
    profile.role === "administration_data_entry" &&
    profile.administration_id !== admin
  )
    throw new Error("FORBIDDEN");
}
export const lineSchema = z
  .object({
    program_version_id: z.uuid(),
    sector: z.enum(["general", "azhar"]),
    grade_code: z.string().min(1).max(50),
    screened: z.number().int().min(0).max(10000000),
    findings: z.record(
      z.string().regex(/^[a-z_]{1,50}$/),
      z.number().int().min(0).max(10000000),
    ),
  })
  .strict()
  .refine(
    (l) => Object.values(l.findings).every((n) => n <= l.screened),
    "كل مؤشر يجب ألا يتجاوز عدد المفحوصين",
  );
export const linesSchema = z
  .array(lineSchema)
  .min(1)
  .max(500)
  .superRefine((rows, ctx) => {
    const keys = new Set<string>();
    for (const row of rows) {
      const key = [row.program_version_id, row.sector, row.grade_code].join(
        "/",
      );
      if (keys.has(key))
        ctx.addIssue({ code: "custom", message: "صفوف مكررة" });
      keys.add(key);
    }
  });
export function latestPrograms(programs: Program[]) {
  const map = new Map<string, Program>();
  for (const p of programs) {
    const k = p.school_year_id + "/" + p.code;
    if (!map.has(k) || map.get(k)!.version < p.version) map.set(k, p);
  }
  return [...map.values()];
}
export type Filters = {
  year: string;
  mode: "official" | "pending";
  sector: string;
  program: string;
  grade: string;
  administration: string;
  from: string;
  to: string;
  asOf?: string;
};
export function aggregate(
  submissions: Submission[],
  revisions: Revision[],
  lines: Line[],
  targets: Target[],
  f: Filters,
) {
  const ss = submissions.filter(
    (s) =>
      s.school_year_id === f.year &&
      (!f.administration || s.administration_id === f.administration) &&
      (!f.from || s.week_start >= f.from) &&
      (!f.to || s.week_start <= f.to),
  );
  const selected = new Set<string>();
  for (const s of ss) {
    if (f.mode === "official") {
      if (s.official_revision_id) selected.add(s.official_revision_id);
    } else {
      const r = revisions
        .filter((r) => r.submission_id === s.id && r.status === "provisional")
        .sort((a, b) => b.revision_number - a.revision_number)[0];
      if (r) selected.add(r.id);
    }
  }
  const match = (l: {
    sector: string;
    program_code?: string;
    grade_code: string;
  }) =>
    (f.sector === "combined" || l.sector === f.sector) &&
    (!f.program || l.program_code === f.program) &&
    (!f.grade || l.grade_code === f.grade);
  const rows = lines.filter(
    (l) => l.revision_id && selected.has(l.revision_id) && match(l),
  );
  const screened = rows.reduce((n, l) => n + l.screened, 0);
  const findings: Record<string, number> = Object.create(null);
  for (const l of rows)
    for (const [k, v] of Object.entries(l.findings))
      findings[k] = (findings[k] || 0) + v;
  const targetMap = new Map<string, Target>();
  for (const t of targets.filter(
    (t) =>
      t.school_year_id === f.year &&
      (!f.administration || t.administration_id === f.administration) &&
      ["approved", "superseded"].includes(t.status) &&
      t.effective_at &&
      (!f.asOf || Date.parse(t.effective_at) <= Date.parse(f.asOf)) &&
      match(t),
  )) {
    const k = [
      t.administration_id,
      t.program_code,
      t.sector,
      t.grade_code,
    ].join("/");
    const old = targetMap.get(k);
    if (
      !old ||
      Date.parse(t.effective_at!) > Date.parse(old.effective_at!) ||
      (t.effective_at === old.effective_at && t.version > old.version)
    )
      targetMap.set(k, t);
  }
  const target = [...targetMap.values()].reduce(
    (n, t) => n + t.target_count,
    0,
  );
  return {
    screened,
    target,
    achievement: target ? (screened / target) * 100 : null,
    findings,
    rates: Object.fromEntries(
      Object.entries(findings).map(([k, v]) => [
        k,
        screened ? (v / screened) * 100 : null,
      ]),
    ),
    reportCount: selected.size,
    rows,
  };
}
export function csvCell(v: unknown) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r\n]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function csv(rows: unknown[][]) {
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
export function ministryExport(): never {
  throw new Error("MINISTRY_MAPPING_NOT_VERIFIED");
}
export type ImportRow = {
  week: string;
  program: string;
  sector: string;
  grade: string;
  indicator: string;
  count: number;
};
export function previewImport(source: string) {
  const warnings: string[] = [];
  const rows: ImportRow[] = [];
  const seen = new Set<string>();
  const all = source.trim().split(/\r?\n/);
  if (all.length > 501) throw new Error("الحد الأقصى 500 صف");
  const header = all.shift()?.trim();
  if (header !== "week,program,sector,grade,indicator,count")
    throw new Error(
      "الأعمدة المسموحة فقط: week,program,sector,grade,indicator,count. لا تُدخل أسماء أو بيانات شخصية.",
    );
  for (const [i, line] of all.entries()) {
    const c = line.split(",").map((s) => s.trim());
    const [week, program, sector, grade, indicator, count] = c;
    if (
      c.length !== 6 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(week) ||
      !["comprehensive", "vision"].includes(program) ||
      !["general", "azhar"].includes(sector) ||
      ![
        "kg1",
        "kg2",
        "primary1",
        "primary4",
        "preparatory1",
        "secondary1",
      ].includes(grade) ||
      !/^[a-z_]{1,50}$/.test(indicator) ||
      !/^\d+$/.test(count) ||
      Number(count) > 10000000
    ) {
      warnings.push(`صف ${i + 2}: بيانات غير صالحة أو حقول غير مسموحة`);
      continue;
    }
    try {
      deadline(week);
    } catch {
      warnings.push(`صف ${i + 2}: الأسبوع يجب أن يبدأ الأحد`);
      continue;
    }
    if ((program === "vision") !== (grade === "kg2")) {
      warnings.push(`صف ${i + 2}: الصف لا يتوافق مع البرنامج`);
      continue;
    }
    const known =
      program === "vision"
        ? ["screened", "visual_impairment", "strabismus", "ptosis"]
        : ["screened", "anemia", "obesity", "underweight", "dental", "hearing"];
    if (!known.includes(indicator)) {
      warnings.push(`صف ${i + 2}: مؤشر غير معروف`);
      continue;
    }
    const key = c.slice(0, 5).join("/");
    if (seen.has(key)) {
      warnings.push(`صف ${i + 2}: تكرار؛ لم يتم دمجه`);
      continue;
    }
    seen.add(key);
    rows.push({
      week,
      program,
      sector,
      grade,
      indicator,
      count: Number(count),
    });
  }
  return { rows, warnings };
}

export function expectedWeeks(
  year: SchoolYear | undefined,
  from: string,
  to: string,
  instant: string,
) {
  if (!year) return [];
  let cursor = Temporal.PlainDate.from(
    from && from > year.starts_on ? from : year.starts_on,
  );
  cursor = cursor.add({ days: (7 - cursor.dayOfWeek) % 7 });
  const current = weekFor(instant);
  const end = [year.ends_on, to || current, current].sort()[0];
  const result: string[] = [];
  while (cursor.toString() <= end) {
    result.push(cursor.toString());
    cursor = cursor.add({ days: 7 });
  }
  return result;
}
