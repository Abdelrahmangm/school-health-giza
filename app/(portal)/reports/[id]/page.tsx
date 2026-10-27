import Link from "next/link";
import { notFound } from "next/navigation";
import { reference, reportDetail, session } from "@/lib/data";
import { labels, deadline, canEdit, isOperator, latestPrograms } from "@/lib/domain";
import { ReportForm } from "@/components/report-form";
import { Flash } from "@/components/flash";
import { transitionReport, reopenReport } from "@/app/actions";
export default async function Report({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // Only this report: one revision, its submission/history and its lines (not the whole database).
  const [detail, ref, { profile }] = await Promise.all([reportDetail(id), reference(), session()]);
  if (!detail) notFound();
  const { revision: r, submission: s, lines } = detail;
  const editor = canEdit(
    profile.role,
    s.week_start,
    new Date().toISOString(),
    s.reopened_until,
  );
  const editable = editor && ["draft", "needs_correction"].includes(r.status);
  const history = [...s.submission_revisions].sort((a, b) => b.revision_number - a.revision_number);
  const administrationName = ref.administrations.find((a) => a.id === s.administration_id)?.name_ar;
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">
            {administrationName}{" "}
            · أسبوع {s.week_start}
          </p>
          <h1>البلاغ الأسبوعي · النسخة {r.revision_number}</h1>
          <span className="badge">{labels[r.status]}</span>
        </div>
        <Link href="/reports">كل البلاغات ←</Link>
      </div>
      <Flash params={query} />
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
          administrations={ref.administrations.filter((a) => a.id === s.administration_id)}
          years={ref.years.filter((y) => y.id === s.school_year_id)}
          programs={latestPrograms(ref.programs).filter((p) => p.enabled && p.school_year_id === s.school_year_id)}
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
          {isOperator(profile.role) &&
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
        {isOperator(profile.role) && (
          <form action={reopenReport} className="grid subsection">
            <input type="hidden" name="submission_id" value={s.id} />
            <input type="hidden" name="return_to" value={"/reports/" + r.id} />
            <label>
              إعادة الفتح لحد (بتوقيت القاهرة)
              <input name="until_local" type="datetime-local" required />
            </label>
            <label>
              سبب إعادة الفتح
              <input name="reason" required maxLength={2000} />
            </label>
            <button className="secondary">إعادة فتح البلاغ — 7 أيام بحد أقصى</button>
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
