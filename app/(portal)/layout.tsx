import { session } from "@/lib/data";
import { labels } from "@/lib/domain";
import { logout } from "@/app/actions";
import { PortalNav, UiIcon } from "@/components/portal-nav";
export const dynamic = "force-dynamic";
export default async function PortalLayout({children}:{children:React.ReactNode}){
 const {profile}=await session();
 return <div className="shell">
  <aside className="sidebar">
   <div className="brand-block">
    <div className="brand-mark" aria-label="الشعار الرسمي لإدارة الصحة المدرسية والشباب">
     <img alt="شعار إدارة الصحة المدرسية والشباب بالجيزة" src="/school-health-logo.webp" width="115" height="115"/>
    </div>
    <div><h2>إدارة الصحة المدرسية والشباب</h2><small>مديرية الشؤون الصحية بالجيزة</small></div>
   </div>
   <div><div className="nav-caption">القائمة الرئيسية</div><PortalNav role={profile.role}/></div>
   <footer>منصة البلاغات الأسبوعية · بيانات مجمعة فقط<br/>قيد المراجعة الأمنية قبل الاستخدام الرسمي</footer>
  </aside>
  <div className="main-surface">
   <header className="topbar">
    <div className="topbar-title"><strong>منصة الفحص الصحي المدرسي</strong><small>مديرية الشؤون الصحية بالجيزة · إدارة التقارير والمستهدفات</small></div>
    <div className="topbar-tools"><span className="topbar-role">{labels[profile.role]}</span><span className="topbar-avatar" aria-hidden="true"><UiIcon name="users"/></span><form action={logout}><button className="secondary" type="submit">تسجيل الخروج</button></form></div>
   </header>
   <main className="content">{process.env.NEXT_PUBLIC_DEMO_MODE==="true"&&<div className="notice">بيانات الاختبار اصطناعية وليست أرقامًا رسمية.</div>}{children}</main>
  </div>
 </div>;
}
