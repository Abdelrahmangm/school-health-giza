import { session, all } from "@/lib/data";
type Audit = {
  id: number;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: unknown;
  at: string;
};
export default async function Audit() {
  const { profile } = await session();
  if (profile.role !== "directorate_admin") return <h1>غير مصرح</h1>;
  const rows = await all<Audit>("audit_log");
  return (
    <>
      <h1>سجل التدقيق</h1>
      <p className="muted">
        سجل من قاعدة البيانات، دون صلاحية تعديل أو حذف من واجهة المستخدم.
      </p>
      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>التوقيت (القاهرة)</th>
              <th>الإجراء</th>
              <th>الحساب</th>
              <th>الكيان</th>
              <th>التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {rows.reverse().map((r) => (
              <tr key={r.id}>
                <td>
                  {new Date(r.at).toLocaleString("ar-EG", {
                    timeZone: "Africa/Cairo",
                  })}
                </td>
                <td>{r.action}</td>
                <td>{r.actor_id}</td>
                <td>
                  {r.entity_type}
                  <br />
                  {r.entity_id}
                </td>
                <td>
                  <details>
                    <summary>عرض</summary>
                    <pre>{JSON.stringify(r.details, null, 2)}</pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="empty">لا توجد إجراءات مسجلة.</p>}
      </section>
    </>
  );
}
