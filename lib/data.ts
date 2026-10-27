import "server-only";
import { cache } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { redirect } from "next/navigation";
import { supabase, configured } from "./supabase";
import type {
  Profile,
  Administration,
  SchoolYear,
  Program,
  Submission,
  Revision,
  Line,
  Target,
  Filters,
  FactSet,
} from "./domain";

type Db = Awaited<ReturnType<typeof supabase>>;

/**
 * Verified session, memoised for the current request: layout, page and helpers
 * share ONE Auth round-trip instead of re-validating the user several times.
 */
export const session = cache(async () => {
  if (!configured()) redirect("/setup");
  const db = await supabase();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) redirect("/login");
  const { data: profile, error: pe } = await db
    .from("user_profiles")
    .select("user_id,role,administration_id,full_name,email,status")
    .eq("user_id", user.id)
    .single();
  if (pe || !profile) redirect("/login?error=profile");
  if (profile.status === "disabled") redirect("/login?error=disabled");
  return { db, user, profile: profile as Profile };
});

/** Reads a whole (small, RLS-filtered) table in pages; refuses silently-truncated results. */
export async function all<T>(table: string, existingDb?: Db, columns = "*"): Promise<T[]> {
  const db = existingDb ?? (await session()).db;
  const result: T[] = [];
  for (let offset = 0; offset < 100000; offset += 1000) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .order(table === "user_profiles" ? "user_id" : "id")
      .range(offset, offset + 999);
    if (error) throw new Error(`تعذر قراءة ${table}`);
    result.push(...(data as T[]));
    if (data.length < 1000) return result;
  }
  throw new Error("حجم البيانات يتجاوز الحد؛ يلزم ترشيح على الخادم قبل عرض النتائج");
}

/** Reference data used by almost every page: 13 administrations, years and program versions. */
export const reference = cache(async () => {
  const { db } = await session();
  const [administrations, years, programs] = await Promise.all([
    all<Administration>("administrations", db, "id,name_ar"),
    all<SchoolYear>("school_years", db, "id,label,starts_on,ends_on"),
    all<Program>("program_versions", db, "id,school_year_id,code,name_ar,version,enabled,grades,indicators"),
  ]);
  administrations.sort((a, b) => a.name_ar.localeCompare(b.name_ar, "ar"));
  return { administrations, years: years.sort((a, b) => a.starts_on.localeCompare(b.starts_on)), programs };
});

/** Aggregated facts computed by PostgreSQL under the caller's RLS. */
/** narrow=true also filters program and sector in SQL (pages that show one program at a time). */
export async function facts(f: Filters, byWeek = false, narrow = false): Promise<FactSet> {
  const { db } = await session();
  if (!f.year) return { facts: [], reports: [] };
  const { data, error } = await db.rpc("report_facts", {
    y: f.year,
    m: f.mode,
    w_from: f.from || null,
    w_to: f.to || null,
    by_week: byWeek,
    prog: narrow ? f.program : null,
    sec: narrow ? f.sector : null,
  });
  if (error) throw new Error("تعذر حساب المؤشرات");
  return data as FactSet;
}

export async function targetsFor(year: string) {
  const { db } = await session();
  if (!year) return [];
  const { data, error } = await db
    .from("target_versions")
    .select("id,administration_id,school_year_id,program_version_id,program_code,sector,grade_code,target_count,version,status,effective_at,review_comment,created_at")
    .eq("school_year_id", year)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error("تعذر قراءة المستهدفات");
  return data as (Target & { created_at: string })[];
}

/** Payload with the same shape as saved snapshots, filtered in the database (exports). */
export async function payload(f: Filters) {
  const { db } = await session();
  const { data, error } = await db.rpc("report_payload", {
    y: f.year,
    a: f.administration || null,
    w_from: f.from || null,
    w_to: f.to || null,
    p: f.program,
    sec: f.sector,
    g: f.grade,
    m: f.mode,
  });
  if (error) throw new Error("تعذر تجهيز التصدير");
  return data as {
    submissions: Submission[];
    revisions: Revision[];
    lines: Line[];
    targets: Target[];
    administrations: Administration[];
    years: SchoolYear[];
  };
}

