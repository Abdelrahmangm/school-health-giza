import Link from "next/link";
import { notFound } from "next/navigation";
import { reference, session } from "@/lib/data";
import { labels } from "@/lib/domain";
import { promoteImport, discardImport } from "@/app/actions";
import { Flash } from "@/components/flash";

type Row = { week: string; program: string; sector: string; grade: string; indicator: string; count: number };
const statusLabels: Record<string, string> = { staged: "في منطقة التجهيز", partial: "اتحوّل جزء منها", promoted: "اتحوّلت لمسودات", discarded: "اتلغت" };
const resultLabels: Record<string, string> = {
  draft_created: "اتعملت مسودة جديدة",
  draft_updated: "اتحدّثت المسودة الموجودة",
  target_proposed: "اتقدّم اقتراح مستهدف",
  target_unchanged: "المستهدف زي ما هو",
  error: "محتاج مراجعة",
};

/** Reconciliation: compares every staged number with the current official and draft numbers. */
export default async function ImportBatch({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, query, { db, profile }, ref] = await Promise.all([params, searchParams, session(), reference()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: batch } = await db.from("import_batches").select("*").eq("id", id).maybeSingle();
  if (!batch) notFound();
  const rows = batch.rows as Row[];
  const weeks = [...new Set(rows.filter((r) => r.indicator !== "target").map((r) => r.week))].sort();
  const [{ data: subs }, { data: same }, { data: targets }] = await Promise.all([
    db
      .from("weekly_submissions")
      .select("id,week_start,official_revision_id,submission_revisions!submission_revisions_submission_id_fkey(id,status,revision_number)")
      .eq("administration_id", batch.administration_id)
      .eq("school_year_id", batch.school_year_id ?? "00000000-0000-0000-0000-000000000000")
      .in("week_start", weeks.length ? weeks : ["1900-01-07"]),
    batch.source_sha256
      ? db.from("import_batches").select("id,created_at,status").eq("source_sha256", batch.source_sha256).eq("administration_id", batch.administration_id).neq("id", id)
      : Promise.resolve({ data: [] }),
    db.from("target_versions").select("program_code,sector,grade_code,target_count,status").eq("administration_id", batch.administration_id).eq("school_year_id", batch.school_year_id ?? "").in("status", ["approved", "proposed"]),
  ]);
  type Sub = { id: string; week_start: string; official_revision_id: string | null; submission_revisions: { id: string; status: string; revision_number: number }[] };
  const submissions = (subs ?? []) as Sub[];
  const revisionIds = submissions.flatMap((s) => [s.official_revision_id, s.submission_revisions.find((r) => ["draft", "needs_correction", "provisional"].includes(r.status))?.id]).filter(Boolean) as string[];
  const { data: lines } = revisionIds.length
    ? await db.from("report_lines").select("revision_id,program_code,sector,grade_code,screened,findings").in("revision_id", revisionIds)
    : { data: [] };
  const valueOf = (revisionId: string | null | undefined, r: Row) => {
    const l = (lines ?? []).find((x) => x.revision_id === revisionId && x.program_code === r.program && x.sector === r.sector && x.grade_code === r.grade);
    if (!l) return undefined;
    return r.indicator === "screened" ? l.screened : (l.findings as Record<string, number>)[r.indicator] ?? 0;
  };
  const table = rows
    .filter((r) => r.indicator !== "target")
    .map((r) => {
      const s = submissions.find((x) => x.week_start === r.week);
      const active = s?.submission_revisions.find((x) => ["draft", "needs_correction", "provisional"].includes(x.status));
      return { r, official: valueOf(s?.official_revision_id, r), active: valueOf(active?.id, r), activeStatus: active?.status };
    })
    .sort((a, b) => a.r.week.localeCompare(b.r.week) || a.r.sector.localeCompare(b.r.sector) || a.r.grade.localeCompare(b.r.grade) || (a.r.indicator === "screened" ? -1 : 1));
  const changed = table.filter((t) => t.official !== undefined && t.official !== t.r.count).length;
  const fresh = table.filter((t) => t.official === undefined).length;
  const pendingReview = submissions.filter((s) => s.submission_revisions.some((r) => r.status === "provisional")).map((s) => s.week_start);
  const targetRows = rows.filter((r) => r.indicator === "target");
  const canAct = ["staged", "partial"].includes(batch.status) && profile.role !== "directorate_viewer";
  const results = (batch.result ?? []) as { week?: string; target?: string; status: string; message?: string; revision_id?: string }[];
  return (
    <>
      <p>
        <Link href="/imports">→ كل الدفعات</Link>
      </p>
      <h1>
        مراجعة دفعة استيراد · {ref.administrations.find((a) => a.id === batch.administration_id)?.name_ar}
      </h1>
      <Flash params={query} />
      <section className="card">
        <div className="metrics">
          <div className="metric">
            <span>الحالة</span>
            <strong>{statusLabels[batch.status] ?? batch.status}</strong>
          </div>
          <div className="metric">
            <span>أرقام جديدة (مفيش رسمي قبلها)</span>
            <strong>{fresh.toLocaleString("ar-EG")}</strong>
          </div>
          <div className="metric">
            <span>أرقام مختلفة عن الرسمي</span>
            <strong>{changed.toLocaleString("ar-EG")}</strong>
          </div>
          <div className="metric">
            <span>مستهدفات في الملف</span>
            <strong>{targetRows.length.toLocaleString("ar-EG")}</strong>
          </div>
        </div>
        <p className="muted">
          الملف: {batch.source_name || "—"} · العام: {ref.years.find((y) => y.id === batch.school_year_id)?.label ?? "—"} · اتحفظ{" "}
          {new Date(batch.created_at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}
        </p>
        {(same ?? []).length > 0 && (
          <p className="flash flash-warning">
            نفس الملف بالظبط اترفع قبل كده لنفس الإدارة ({(same ?? []).length.toLocaleString("ar-EG")} مرة). اتأكد إنك مش بتكرر الاستيراد.
          </p>
        )}
        {pendingReview.length > 0 && canAct && (
          <p className="flash flash-warning">
            الأسابيع دي فيها بلاغ مبعوت ومستني المراجعة، ومش هتتحوّل لحد ما يتراجع: {pendingReview.join("، ")}.
          </p>
        )}
      </section>
      {results.length > 0 && (
        <section className="card table-wrap">
          <h2>نتيجة التحويل</h2>
          <table>
            <tbody>
              {results.map((x, i) => (
                <tr key={i} className={x.status === "error" ? "row-invalid" : undefined}>
                  <td>{x.week ? "أسبوع " + x.week : "مستهدف " + (x.target ?? "")}</td>
                  <td>{resultLabels[x.status] ?? x.status}</td>
                  <td>
                    {x.revision_id && <Link href={"/reports/" + x.revision_id}>فتح المسودة ←</Link>}
                    {x.message && <small>{x.message.includes("REPORT_LOCKED") ? "الأسبوع مقفول؛ اطلب إعادة فتحه من المديرية." : x.message.includes("PENDING_REVIEW") ? "فيه بلاغ مستني المراجعة." : x.message}</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <section className="card table-wrap">
        <h2>المقارنة بالأرقام الحالية</h2>
        <table>
          <thead>
            <tr>
              <th>الأسبوع</th>
              <th>القطاع</th>
              <th>الصف</th>
              <th>البند</th>
              <th>في الملف</th>
              <th>الرسمي الحالي</th>
              <th>مسودة/مراجعة حالية</th>
              <th>النتيجة</th>
            </tr>
          </thead>
          <tbody>
            {table.map(({ r, official, active, activeStatus }, i) => (
              <tr key={i} className={official !== undefined && official !== r.count ? "row-changed" : undefined}>
                <td>{r.week}</td>
                <td>{labels[r.sector]}</td>
                <td>{labels[r.grade]}</td>
                <td>{r.indicator === "screened" ? "المفحوصون" : labels[r.indicator] ?? r.indicator}</td>
                <td>{r.count.toLocaleString("ar-EG")}</td>
                <td>{official === undefined ? "—" : official.toLocaleString("ar-EG")}</td>
                <td>{active === undefined ? "—" : `${active.toLocaleString("ar-EG")} (${labels[activeStatus ?? ""] ?? ""})`}</td>
                <td>{official === undefined ? "جديد" : official === r.count ? "مطابق" : `مختلف (${r.count - official > 0 ? "+" : ""}${(r.count - official).toLocaleString("ar-EG")})`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {targetRows.length > 0 && (
          <>
            <h3>المستهدفات السنوية في الملف (بتتقدّم كاقتراح بس)</h3>
            <ul>
              {targetRows.map((t, i) => {
                const approved = (targets ?? []).find((x) => x.program_code === t.program && x.sector === t.sector && x.grade_code === t.grade && x.status === "approved");
                return (
                  <li key={i}>
                    {labels[t.sector]} · {labels[t.grade]}: {t.count.toLocaleString("ar-EG")}
                    {approved ? ` (المعتمد حاليًا ${approved.target_count.toLocaleString("ar-EG")})` : " (مفيش مستهدف معتمد)"}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
      {canAct && (
        <section className="card">
          <h2>القرار</h2>
          <div className="two">
            <form action={promoteImport} className="stack">
              <input type="hidden" name="batch_id" value={batch.id} />
              <p className="muted">
                هيتعمل مسودة بلاغ لكل أسبوع (أو تتحدّث المسودة الموجودة)، والصفوف اللي مش في الملف بتفضل زي ما هي. الأرقام الرسمية مش هتتغير غير بعد الإرسال
                والاعتماد.
              </p>
              <button>تحويل لمسودات بلاغات</button>
            </form>
            <form action={discardImport} className="stack">
              <input type="hidden" name="batch_id" value={batch.id} />
              <label>
                سبب الإلغاء
                <input name="reason" required maxLength={500} />
              </label>
              <button className="secondary">إلغاء الدفعة</button>
            </form>
          </div>
        </section>
      )}
    </>
  );
}
