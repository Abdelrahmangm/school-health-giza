import { all, session } from "@/lib/data";
import { authorize, type Administration } from "@/lib/domain";
import { ImportForm } from "@/components/import-form";
export default async function Imports({
  searchParams,
}: {
  searchParams: Promise<{ staged?: string }>;
}) {
  const { profile } = await session();
  authorize(profile, true);
  const admins = await all<Administration>("administrations");
  const p = await searchParams;
  const batches = await all<{
    id: string;
    created_at: string;
    rows: unknown[];
  }>("import_batches");
  return (
    <>
      <h1>تجهيز البيانات السابقة</h1>
      <p className="notice">
        الحفظ هنا لا ينشئ بلاغات ولا يغير الأرقام الرسمية، ولا يكتب في Google
        Sheets. نقل بيانات التجهيز إلى البلاغات يتطلب مسار مراجعة لاحقًا.
      </p>
      {p.staged && (
        <p className="notice" role="status">
          حُفظت البيانات المجمعة في منطقة التجهيز.
        </p>
      )}
      <ImportForm administrations={admins} />
      <section className="card">
        <h2>دفعات التجهيز المحفوظة</h2>
        {batches.map((b) => (
          <p key={b.id}>
            {b.id} · {b.rows.length} صف ·{" "}
            {new Date(b.created_at).toLocaleString("ar-EG", {
              timeZone: "Africa/Cairo",
            })}
          </p>
        ))}
        {!batches.length && <p className="empty">لا توجد دفعات.</p>}
      </section>
    </>
  );
}
