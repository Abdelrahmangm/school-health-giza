import { filters, reference, session, targetsFor } from "@/lib/data";
import { labels, latestPrograms, isOperator } from "@/lib/domain";
import { proposeTarget, reviewTarget } from "@/app/actions";
import { Flash } from "@/components/flash";
export default async function Targets({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [ref, { profile }, params] = await Promise.all([reference(), session(), searchParams]);
  const f = filters(params, ref.years);
  const d = { ...ref, targets: await targetsFor(f.year) };
  const programs = latestPrograms(d.programs).filter((p) => p.enabled && p.school_year_id === f.year);
  return (
    <>
      <h1>المستهدفات السنوية</h1>
      <p className="muted">
        اقتراحات منفصلة لكل عام وإدارة وبرنامج وقطاع وصف. الاعتماد يحفظ النسخة
        السابقة وتاريخ النفاذ.
      </p>
      <Flash params={params} />
      <form className="card filters compact-filters" method="get">
        <label>
          العام الدراسي
          <select name="year" defaultValue={f.year}>
            {d.years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
              </option>
            ))}
          </select>
        </label>
        <button>عرض</button>
      </form>
      <div className="notice">
        المستهدف السنوي لا يُجمع عند جمع أسابيع الفحص. المقترحات لا تدخل في
        المؤشرات الرسمية.
      </div>
      {profile.role !== "directorate_viewer" && (
        <section className="card">
          <h2>اقتراح مستهدف</h2>
          <form action={proposeTarget} className="grid">
            <label>
              الإدارة
              <select
                name="administration_id"
                required
                defaultValue={profile.administration_id || undefined}
              >
                {d.administrations.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name_ar}
                  </option>
                ))}
              </select>
            </label>
            <label>
              العام والبرنامج
              <select
                name="program_version_id"
                aria-label="العام والبرنامج"
                required
              >
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {d.years.find((y) => y.id === p.school_year_id)?.label} ·{" "}
                    {p.name_ar}
                  </option>
                ))}
              </select>
            </label>
            <label>
              القطاع
              <select name="sector">
                <option value="general">عام</option>
                <option value="azhar">أزهري</option>
              </select>
            </label>
            <label>
              الصف
              <select name="grade_code" aria-label="الصف">
                {[...new Set(programs.flatMap((p) => p.grades))].map((g) => (
                  <option key={g} value={g}>
                    {labels[g] || g}
                  </option>
                ))}
              </select>
            </label>
            <label>
              المستهدف السنوي
              <input
                name="target_count"
                type="number"
                min={0}
                max={10000000}
                step={1}
                required
              />
            </label>
            <button>إرسال مقترح</button>
          </form>
          <small>تتحقق قاعدة البيانات من انتماء الصف للبرنامج المختار.</small>
        </section>
      )}
      <section className="card table-wrap">
        <h2>النسخ والمراجعات</h2>
        <table>
          <thead>
            <tr>
              <th>الإدارة / العام</th>
              <th>البرنامج / الصف</th>
              <th>القطاع</th>
              <th>المستهدف</th>
              <th>النسخة / الحالة</th>
              <th>النفاذ</th>
              <th>المراجعة</th>
            </tr>
          </thead>
          <tbody>
            {d.targets.map((t) => (
              <tr key={t.id}>
                <td>
                  {
                    d.administrations.find((a) => a.id === t.administration_id)
                      ?.name_ar
                  }
                  <br />
                  {d.years.find((y) => y.id === t.school_year_id)?.label}
                </td>
                <td>
                  {labels[t.program_code] || t.program_code}
                  <br />
                  {labels[t.grade_code] || t.grade_code}
                </td>
                <td>{labels[t.sector]}</td>
                <td>{t.target_count}</td>
                <td>
                  {t.version} · {labels[t.status]}
                </td>
                <td>
                  {t.effective_at
                    ? new Date(t.effective_at).toLocaleDateString("ar-EG", {
                        timeZone: "Africa/Cairo",
                      })
                    : "—"}
                </td>
                <td>
                  {isOperator(profile.role) &&
                  t.status === "proposed" ? (
                    <form action={reviewTarget}>
                      <input type="hidden" name="target_id" value={t.id} />
                      <label>
                        السبب / الملاحظة
                        <input name="comment" maxLength={2000} />
                      </label>
                      <div className="actions">
                        <button name="decision" value="approve">
                          اعتماد
                        </button>
                        <button
                          className="secondary"
                          name="decision"
                          value="reject"
                        >
                          رفض
                        </button>
                      </div>
                    </form>
                  ) : (
                    t.review_comment || "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!d.targets.length && <p className="empty">لا توجد مستهدفات بعد.</p>}
      </section>
    </>
  );
}
