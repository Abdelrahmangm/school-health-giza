import Link from "next/link";
import { session } from "@/lib/data";
import { labels } from "@/lib/domain";
import { logout } from "@/app/actions";
export const dynamic = "force-dynamic";
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await session();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <div className="brand-mark" aria-hidden="true">
            ✚
          </div>
          <h2>الفحص الصحي المدرسي</h2>
          <small>مديرية الشؤون الصحية بالجيزة</small>
        </div>
        <nav aria-label="التنقل الرئيسي">
          <Link href="/">نظرة عامة</Link>
          <Link href="/reports">البلاغات الأسبوعية</Link>
          <Link href="/targets">المستهدفات السنوية</Link>
          <Link href="/analytics">التحليلات والتقارير</Link>
          <Link href="/programs">البرامج والأعوام</Link>
          {profile.role !== "directorate_viewer" && (
            <Link href="/imports">استيراد البيانات</Link>
          )}
          {profile.role === "directorate_admin" && (
            <>
              <Link href="/users">المستخدمون والصلاحيات</Link>
              <Link href="/audit">سجل التدقيق</Link>
            </>
          )}
        </nav>
        <footer>
          بيئة قيد المراجعة الأمنية
          <br />
          بيانات مجمعة فقط · دون أسماء طلاب
          <br />
          لا توجد مزامنة مع Google Sheets
        </footer>
      </aside>
      <div>
        <header className="topbar">
          <span>الإدارة المركزية للصحة المدرسية / الجيزة</span>
          <span>{labels[profile.role]}</span>
          <form action={logout}>
            <button className="secondary">خروج</button>
          </form>
        </header>
        <main className="content">
          {process.env.NEXT_PUBLIC_DEMO_MODE === "true" && (
            <div className="notice">
              DEMO — بيانات اختبار اصطناعية فقط، ليست أرقامًا فعلية.
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
