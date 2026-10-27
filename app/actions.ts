"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { session } from "@/lib/data";
import { supabase, configured } from "@/lib/supabase";
import { authAdmin, authPublic, siteUrl } from "@/lib/auth-admin";
import { errorCode } from "@/lib/messages";
import { authorize, linesSchema, isOperator, isSupervisor, latestPrograms, type Program } from "@/lib/domain";
import { SHEET_COMPREHENSIVE_INDICATORS } from "@/lib/catalog";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const uuid = (f: FormData, k: string) => z.uuid().parse(text(f, k));
const optionalUuid = (f: FormData, k: string) => (text(f, k) ? uuid(f, k) : null);
/** Only same-site relative paths, so a form cannot redirect users elsewhere. */
const safePath = (value: string, fallback: string) => (/^\/(?!\/)[\w\-/?=&%.]*$/.test(value) ? value : fallback);
const withParam = (path: string, key: string, value: string) => path + (path.includes("?") ? "&" : "?") + key + "=" + encodeURIComponent(value);

/** Calls an RPC under the user's own session. Never throws for expected errors. */
async function rpc(name: string, args: Record<string, unknown>, opts: { operator?: boolean; supervisor?: boolean } = {}) {
  const { db, profile } = await session();
  try {
    authorize(profile, true);
    if (opts.operator && !isOperator(profile.role)) return { ok: false as const, code: "FORBIDDEN" };
    if (opts.supervisor && !isSupervisor(profile.role)) return { ok: false as const, code: "FORBIDDEN" };
  } catch {
    return { ok: false as const, code: "FORBIDDEN" };
  }
  const { data, error } = await db.rpc(name, args);
  if (error) {
    console.error("RPC failed", name, error.code, errorCode(error.message));
    return { ok: false as const, code: errorCode(error.message) };
  }
  revalidatePath("/", "layout");
  return { ok: true as const, data };
}
function finish(result: { ok: boolean; code?: string }, path: string, notice = "saved"): never {
  redirect(result.ok ? withParam(path, "msg", notice) : withParam(path, "err", result.code ?? "GENERIC"));
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------
export async function login(f: FormData) {
  if (!configured()) redirect("/setup");
  const db = await supabase();
  const email = z.email().safeParse(text(f, "email").toLowerCase());
  const password = text(f, "password");
  if (!email.success || password.length < 8) redirect("/login?error=credentials");
  const { error } = await db.auth.signInWithPassword({ email: email.data, password });
  if (error) redirect("/login?error=credentials");
  redirect("/");
}
export async function logout() {
  const db = await supabase();
  await db.auth.signOut();
  redirect("/login");
}
/** Self-service reset. Always shows the same message so it cannot reveal which e-mails exist. */
export async function requestPasswordReset(f: FormData) {
  if (!configured()) redirect("/setup");
  const email = z.email().safeParse(text(f, "email").toLowerCase());
  if (email.success) {
    const { error } = await authPublic().resetPasswordForEmail(email.data, { redirectTo: (await siteUrl()) + "/auth/accept" });
    if (error) console.error("Password reset request failed", error.code);
  }
  redirect("/auth/forgot?msg=reset_requested");
}
/** Receives the tokens an e-mail link put in the URL fragment and stores them as HttpOnly cookies. */
export async function acceptSession(accessToken: string, refreshToken: string) {
  if (!configured()) return { ok: false };
  const tokens = z.object({ a: z.string().min(20).max(8000), r: z.string().min(6).max(2000) }).safeParse({ a: accessToken, r: refreshToken });
  if (!tokens.success) return { ok: false };
  const db = await supabase();
  const { error } = await db.auth.setSession({ access_token: tokens.data.a, refresh_token: tokens.data.r });
  return { ok: !error };
}
export async function setPassword(f: FormData) {
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  const password = text(f, "password");
  if (password.length < 12 || password.length > 128) redirect("/auth/set-password?err=PASSWORD_SHORT");
  if (!/[A-Za-z؀-ۿ]/.test(password) || !/\d/.test(password)) redirect("/auth/set-password?err=PASSWORD_WEAK");
  if (password !== text(f, "confirm")) redirect("/auth/set-password?err=PASSWORD_MISMATCH");
  const { error } = await db.auth.updateUser({ password });
  if (error) {
    console.error("Password update failed", error.code);
    redirect("/auth/set-password?err=" + (error.code === "same_password" ? "PASSWORD_SAME" : error.code === "weak_password" ? "PASSWORD_WEAK" : "PASSWORD_FAILED"));
  }
  redirect("/?msg=password_updated");
}

// ---------------------------------------------------------------------------
// Weekly reports
// ---------------------------------------------------------------------------
export async function saveReport(f: FormData): Promise<{ id?: string; error?: string }> {
  const { profile } = await session();
  const a = z.uuid().safeParse(text(f, "administration_id"));
  if (!a.success) return { error: "FORBIDDEN" };
  try {
    authorize(profile, true, a.data);
  } catch {
    return { error: "FORBIDDEN" };
  }
  const data = linesSchema.safeParse(JSON.parse(text(f, "lines") || "[]"));
  if (!data.success) return { error: "INVALID_FINDING" };
  const r = text(f, "revision_id");
  const week = z.iso.date().safeParse(text(f, "week_start"));
  const year = z.uuid().safeParse(text(f, "school_year_id"));
  if (!week.success || !year.success) return { error: "INVALID_YEAR_WEEK" };
  const result = await rpc("save_report", { a: a.data, y: year.data, w: week.data, data: data.data, r: r ? z.uuid().parse(r) : null });
  return result.ok ? { id: z.uuid().parse(result.data) } : { error: result.code };
}
export async function transitionReport(f: FormData) {
  const id = uuid(f, "revision_id");
  const action = z.enum(["submit", "approve", "return"]).parse(text(f, "action"));
  const result = await rpc("transition_report", { r: id, action, comment: text(f, "comment") }, { operator: action !== "submit" });
  finish(result, "/reports/" + id);
}
export async function reopenReport(f: FormData) {
  const submission = uuid(f, "submission_id");
  const back = safePath(text(f, "return_to"), "/reports");
  let until: string;
  try {
    // The form sends Cairo wall-clock time; convert it here so the browser clock never matters.
    until = Temporal.PlainDateTime.from(text(f, "until_local")).toZonedDateTime("Africa/Cairo").toInstant().toString();
  } catch {
    redirect(withParam(back, "err", "INVALID_REOPEN"));
  }
  finish(await rpc("reopen_report", { sid: submission, until_at: until, reason: text(f, "reason") }, { operator: true }), back);
}

// ---------------------------------------------------------------------------
// Targets, programs, years, snapshots
// ---------------------------------------------------------------------------
export async function proposeTarget(f: FormData) {
  const { profile } = await session();
  const a = uuid(f, "administration_id");
  if (profile.role === "administration_data_entry" && profile.administration_id !== a) finish({ ok: false, code: "FORBIDDEN" }, "/targets");
  const count = z.coerce.number().int().min(0).max(10000000).safeParse(text(f, "target_count"));
  if (!count.success) finish({ ok: false, code: "INVALID_FINDING" }, "/targets");
  finish(
    await rpc("propose_target", {
      a,
      pid: uuid(f, "program_version_id"),
      sec: z.enum(["general", "azhar"]).parse(text(f, "sector")),
      g: text(f, "grade_code"),
      cnt: count.data,
    }),
    "/targets",
  );
}
export async function reviewTarget(f: FormData) {
  finish(
    await rpc("review_target", { tid: uuid(f, "target_id"), approve: text(f, "decision") === "approve", comment: text(f, "comment") }, { operator: true }),
    "/targets",
  );
}
export async function saveProgram(f: FormData) {
  finish(
    await rpc(
      "save_program",
      {
        y: uuid(f, "school_year_id"),
        c: text(f, "code"),
        n: text(f, "name_ar"),
        e: text(f, "enabled") === "true",
        g: text(f, "grades").split(",").map((s) => s.trim()).filter(Boolean),
        ind: text(f, "indicators").split(",").map((s) => s.trim()).filter(Boolean),
      },
      { operator: true },
    ),
    "/programs",
    "program_saved",
  );
}
/** Adds the indicators used by the original directorate sheets to the comprehensive program (new version). */
export async function addSheetIndicators(f: FormData) {
  const { db } = await session();
  const id = uuid(f, "program_version_id");
  const { data } = await db.from("program_versions").select("*").eq("id", id).single();
  const p = data as Program | null;
  if (!p || p.code !== "comprehensive") finish({ ok: false, code: "INVALID_PROGRAM_GRADE" }, "/programs");
  const { data: siblings } = await db.from("program_versions").select("*").eq("school_year_id", p.school_year_id).eq("code", p.code);
  const latest = latestPrograms((siblings ?? []) as Program[])[0] ?? p;
  const indicators = [...new Set([...latest.indicators, ...SHEET_COMPREHENSIVE_INDICATORS])];
  finish(
    await rpc("save_program", { y: latest.school_year_id, c: latest.code, n: latest.name_ar, e: latest.enabled, g: latest.grades, ind: indicators }, { operator: true }),
    "/programs",
    "program_saved",
  );
}
export async function createYear(f: FormData) {
  finish(
    await rpc("create_school_year", { l: text(f, "label"), s: z.iso.date().parse(text(f, "starts_on")), e: z.iso.date().parse(text(f, "ends_on")) }, { operator: true }),
    "/programs",
  );
}
export async function saveSnapshot(f: FormData) {
  const result = await rpc("create_report_snapshot", {
    y: uuid(f, "year"),
    a: optionalUuid(f, "administration"),
    w_from: text(f, "from") || null,
    w_to: text(f, "to") || null,
    p: text(f, "program"),
    sec: z.enum(["general", "azhar", "combined"]).parse(text(f, "sector")),
    g: text(f, "grade"),
    m: z.enum(["official", "pending"]).parse(text(f, "mode")),
  });
  if (!result.ok) redirect("/analytics?err=" + result.code);
  redirect("/analytics?saved=" + result.data);
}

// ---------------------------------------------------------------------------
// Users (General Supervisor). Permissions are enforced again inside PostgreSQL.
// ---------------------------------------------------------------------------
const managedRoles = z.enum(["directorate_supervisor", "program_manager", "administration_data_entry", "directorate_viewer"]);
export async function inviteUser(f: FormData) {
  const { profile } = await session();
  if (!isSupervisor(profile.role)) finish({ ok: false, code: "FORBIDDEN" }, "/users");
  const name = z.string().trim().min(2).max(120).safeParse(text(f, "full_name"));
  const email = z.email().safeParse(text(f, "email").toLowerCase());
  const role = managedRoles.safeParse(text(f, "role"));
  if (!name.success) finish({ ok: false, code: "INVALID_NAME" }, "/users");
  if (!email.success) finish({ ok: false, code: "INVALID_EMAIL" }, "/users");
  if (!role.success) finish({ ok: false, code: "INVALID_ROLE" }, "/users");
  const administration = role.data === "administration_data_entry" ? optionalUuid(f, "administration_id") : null;
  if (role.data === "administration_data_entry" && !administration) finish({ ok: false, code: "ADMINISTRATION_REQUIRED_FOR_OFFICER_ONLY" }, "/users");
  const admin = authAdmin();
  if (!admin) finish({ ok: false, code: "INVITE_NOT_CONFIGURED" }, "/users");
  const { data, error } = await admin.inviteUserByEmail(email.data, {
    data: { full_name: name.data },
    redirectTo: (await siteUrl()) + "/auth/accept",
  });
  if (error || !data.user?.id) {
    console.error("Invite failed", error?.code);
    finish({ ok: false, code: error?.code === "email_exists" || error?.status === 422 ? "EMAIL_EXISTS" : "INVITE_FAILED" }, "/users");
  }
  const result = await rpc("register_invited_user", { uid: data.user.id, name: name.data, new_role: role.data, a: administration }, { supervisor: true });
  if (!result.ok) {
    // No role could be stored: remove the just-created Auth account so nobody is left half-provisioned.
    await admin.deleteUser(data.user.id);
  }
  finish(result, "/users", "invited");
}
export async function resendInvitation(f: FormData) {
  const { db, profile } = await session();
  if (!isSupervisor(profile.role)) finish({ ok: false, code: "FORBIDDEN" }, "/users");
  const id = uuid(f, "user_id");
  const { data: target } = await db.from("user_profiles").select("email,full_name,status").eq("user_id", id).single();
  if (!target?.email || target.status !== "active") finish({ ok: false, code: "INVITE_FAILED" }, "/users");
  const admin = authAdmin();
  if (!admin) finish({ ok: false, code: "INVITE_NOT_CONFIGURED" }, "/users");
  const redirectTo = (await siteUrl()) + "/auth/accept";
  const { data: auth } = await admin.getUserById(id);
  // Not yet accepted → resend the invitation; already active → send a password-reset link.
  const { error } = auth.user?.last_sign_in_at || auth.user?.email_confirmed_at
    ? await authPublic().resetPasswordForEmail(target.email, { redirectTo })
    : await admin.inviteUserByEmail(target.email, { data: { full_name: target.full_name }, redirectTo });
  if (error) console.error("Resend failed", error.code);
  finish(error ? { ok: false, code: "INVITE_FAILED" } : { ok: true }, "/users", "resent");
}
export async function updateUserAccess(f: FormData) {
  const { profile } = await session();
  if (!isSupervisor(profile.role)) finish({ ok: false, code: "FORBIDDEN" }, "/users");
  const id = uuid(f, "user_id");
  const role = z.enum(["directorate_admin", "directorate_supervisor", "program_manager", "administration_data_entry", "directorate_viewer"]).safeParse(text(f, "role"));
  const status = z.enum(["active", "disabled"]).safeParse(text(f, "status"));
  if (!role.success || !status.success) finish({ ok: false, code: "INVALID_ROLE" }, "/users");
  const administration = role.data === "administration_data_entry" ? optionalUuid(f, "administration_id") : null;
  const result = await rpc("update_user_access", { uid: id, new_role: role.data, a: administration, new_status: status.data, name: text(f, "full_name") || null }, { supervisor: true });
  if (result.ok) {
    // Best effort: also block sign-in at the Auth level. The database status is authoritative either way.
    const admin = authAdmin();
    const { error } = (await admin?.updateUserById(id, { ban_duration: status.data === "disabled" ? "876000h" : "none" })) ?? { error: null };
    if (error) console.error("Auth ban update failed", error.code);
  }
  finish(result, "/users", "access_updated");
}

// ---------------------------------------------------------------------------
// Imports: stage → reconcile → promote to drafts (or discard)
// ---------------------------------------------------------------------------
const stagedRow = z
  .object({
    week: z.iso.date(),
    program: z.enum(["comprehensive", "vision"]),
    sector: z.enum(["general", "azhar"]),
    grade: z.enum(["kg1", "kg2", "primary1", "primary4", "preparatory1", "secondary1"]),
    indicator: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/),
    count: z.number().int().min(0).max(10000000),
  })
  .strict();
