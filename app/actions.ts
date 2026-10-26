"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { session } from "@/lib/data";
import { supabase, configured } from "@/lib/supabase";
import { authorize, linesSchema, previewImport } from "@/lib/domain";
const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const uuid = (f: FormData, k: string) => z.uuid().parse(text(f, k));
async function mutate(
  name: string,
  args: Record<string, unknown>,
  adminOnly = false,
) {
  const { db, profile } = await session();
  authorize(profile, true);
  if (adminOnly && profile.role !== "directorate_admin")
    throw new Error("FORBIDDEN");
  const { data, error } = await db.rpc(name, args);
  if (error) {
    console.error("RPC failed", name, error.code);
    throw new Error(
      "تعذر تنفيذ العملية. تحقق من الصلاحية والموعد وحالة النسخة والحقول المطلوبة.",
    );
  }
  revalidatePath("/", "layout");
  return data;
}
export async function login(f: FormData) {
  if (!configured()) redirect("/setup");
  const db = await supabase();
  const email = z.email().safeParse(text(f, "email"));
  const password = text(f, "password");
  if (!email.success || password.length < 8)
    redirect("/login?error=credentials");
  const { error } = await db.auth.signInWithPassword({
    email: email.data,
    password,
  });
  if (error) redirect("/login?error=credentials");
  redirect("/");
}
export async function logout() {
  const db = await supabase();
  await db.auth.signOut();
  redirect("/login");
}
export async function saveReport(f: FormData) {
  const { profile } = await session();
  const a = uuid(f, "administration_id");
  authorize(profile, true, a);
  const data = linesSchema.parse(JSON.parse(text(f, "lines")));
  const r = text(f, "revision_id");
  const result = await mutate("save_report", {
    a,
    y: uuid(f, "school_year_id"),
    w: z.iso.date().parse(text(f, "week_start")),
    data,
    r: r ? z.uuid().parse(r) : null,
  });
  return z.uuid().parse(result);
}
export async function transitionReport(f: FormData) {
  const action = z
    .enum(["submit", "approve", "return"])
    .parse(text(f, "action"));
  await mutate(
    "transition_report",
    { r: uuid(f, "revision_id"), action, comment: text(f, "comment") },
    action !== "submit",
  );
}
export async function reopenReport(f: FormData) {
  await mutate(
    "reopen_report",
    {
      sid: uuid(f, "submission_id"),
      until_at: z.iso.datetime({ offset: true }).parse(text(f, "until_at")),
      reason: text(f, "reason"),
    },
    true,
  );
}
export async function proposeTarget(f: FormData) {
  const { profile } = await session();
  const a = uuid(f, "administration_id");
  authorize(profile, true, a);
  await mutate("propose_target", {
    a,
    pid: uuid(f, "program_version_id"),
    sec: z.enum(["general", "azhar"]).parse(text(f, "sector")),
    g: text(f, "grade_code"),
    cnt: z.coerce
      .number()
      .int()
      .min(0)
      .max(10000000)
      .parse(text(f, "target_count")),
  });
}
export async function reviewTarget(f: FormData) {
  await mutate(
    "review_target",
    {
      tid: uuid(f, "target_id"),
      approve: text(f, "decision") === "approve",
      comment: text(f, "comment"),
    },
    true,
  );
}
export async function saveProgram(f: FormData) {
  await mutate(
    "save_program",
    {
      y: uuid(f, "school_year_id"),
      c: text(f, "code"),
      n: text(f, "name_ar"),
      e: text(f, "enabled") === "true",
      g: text(f, "grades")
        .split(",")
        .map((s) => s.trim()),
      ind: text(f, "indicators")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    },
    true,
  );
}
export async function createYear(f: FormData) {
  await mutate(
    "create_school_year",
    {
      l: text(f, "label"),
      s: z.iso.date().parse(text(f, "starts_on")),
      e: z.iso.date().parse(text(f, "ends_on")),
    },
    true,
  );
}
export async function assignRole(f: FormData) {
  await mutate(
    "assign_role",
    {
      uid: uuid(f, "user_id"),
      new_role: z
        .enum([
          "directorate_admin",
          "directorate_viewer",
          "administration_data_entry",
        ])
        .parse(text(f, "role")),
      a: text(f, "administration_id") ? uuid(f, "administration_id") : null,
    },
    true,
  );
}
export async function stageImport(f: FormData) {
  const { profile } = await session();
  const a = uuid(f, "administration_id");
  authorize(profile, true, a);
  const preview = previewImport(text(f, "csv"));
  if (preview.warnings.length || !preview.rows.length)
    throw new Error("عالج تحذيرات المعاينة أولًا");
  await mutate("stage_import", { a, data: preview.rows, w: [] });
  redirect("/imports?staged=1");
}
export async function setPassword(f: FormData) {
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  const password = z.string().min(12).max(128).parse(text(f, "password"));
  if (password !== text(f, "confirm"))
    throw new Error("كلمتا المرور غير متطابقتين");
  const { error } = await db.auth.updateUser({ password });
  if (error) throw new Error("تعذر تحديث كلمة المرور");
  redirect("/");
}
export async function saveSnapshot(f: FormData) {
  const result = await mutate("create_report_snapshot", {
    y: uuid(f, "year"),
    a: text(f, "administration") ? uuid(f, "administration") : null,
    w_from: text(f, "from") || null,
    w_to: text(f, "to") || null,
    p: text(f, "program"),
    sec: z.enum(["general", "azhar", "combined"]).parse(text(f, "sector")),
    g: text(f, "grade"),
    m: z.enum(["official", "pending"]).parse(text(f, "mode")),
  });
  redirect("/analytics?saved=" + result);
}
