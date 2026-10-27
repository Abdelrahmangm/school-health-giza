import Link from "next/link";
import { filters, reference, session, submissionPage } from "@/lib/data";
import { labels } from "@/lib/domain";
import { Flash } from "@/components/flash";

const PAGE_SIZE = 40;
export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ profile }, ref, params] = await Promise.all([session(), reference(), searchParams]);
  const f = filters(params, ref.years);
  const page = Math.max(1, Number(params.page) || 1);
  const { rows, total } = await submissionPage({ year: f.year, administration: f.administration, page, size: PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const adminName = new Map(ref.administrations.map((a) => [a.id, a.name_ar]));
  const yearLabel = new Map(ref.years.map((y) => [y.id, y.label]));
  const link = (p: number) => `/reports?year=${f.year}&administration=${f.administration}&page=${p}`;
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">دورة الإبلاغ والمراجعة</p>
          <h1>البلاغات الأسبوعية</h1>
          <p>بلاغ موحد لكل إدارة وأسبوع، مع فصل القطاع والبرنامج والصف.</p>
        </div>
        {profile.role !== "directorate_viewer" && (
          <Link className="button" href="/reports/new">
            + بلاغ جديد
          </Link>
        )}
      </div>
      <Flash params={params} />
      <div className="notice">
        الأسبوع من الأحد للسبت بتوقيت القاهرة، والبلاغ بيتقفل الأحد اللي بعده الساعة 4 العصر. إعادة الفتح لازم يكون ليها سبب وبتتسجل في سجل
        المراجعة.
      </div>
      <form className="card filters compact-filters" method="get">
        <label>
          العام الدراسي
          <select name="year" defaultValue={f.year}>
            {ref.years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
              </option>
            ))}
          </select>
        </label>
        {ref.administrations.length > 1 && (
          <label>
            الإدارة
            <select name="administration" defaultValue={f.administration}>
              <option value="">كل الإدارات</option>
              {ref.administrations.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name_ar}
                </option>
              ))}
            </select>
          </label>
        )}
        <button>عرض</button>
      </form>
      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>الإدارة</th>
              <th>الأسبوع</th>
              <th>العام</th>
              <th>النسخ</th>
              <th>الحالة الأخيرة</th>
              <th>الرسمية</th>
              <th>التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const r = [...s.submission_revisions].sort((a, b) => b.revision_number - a.revision_number);
              return (
                <tr key={s.id}>
                  <td>{adminName.get(s.administration_id)}</td>
                  <td>{s.week_start}</td>
                  <td>{yearLabel.get(s.school_year_id)}</td>
                  <td>{r.length}</td>
                  <td>
                    <span className={"badge" + (r[0]?.status === "provisional" ? " yellow" : r[0]?.status === "needs_correction" ? " red" : "")}>
                      {labels[r[0]?.status] || "—"}
                    </span>
                  </td>
                  <td>{s.official_revision_id ? "معتمدة" : "لم تعتمد"}</td>
                  <td>{r[0] && <Link href={"/reports/" + r[0].id}>فتح البلاغ ←</Link>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <p className="empty">مفيش بلاغات للاختيار ده. الأرقام بتظهر بعد إدخالها واعتمادها.</p>}
        {pages > 1 && (
          <nav className="pager" aria-label="صفحات البلاغات">
            {page > 1 && <Link href={link(page - 1)}>→ الأحدث</Link>}
            <span>
              صفحة {page.toLocaleString("ar-EG")} من {pages.toLocaleString("ar-EG")} · {total.toLocaleString("ar-EG")} بلاغ
            </span>
            {page < pages && <Link href={link(page + 1)}>الأقدم ←</Link>}
          </nav>
        )}
      </section>
    </>
  );
}