const stagePayload = z.object({
  year: z.uuid(),
  source_name: z.string().max(200),
  source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  value_mode: z.enum(["weekly", "cumulative"]),
  week_rule: z.enum(["window", "previous", "same"]),
  sheet: z.string().max(120),
  batches: z.array(z.object({ administration_id: z.uuid(), rows: z.array(stagedRow).min(1).max(5000) })).min(1).max(13),
});
export async function stageImportBatches(json: string): Promise<{ ok: boolean; code?: string; staged?: number }> {
  const { profile } = await session();
  const parsed = stagePayload.safeParse(JSON.parse(json));
  if (!parsed.success) return { ok: false, code: "INVALID_IMPORT_CATALOG" };
  const p = parsed.data;
  let staged = 0;
  for (const b of p.batches) {
    if (profile.role === "administration_data_entry" && profile.administration_id !== b.administration_id) return { ok: false, code: "FORBIDDEN", staged };
    const result = await rpc("stage_import_batch", {
      a: b.administration_id,
      y: p.year,
      data: b.rows,
      meta: { source_name: p.source_name, source_sha256: p.source_sha256, value_mode: p.value_mode, week_rule: p.week_rule, sheet: p.sheet },
    });
    if (!result.ok) return { ok: false, code: result.code, staged };
    staged++;
  }
  return { ok: true, staged };
}
export async function promoteImport(f: FormData) {
  const id = uuid(f, "batch_id");
  const result = await rpc("promote_import_batch", { b: id });
  if (!result.ok) finish(result, "/imports/" + id);
  const failed = (result.data as { status: string }[]).some((r) => r.status === "error");
  redirect(`/imports/${id}?msg=${failed ? "partial" : "promoted"}`);
}
export async function discardImport(f: FormData) {
  const id = uuid(f, "batch_id");
  finish(await rpc("discard_import_batch", { b: id, reason: text(f, "reason") }), "/imports/" + id, "discarded");
}
