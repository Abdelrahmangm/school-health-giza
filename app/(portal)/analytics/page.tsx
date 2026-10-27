import { saveSnapshot } from "@/app/actions";
import { facts, filters, reference, session, targetsFor } from "@/lib/data";
import { aggregateFacts, labels, expectedWeeks } from "@/lib/domain";
import { FilterForm } from "@/components/filters";
import { Flash } from "@/components/flash";
export default async function Analytics({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [d, { profile, db }, p] = await Promise.all([reference(), session(), searchParams]);
  const f = filters(p, d.years);
  // Weekly facts are grouped in PostgreSQL; the page never downloads raw report lines.
  const [weekly, targets, snapshotResult] = await Promise.all([
    facts(f, true, true),
    targetsFor(f.year),
    db.from("report_snapshots").select("id,created_at,filters").order("created_at", { ascending: false }).limit(50),
  ]);
  const snapshots = (snapshotResult.data ?? []) as { id: string; created_at: string; filters: Record<string, string> }[];
  const comparisons = d.administrations
    .filter((a) => !f.administration || a.id === f.administration)
    .map((a) => ({
      name: a.name_ar,
      ...aggregateFacts(weekly, targets, {
        ...f,
        administration: a.id,
      }),
    }));
  const weeks = expectedWeeks(
    d.years.find((y) => y.id === f.year),
    f.from,
    f.to,
    new Date().toISOString(),
  );
  // Bucket facts by week once, so each week only scans its own rows.
  const byWeek = new Map<string, typeof weekly>();
  for (const x of weekly.facts) {
    const b = byWeek.get(x.w ?? "") ?? { facts: [], reports: [] };
    b.facts.push(x);
    byWeek.set(x.w ?? "", b);
  }
  for (const r of weekly.reports) {
    const b = byWeek.get(r.w) ?? { facts: [], reports: [] };
    b.reports.push(r);
    byWeek.set(r.w, b);
  }
  const trend = weeks.map((w) => ({
    week: w,
    ...aggregateFacts(byWeek.get(w) ?? { facts: [], reports: [] }, targets, {
      ...f,
      from: w,
      to: w,
    }),
  }));
  const max = Math.max(1, ...comparisons.map((a) => a.screened));
  const query = new URLSearchParams(
    Object.entries(f).filter(([, v]) => typeof v === "string") as [
      string,
      string,
    ][],
  );
  const expected = d.administrations.filter(
    (a) => !f.administration || a.id === f.administration,
  ).length;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>التحليلات والتقارير</h1>
          <p className="muted">
            مقارنات الإدارات، والاتجاه الأسبوعي، واكتمال الإبلاغ.
          </p>
        </div>
        <a className="button" href={"/export?" + query}>
          تنزيل CSV تحليلي
        </a>
      </div>
      <Flash params={p} />
      <FilterForm {...d} value={f} />
      {profile.role !== "directorate_viewer" && (
        <form action={saveSnapshot} className="card">
          <h2>حفظ نسخة ثابتة من التقرير</h2>
          <p className="muted">
            تحفظ الأرقام ومصادرها والمستهدفات في لحظة الإنشاء، ولا تتغير باعتماد
            تعديلات لاحقة.
          </p>
          {Object.entries(f)
            .filter(([k]) => k !== "asOf")
            .map(([k, v]) => (
              <input
                key={k}
                type="hidden"
                name={k}
                value={
                  k === "administration" && profile.administration_id
                    ? profile.administration_id
                    : v
                }
              />
            ))}
          <button>حفظ لقطة التقرير للمراجعة</button>
        </form>
      )}
      <div className="notice">
        تصدير CSV تحليلي، وليس نموذج الوزارة الرسمي. تصدير الوزارة معطّل لحين
        استلام الملف المرجعي ومراجعة الأعمدة والحسابات. المؤشرات لا تعني عدد
        أطفال مختلفين.
      </div>
      <div className="two">
        <section className="card">
          <h2>المفحوصون حسب الإدارة</h2>
          {comparisons.map((a) => (
            <div className="bar" key={a.name}>
              <span>{a.name}</span>
              <i style={{ width: Math.round((a.screened / max) * 65) + "%" }} />
              <b>{a.screened.toLocaleString("ar-EG")}</b>
            </div>
          ))}
        </section>
        <section className="card table-wrap">
          <h2>المقارنة بالمستهدف السنوي</h2>
          <table>
            <thead>
              <tr>
                <th>الإدارة</th>
                <th>المفحوصون</th>
                <th>المستهدف</th>
                <th>الإنجاز</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((a) => (
                <tr key={a.name}>
                  <td>{a.name}</td>
                  <td>{a.screened}</td>
                  <td>{a.target}</td>
                  <td>
                    {a.achievement === null
                      ? "—"
                      : a.achievement.toFixed(1) + "٪"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      <section className="card table-wrap">
        <h2>الاتجاه واكتمال الإبلاغ الأسبوعي</h2>
        <p className="muted">
          الاكتمال = عدد البلاغات{" "}
          {f.mode === "official" ? "المعتمدة" : "المنتظرة للاعتماد"} ÷ الإدارات
          المتاحة ({expected})، بغض النظر عن القطاع والبرنامج. العرض يشمل
          الأسابيع التي لها بلاغات فقط.
        </p>
        <table>
          <thead>
            <tr>
              <th>أسبوع الأحد</th>
              <th>البرنامج</th>
              <th>المفحوصون</th>
              <th>البلاغات</th>
              <th>الاكتمال</th>
            </tr>
          </thead>
          <tbody>
            {trend.map((t) => (
              <tr key={t.week}>
                <td>{t.week}</td>
                <td>{labels[f.program] || f.program}</td>
                <td>{t.screened}</td>
                <td>{t.reportCount}</td>
                <td>
                  {expected
                    ? ((t.reportCount / expected) * 100).toFixed(1) + "٪"
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!trend.length && (
          <p className="empty">لا توجد بلاغات لإنشاء الاتجاه الأسبوعي.</p>
        )}
      </section>
      <section className="card">
        <h2>التقارير المحفوظة</h2>
        {snapshots.map((s) => (
          <p key={s.id}>
            <a href={"/export?snapshot=" + s.id}>
              تنزيل لقطة{" "}
              {new Date(s.created_at).toLocaleString("ar-EG", {
                timeZone: "Africa/Cairo",
              })}
            </a>{" "}
            · {s.filters.mode === "official" ? "معتمد" : "أولي"} ·{" "}
            {labels[s.filters.program] || s.filters.program}
          </p>
        ))}
        {!snapshots.length && <p className="empty">لا توجد لقطات محفوظة.</p>}
      </section>
    </>
  );
}
