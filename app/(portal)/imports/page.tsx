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
      <h1>استيراد بيانات الفحص والمستهدفات</h1>
      <section className="card">
      <h2>ترفع الداتا إزاي؟</h2>
      <p>الطريقة الموجودة حاليًا بتستقبل ملف CSV مُجمّع، وبتحفظه في <strong>منطقة تجهيز</strong> علشان تراجعه قبل ما يدخل في البلاغات الرسمية.</p>
      <ol><li>اختار الإدارة الصحية اللي البيانات تخصها.</li><li>جهّز ملف CSV بالأعمدة الستة المكتوبة تحت؛ كل سطر بيخص أسبوع وبرنامج وقطاع وصف ومؤشر وعدد.</li><li>انسخ محتوى الملف في الخانة، واضغط «معاينة والتحقق».</li><li>لو مفيش أخطاء، اضغط «حفظ في منطقة التجهيز فقط».</li></ol>
      <p className="notice">مهم: بيانات الشيتات الأصلية Excel أو Google Sheets مش بتتسحب تلقائيًا هنا، ولسه محتاجة خطوة ربط ومطابقة قبل استيرادها رسميًا. كمان الحفظ في منطقة التجهيز <strong>مش</strong> اعتماد بلاغات أو مستهدفات.</p>
      </section>
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
