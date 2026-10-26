import Link from "next/link";
import { dataset, filters } from "@/lib/data";
import { aggregate, labels } from "@/lib/domain";
import { FilterForm } from "@/components/filters";
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const d = await dataset();
  const p = await searchParams;
  const f = filters(p, d.years);
  const m = aggregate(d.submissions, d.revisions, d.lines, d.targets, f);
  const fmt = (n: number) =>
    n.toLocaleString("ar-EG", { maximumFractionDigits: 1 });
  const expected = d.administrations.filter(
    (a) => !f.administration || a.id === f.administration,
  );
  const submitted = new Set(
    d.submissions
      .filter(
        (s) =>
          s.school_year_id === f.year &&
          (!f.from || s.week_start >= f.from) &&
          (!f.to || s.week_start <= f.to) &&
          d.revisions.some(
            (r) =>
              r.submission_id === s.id &&
              ["provisional", "approved", "superseded"].includes(r.status),
          ),
      )
      .map((s) => s.administration_id),
  );
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">
            متابعة الصحة المدرسية ·{" "}
            {d.years.find((y) => y.id === f.year)?.label}
          </p>
          <h1>نظرة عامة على الفحص المدرسي</h1>
          <p>بلاغات أسبوعية موحدة، واعتماد يحفظ كل نسخة.</p>
        </div>
        <Link href="/reports" className="button">
          متابعة البلاغات ←
        </Link>
      </div>
      <div className="notice">
        {f.mode === "official"
          ? "تعرض الأرقام المعتمدة فقط. أي تعديل مقترح لا يغير النسخة الرسمية حتى اعتماده."
          : "هذه أرقام أولية غير رسمية، للنسخ المنتظرة للاعتماد فقط."}{" "}
        نتائج الأمراض قد تتداخل، ولا تمثل مجموع أطفال مختلفين.
      </div>
      <FilterForm {...d} value={f} />
      <section className="metrics" aria-label="المؤشرات">
        <div className="metric">
          <span>المفحوصون خلال الفترة</span>
          <strong>{fmt(m.screened)}</strong>
          <small>
            {labels[f.program]} · {labels[f.sector]}
          </small>
        </div>
        <div className="metric">
          <span>المستهدف السنوي النافذ</span>
          <strong>{fmt(m.target)}</strong>
          <small>لا يشمل مقترحات غير معتمدة</small>
        </div>
        <div className="metric">
          <span>نسبة الإنجاز خلال الفترة</span>
          <strong>
            {m.achievement === null ? "—" : fmt(m.achievement) + "٪"}
          </strong>
          <small>المفحوصون ÷ المستهدف السنوي</small>
        </div>
        <div className="metric">
          <span>البلاغات المحتسبة</span>
          <strong>{fmt(m.reportCount)}</strong>
          <small>نسخة واحدة لكل إدارة وأسبوع</small>
        </div>
      </section>
      <div className="two">
        <section className="card">
          <h2>نتائج المؤشرات</h2>
          <p className="muted">
            النسبة = عدد نتائج المؤشر ÷ المفحوصين في الترشيح نفسه.
          </p>
          {Object.keys(m.findings).length ? (
            <table>
              <thead>
                <tr>
                  <th>المؤشر</th>
                  <th>العدد</th>
                  <th>النسبة</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(m.findings).map(([k, v]) => (
                  <tr key={k}>
                    <td>{labels[k] || k}</td>
                    <td>{fmt(v)}</td>
                    <td>
                      {m.rates[k] === null ? "—" : fmt(m.rates[k]!) + "٪"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty">لا توجد نتائج ضمن هذا الترشيح.</p>
          )}
        </section>
        <section className="card">
          <h2>متابعة مشاركة الإدارات</h2>
          <p className="muted">
            إدارات أرسلت بلاغًا واحدًا على الأقل خلال الفترة المحددة، بصرف النظر
            عن القطاع.
          </p>
          {expected.map((a) => (
            <p key={a.id}>
              <span className="badge">
                {submitted.has(a.id) ? "أرسلت" : "لم ترسل"}
              </span>{" "}
              {a.name_ar}
            </p>
          ))}
        </section>
      </div>
    </>
  );
}
