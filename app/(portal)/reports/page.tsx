import Link from "next/link";
import { dataset, session } from "@/lib/data";
import { labels } from "@/lib/domain";
export default async function Reports() {
  const d = await dataset();
  const { profile } = await session();
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
      <div className="notice">
        الأسبوع من الأحد إلى السبت بتوقيت القاهرة. الإغلاق في الأحد التالي
        الساعة 16:00. إعادة الفتح تتطلب سببًا وتُسجل في التدقيق.
      </div>
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
            {d.submissions
              .sort((a, b) => b.week_start.localeCompare(a.week_start))
              .map((s) => {
                const r = d.revisions
                  .filter((r) => r.submission_id === s.id)
                  .sort((a, b) => b.revision_number - a.revision_number);
                return (
                  <tr key={s.id}>
                    <td>
                      {
                        d.administrations.find(
                          (a) => a.id === s.administration_id,
                        )?.name_ar
                      }
                    </td>
                    <td>{s.week_start}</td>
                    <td>
                      {d.years.find((y) => y.id === s.school_year_id)?.label}
                    </td>
                    <td>{r.length}</td>
                    <td>
                      <span className="badge">
                        {labels[r[0]?.status] || "—"}
                      </span>
                    </td>
                    <td>{s.official_revision_id ? "معتمدة" : "لم تعتمد"}</td>
                    <td>
                      {r[0] && (
                        <Link href={"/reports/" + r[0].id}>فتح البلاغ ←</Link>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        {!d.submissions.length && (
          <p className="empty">
            لا توجد بلاغات حتى الآن. لن تظهر أرقام فعلية قبل إدخالها واعتمادها.
          </p>
        )}
      </section>
    </>
  );
}
