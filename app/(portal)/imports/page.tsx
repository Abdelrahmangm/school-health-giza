import Link from "next/link";
import { filters, reference, session } from "@/lib/data";
import { authorize, isOperator } from "@/lib/domain";
import { bulkImport } from "@/app/actions";
import { SelectAll } from "@/components/select-all";
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
    .select("id,administration_id,school_year_id,created_at,status,source_name,source_sha256,options")
    .order("created_at", { ascending: false })
    .limit(120);
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
      <form action={bulkImport} className="card table-wrap">
        <h2>الدفعات المحفوظة</h2>
        <p className="field-help">
          علّم على الدفعات اللي راجعتها. «تحويل لمسودات» بيعمل نفس اللي بيتعمل من صفحة كل دفعة. «إرسال واعتماد» بيبعت المسودات اللي اتعملت من الدفعات دي
          ويعتمدها، وكل خطوة بتتسجل في سجل العمليات. الأفضل تحوّل كل الدفعات (العام والأزهري) الأول، وبعدين تعتمد.
        </p>
        <div className="actions">
          <SelectAll name="batch_id" />
          <button name="op" value="promote">تحويل المحدد لمسودات</button>
          {isOperator(profile.role) && (
            <button name="op" value="approve" className="secondary">
              إرسال واعتماد بلاغات المحدد
            </button>
          )}
        </div>
        <table>
          <thead>
            <tr>
              <th>
                <span className="sr-only">تحديد</span>
              </th>
              <th>الإدارة</th>
              <th>الملف / الشيت</th>
              <th>الحالة</th>
              <th>التاريخ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td>
                  {b.status !== "discarded" && <input type="checkbox" name="batch_id" value={b.id} aria-label={"تحديد دفعة " + adminName.get(b.administration_id)} />}
                </td>
                <td>{adminName.get(b.administration_id)}</td>
                <td>
                  {b.source_name || "—"}
                  {(b.options as { sheet?: string } | null)?.sheet ? ` · ${(b.options as { sheet?: string }).sheet}` : ""}
                </td>
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
      </form>
    </>
  );
}
