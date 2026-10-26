import Link from "next/link";
import { notFound } from "next/navigation";
import { dataset, session } from "@/lib/data";
import { labels, deadline, canEdit } from "@/lib/domain";
import { ReportForm } from "@/components/report-form";
import { transitionReport, reopenReport } from "@/app/actions";
export default async function Report({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const d = await dataset();
  const { profile } = await session();
  const r = d.revisions.find((r) => r.id === id);
  if (!r) notFound();
  const s = d.submissions.find((s) => s.id === r.submission_id)!;
  const lines = d.lines.filter((l) => l.revision_id === id);
  const editor = canEdit(
    profile.role,
    s.week_start,
    new Date().toISOString(),
    s.reopened_until,
  );
  const editable = editor && ["draft", "needs_correction"].includes(r.status);
  const history = d.revisions
    .filter((v) => v.submission_id === s.id)
    .sort((a, b) => b.revision_number - a.revision_number);
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">
            {
              d.administrations.find((a) => a.id === s.administration_id)
                ?.name_ar
            }{" "}
            · أسبوع {s.week_start}
          </p>
          <h1>البلاغ الأسبوعي · النسخة {r.revision_number}</h1>
          <span className="badge">{labels[r.status]}</span>
        </div>
        <Link href="/reports">كل البلاغات ←</Link>
      </div>
      <p className="notice">
        موعد الإغلاق:{" "}
        {new Date(deadline(s.week_start)).toLocaleString("ar-EG", {
          timeZone: "Africa/Cairo",
        })}{" "}
        بتوقيت القاهرة.
        {s.reopened_until &&
          ` إعادة فتح حتى ${new Date(s.reopened_until).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })} — ${s.reopen_reason}`}
      </p>
      {r.review_comment && (
        <p className="notice">ملاحظات المراجعة: {r.review_comment}</p>
      )}
      {editable ? (
        <ReportForm
          {...d}
          initial={lines}
          administration={s.administration_id}
          year={s.school_year_id}
          week={s.week_start}
          revisionId={r.id}
        />
      ) : (
        <section className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>البرنامج</th>
                <th>القطاع</th>
                <th>الصف</th>
                <th>المفحوصون</th>
                <th>نتائج المؤشرات</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td>{labels[l.program_code!] || l.program_code}</td>
                  <td>{labels[l.sector]}</td>
                  <td>{labels[l.grade_code] || l.grade_code}</td>
                  <td>{l.screened}</td>
                  <td>
                    {Object.entries(l.findings).map(([k, v]) => (
                      <span key={k}>
                        {labels[k] || k}: {v} ·{" "}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <section className="card">
        <h2>إجراءات البلاغ</h2>
        <div className="actions">
          {editable && (
            <form action={transitionReport}>
              <input type="hidden" name="revision_id" value={r.id} />
              <button name="action" value="submit">
                إرسال للمراجعة
              </button>
            </form>
          )}
          {profile.role === "directorate_admin" &&
            r.status === "provisional" && (
              <form action={transitionReport}>
                <input type="hidden" name="revision_id" value={r.id} />
                <label>
                  ملاحظات المراجعة
                  <input name="comment" maxLength={2000} />
                </label>
                <button name="action" value="approve">
                  اعتماد النسخة
                </button>
                <button className="secondary" name="action" value="return">
                  إعادة للتصحيح (السبب مطلوب)
                </button>
              </form>
            )}
          {editor &&
            r.status === "approved" &&
            !history.some((v) =>
              ["draft", "provisional", "needs_correction"].includes(v.status),
            ) && (
              <Link
                className="button secondary"
                href={"/reports/new?submission=" + s.id}
              >
                اقتراح تعديل
              </Link>
            )}
          {!editor && (
            <p className="muted">
              البلاغ مغلق أمام التعديل، أو أن حسابك للقراءة فقط.
            </p>
          )}
        </div>
        {profile.role === "directorate_admin" && (
          <form action={reopenReport} className="grid subsection">
            <input type="hidden" name="submission_id" value={s.id} />
            <label>
              إعادة الفتح حتى (ISO مع المنطقة الزمنية)
              <input
                name="until_at"
                placeholder="2026-11-02T16:00:00+02:00"
                required
                dir="ltr"
              />
            </label>
            <label>
              سبب إعادة الفتح
              <input name="reason" required maxLength={2000} />
            </label>
            <button>إعادة الفتح — بحد أقصى 7 أيام</button>
          </form>
        )}
      </section>
      <section className="card">
        <h2>تاريخ النسخ</h2>
        {history.map((v) => (
          <p key={v.id}>
            <Link href={"/reports/" + v.id}>النسخة {v.revision_number}</Link> ·{" "}
            {labels[v.status]} ·{" "}
            {new Date(v.created_at).toLocaleString("ar-EG", {
              timeZone: "Africa/Cairo",
            })}
          </p>
        ))}
      </section>
    </>
  );
}
