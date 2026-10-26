import "server-only";
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
} from "./domain";
export async function session() {
  if (!configured()) redirect("/setup");
  const db = await supabase();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) redirect("/login");
  const { data: profile, error: pe } = await db
    .from("user_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();
  if (pe || !profile) redirect("/login?error=profile");
  return { db, user, profile: profile as Profile };
}
export async function all<T>(table: string): Promise<T[]> {
  const { db } = await session();
  const result: T[] = [];
  for (let offset = 0; offset < 100000; offset += 1000) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .order(
        table === "user_profiles"
          ? "user_id"
          : table === "audit_log"
            ? "id"
            : "id",
      )
      .range(offset, offset + 999);
    if (error) throw new Error(`تعذر قراءة ${table}`);
    result.push(...(data as T[]));
    if (data.length < 1000) return result;
  }
  throw new Error(
    "حجم البيانات يتجاوز الحد؛ يلزم ترشيح على الخادم قبل عرض النتائج",
  );
}
export async function dataset() {
  const [
    administrations,
    years,
    programs,
    submissions,
    revisions,
    lines,
    targets,
  ] = await Promise.all([
    all<Administration>("administrations"),
    all<SchoolYear>("school_years"),
    all<Program>("program_versions"),
    all<Submission>("weekly_submissions"),
    all<Revision>("submission_revisions"),
    all<Line>("report_lines"),
    all<Target>("target_versions"),
  ]);
  return {
    administrations,
    years: years.sort((a, b) => a.starts_on.localeCompare(b.starts_on)),
    programs,
    submissions,
    revisions,
    lines,
    targets,
  };
}
export function filters(
  params: Record<string, string | string[] | undefined>,
  years: SchoolYear[],
): Filters {
  const get = (k: string, d = "") =>
    typeof params[k] === "string" ? (params[k] as string) : d;
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
  const current =
    years.find((y) => y.starts_on <= today && y.ends_on >= today) ||
    years.at(-1);
  const year = years.some((y) => y.id === get("year"))
    ? get("year")
    : current?.id || "";
  return {
    year,
    mode: get("mode") === "pending" ? "pending" : "official",
    sector: ["general", "azhar", "combined"].includes(get("sector"))
      ? get("sector")
      : "general",
    program: get("program") || "comprehensive",
    grade: get("grade"),
    administration: get("administration"),
    from: date("from"),
    to,
    asOf: to
      ? Temporal.PlainDate.from(to)
          .add({ days: 6 })
          .toZonedDateTime({
            timeZone: "Africa/Cairo",
            plainTime: "23:59:59.999",
          })
          .toInstant()
          .toString()
      : undefined,
  };
}
