import { session } from "@/lib/data";
import { labels } from "@/lib/domain";
import { logout } from "@/app/actions";
import { PortalNav,UiIcon } from "@/components/portal-nav";
export const dynamic="force-dynamic";
export default async function PortalLayout({children}:{children:React.ReactNode}){
 const {profile}=await session();
 return <div className="shell redesigned-shell">
   <aside className="sidebar redesigned-sidebar">
     <div className="redesigned-brand">
       <div className="redesigned-brand-img"><img src="/school-health-logo.png" alt="شعار إدارة الصحة المدرسية والشباب بالجيزة" width="100" height="100"/></div>
       <h2>إدارة الصحة المدرسية والشباب</h2>
       <small>مديرية الشؤون الصحية بالجيزة</small>
     </div>
     <div className="redesigned-menu-heading">القائمة الرئيسية</div>
     <PortalNav role={profile.role}/>
     <footer>البلاغات الأسبوعية والمستهدفات<br/>بيانات مجمعة فقط · مراجعة أمنية قبل الاستخدام الرسمي</footer>
   </aside>
   <div className="redesigned-workspace">
     <header className="topbar redesigned-topbar">
       <div className="redesigned-top-title"><strong>منصة الفحص الصحي المدرسي</strong><span>مديرية الشؤون الصحية بالجيزة</span></div>
       <div className="redesigned-user-tools">
         <span className="redesigned-role">{labels[profile.role]}</span>
         <span className="redesigned-user-icon" aria-hidden="true"><UiIcon name="users"/></span>
         <form action={logout}><button className="secondary" type="submit">تسجيل الخروج</button></form>
       </div>
     </header>
     <main className="content redesigned-content">
       {process.env.NEXT_PUBLIC_DEMO_MODE==="true"&&<div className="notice">DEMO — بيانات اختبار اصطناعية فقط وليست أرقامًا رسمية.</div>}
       {children}
     </main>
   </div>
 </div>;
}
