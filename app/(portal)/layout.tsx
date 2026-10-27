import Link from "next/link";
import { Temporal } from "@js-temporal/polyfill";
import { session } from "@/lib/data";
import { labels } from "@/lib/domain";
import { logout } from "@/app/actions";
import { PortalNav, UiIcon } from "@/components/portal-nav";
export const dynamic = "force-dynamic";

const dm = (d: Temporal.PlainDate) => `${d.day.toLocaleString("ar-EG")}/${d.month.toLocaleString("ar-EG")}`;

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await session();
  const now = Temporal.Now.zonedDateTimeISO("Africa/Cairo");
  const today = now.toPlainDate();
  const week = today.subtract({ days: today.dayOfWeek % 7 });
  const due = week.add({ days: 7 });
  const greeting = now.hour < 12 ? "صباح الخير،" : "مساء الخير،";
  const name = profile.full_name?.trim() || labels[profile.role];
  return (
    <div className="app-frame">
      <div className="app-card">
        <header className="band">
          <div className="nav-pill">
            <Link href="/" className="brand" aria-label="الصفحة الرئيسية">
              <span className="brand-dot" aria-hidden="true" />
              <span>الصحة المدرسية</span>
              <span className="brand-dot" aria-hidden="true" />
            </Link>
            <PortalNav role={profile.role} />
            <details className="user-menu">
              <summary aria-label="حسابي">
                <UiIcon name="users" size={18} />
              </summary>
              <div className="user-menu-panel">
                <strong>{name}</strong>
                <small>{labels[profile.role]}</small>
                <Link href="/auth/set-password">
                  <UiIcon name="key" size={16} /> تغيير كلمة المرور
                </Link>
                <form action={logout}>
                  <button type="submit" className="link-button">
                    <UiIcon name="logout" size={16} /> تسجيل الخروج
                  </button>
                </form>
              </div>
            </details>
          </div>
          <div className="band-row">
            <div className="hello">
              <img src="/school-health-logo.png" alt="شعار إدارة الصحة المدرسية والشباب بالجيزة" width="52" height="52" />
              <div>
                <span>{greeting}</span>
                <strong>{name}</strong>
              </div>
            </div>
            {process.env.NEXT_PUBLIC_DEMO_MODE === "true" && <span className="demo-pill">DEMO — بيانات اختبار اصطناعية، مش أرقام رسمية</span>}
            <div className="band-stat">
              <span className="band-icon">
                <UiIcon name="calendar" size={22} />
              </span>
              <div>
                <small>الأسبوع الحالي</small>
                <strong>
                  {dm(week)} – {dm(week.add({ days: 6 }))}
                </strong>
                <small>آخر ميعاد للبلاغ: الحد {dm(due)} الساعة ٤ العصر</small>
              </div>
            </div>
          </div>
        </header>
        <main className="app-main">
          {children}
        </main>
      </div>
      <footer className="app-foot">مديرية الشؤون الصحية بالجيزة · إدارة الصحة المدرسية والشباب · بيانات مجمّعة فقط</footer>
    </div>
  );
}
