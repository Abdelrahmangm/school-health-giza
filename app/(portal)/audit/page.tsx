import Link from "next/link";
import { session } from "@/lib/data";
import { isOperator } from "@/lib/domain";

type Audit = { id: number; actor_id: string | null; action: string; entity_type: string; entity_id: string | null; details: unknown; at: string };
const actions: Record<string, string> = {
  draft_saved: "حفظ مسودة بلاغ",
  submit: "إرسال بلاغ للمراجعة",
  approve: "اعتماد بلاغ",
  return: "إعادة بلاغ للتصحيح",
  reopened: "إعادة فتح بلاغ",
  target_proposed: "اقتراح مستهدف",
  target_approved: "اعتماد مستهدف",
  target_rejected: "رفض مستهدف",
  program_version_created: "إصدار برنامج جديد",
  year_created: "إضافة عام دراسي",
  role_assigned: "تحديد صلاحية",
  user_invited: "دعوة مستخدم",
  user_access_updated: "تعديل صلاحية أو حالة حساب",
  import_staged: "تجهيز ملف استيراد",
  import_promoted: "تحويل استيراد لمسودات",
  import_discarded: "إلغاء دفعة استيراد",
  snapshot_created: "حفظ لقطة تقرير",
};
const PAGE = 100;
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { profile, db } = await session();
  if (!isOperator(profile.role)) return <h1>غير مصرح ليك بفتح الصفحة دي</h1>;
  const page = Math.max(1, Number((await searchParams).page) || 1);
  // Newest first, one page at a time (indexed on time) instead of loading the whole log.
  const [{ data, count }, people] = await Promise.all([
    db.from("audit_log").select("id,actor_id,action,entity_type,entity_id,details,at", { count: "exact" }).order("at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1),
    db.from("user_profiles").select("user_id,full_name,email"),
  ]);
  const rows = (data ?? []) as Audit[];
  const names = new Map((people.data ?? []).map((p) => [p.user_id, p.full_name || p.email || p.user_id]));
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  return (
    <>
      <h1>سجل التدقيق</h1>
      <p className="muted">كل عملية مهمة بتتسجل هنا من قاعدة البيانات نفسها، ومحدش يقدر يعدّلها أو يمسحها من الواجهة.</p>
      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>التوقيت (القاهرة)</th>
              <th>الإجراء</th>
              <th>بواسطة</th>
              <th>العنصر</th>
              <th>التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}</td>
                <td>{actions[r.action] ?? r.action}</td>
                <td>{r.actor_id ? names.get(r.actor_id) ?? r.actor_id : "النظام"}</td>
                <td>
                  {r.entity_type}
                  <br />
                  <small dir="ltr">{r.entity_id}</small>
                </td>
                <td>
                  <details>
                    <summary>عرض</summary>
                    <pre dir="ltr">{JSON.stringify(r.details, null, 2).slice(0, 4000)}</pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="empty">مفيش عمليات متسجلة.</p>}
        {pages > 1 && (
          <nav className="pager" aria-label="صفحات السجل">
            {page > 1 && <Link href={"/audit?page=" + (page - 1)}>→ الأحدث</Link>}
            <span>
              صفحة {page.toLocaleString("ar-EG")} من {pages.toLocaleString("ar-EG")}
            </span>
            {page < pages && <Link href={"/audit?page=" + (page + 1)}>الأقدم ←</Link>}
          </nav>
        )}
      </section>
    </>
  );
}
