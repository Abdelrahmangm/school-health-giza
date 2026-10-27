import Link from "next/link";
import { filters, reference, session } from "@/lib/data";
import { authorize } from "@/lib/domain";
import { ImportWizard } from "@/components/import-wizard";
import { Flash } from "@/components/flash";

const statusLabels: Record<string, string> = {
  staged: "في منطقة التجهيز",
  partial: "اتحوّل جزء منها",
  promoted: "اتحوّلت لمسودات",
  discarded: "اتلغت",
};
export default async function Imports({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ profile, db }, ref, params] = await Promise.all([session(), reference(), searchParams]);
  authorize(profile, true);
  const f = filters({}, ref.years);
  const { data } = await db
    .from("import_batches")
    .select("id,administration_id,school_year_id,created_at,status,source_name,source_sha256")
    .order("created_at", { ascending: false })
    .limit(60);
  const batches = data ?? [];
  const adminName = new Map(ref.administrations.map((a) => [a.id, a.name_ar]));
  return (
    <>
      <h1>استيراد بيانات الفحص والمستهدفات</h1>
      <Flash params={params} />
      <section className="card">
        <h2>الاستيراد بيمشي إزاي؟</h2>
        <ol className="steps">
          <li>
            ارفع ملف Excel أو CSV بنفس شكل شيتات البلاغ الأصلية (شيت لكل قطاع، وصف لكل إدارة) أو بالأعمدة القياسية
            <code dir="ltr"> week,program,sector,grade,indicator,count</code>.
          </li>
          <li>راجع المعاينة: مطابقة الأعمدة، أسماء الإدارات، التكرار، والأرقام اللي محتاجة تصليح.</li>
          <li>احفظ في منطقة التجهيز — كل إدارة لوحدها، والعام منفصل عن الأزهري.</li>
          <li>افتح الدفعة وقارنها بالأرقام الحالية، وبعدين حوّلها لمسودات بلاغات.</li>
          <li>المسودات بتتبعت وتتعتمد بنفس دورة البلاغ العادية؛ الاستيراد عمره ما بيعتمد رقم رسمي لوحده.</li>
        </ol>
      </section>
      <ImportWizard
        administrations={ref.administrations}
        years={ref.years}
        programs={ref.programs}
        defaultYear={f.year}
        ownAdministration={profile.role === "administration_data_entry" ? profile.administration_id ?? undefined : undefined}
      />
      <section className="card table-wrap">
        <h2>الدفعات المحفوظة</h2>
        <table>
          <thead>
            <tr>
              <th>الإدارة</th>
              <th>الملف</th>
              <th>الحالة</th>
              <th>التاريخ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td>{adminName.get(b.administration_id)}</td>
                <td>{b.source_name || "—"}</td>
                <td>
                  <span className={"badge" + (b.status === "staged" ? " yellow" : b.status === "discarded" ? " red" : "")}>{statusLabels[b.status] ?? b.status}</span>
                </td>
                <td>{new Date(b.created_at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}</td>
                <td>
                  <Link href={"/imports/" + b.id}>{b.status === "staged" || b.status === "partial" ? "مراجعة ومقارنة ←" : "التفاصيل ←"}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!batches.length && <p className="empty">لسه مفيش دفعات.</p>}
      </section>
    </>
  );
}