export type SubmissionWithRevisions = Submission & {
  submission_revisions: Pick<Revision, "id" | "revision_number" | "status" | "submitted_at" | "created_at">[];
};
const submissionColumns =
  "id,administration_id,school_year_id,week_start,official_revision_id,reopened_until,reopen_reason,submission_revisions!submission_revisions_submission_id_fkey(id,revision_number,status,submitted_at,created_at)";

export async function submissionPage(opts: { year?: string; administration?: string; page: number; size: number }) {
  const { db } = await session();
  let q = db.from("weekly_submissions").select(submissionColumns, { count: "exact" });
  if (opts.year) q = q.eq("school_year_id", opts.year);
  if (opts.administration) q = q.eq("administration_id", opts.administration);
  const from = (opts.page - 1) * opts.size;
  const { data, error, count } = await q
    .order("week_start", { ascending: false })
    .order("id")
    .range(from, from + opts.size - 1);
  if (error) throw new Error("تعذر قراءة البلاغات");
  return { rows: data as unknown as SubmissionWithRevisions[], total: count ?? 0 };
}

/** One revision with its submission, lines and version history — only what the report page shows. */
export async function reportDetail(revisionId: string) {
  const { db } = await session();
  const { data: revision } = await db
    .from("submission_revisions")
    .select("id,submission_id,revision_number,status,submitted_at,review_comment,created_at")
    .eq("id", revisionId)
    .maybeSingle();
  if (!revision) return null;
  const [submission, lines] = await Promise.all([
    db.from("weekly_submissions").select(submissionColumns).eq("id", revision.submission_id).single(),
    db.from("report_lines").select("id,revision_id,program_version_id,program_code,sector,grade_code,screened,findings").eq("revision_id", revisionId),
  ]);
  if (submission.error || lines.error) return null;
  return {
    revision: revision as Revision,
    submission: submission.data as unknown as SubmissionWithRevisions,
    lines: lines.data as Line[],
  };
}

export async function linesOf(revisionId: string | null) {
  if (!revisionId) return [];
  const { db } = await session();
  const { data } = await db
    .from("report_lines")
    .select("id,revision_id,program_version_id,program_code,sector,grade_code,screened,findings")
    .eq("revision_id", revisionId);
  return (data ?? []) as Line[];
}

export function filters(params: Record<string, string | string[] | undefined>, years: SchoolYear[]): Filters {
  const get = (k: string, d = "") => (typeof params[k] === "string" ? (params[k] as string) : d);
  const date = (k: string) => {
    const v = get(k);
    try {
      return v ? Temporal.PlainDate.from(v).toString() : "";
    } catch {
      return "";
    }
  };
  const to = date("to");
  const today = Temporal.Now.plainDateISO("Africa/Cairo").toString();
  const current = years.find((y) => y.starts_on <= today && y.ends_on >= today) || years.at(-1);
  const year = years.some((y) => y.id === get("year")) ? get("year") : current?.id || "";
  return {
    year,
    mode: get("mode") === "pending" ? "pending" : "official",
    sector: ["general", "azhar", "combined"].includes(get("sector")) ? get("sector") : "general",
    program: get("program") || "comprehensive",
    grade: get("grade"),
    administration: get("administration"),
    from: date("from"),
    to,
    asOf: to
      ? Temporal.PlainDate.from(to)
          .add({ days: 6 })
          .toZonedDateTime({ timeZone: "Africa/Cairo", plainTime: "23:59:59.999" })
          .toInstant()
          .toString()
      : undefined,
  };
}

export { errorMessages, errorCode } from "./messages";
