import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { all, dataset, filters, session } from "@/lib/data";
import { aggregate, labels, isSupervisor, type Profile, type Administration } from "@/lib/domain";

/** Safe read-only preview: never changes the session, JWT, permissions, or RLS. */
export default async function RolePreview({searchParams}:{searchParams:Promise<{user?:string}>}){
 const {profile}=await session();
 if (!isSupervisor(profile.role)) notFound();
 const params=await searchParams;
 const parsed=z.uuid().safeParse(params.user);
 if (!parsed.success) notFound();
 const [profiles, administrations, d]=await Promise.all([
  all<Profile>("user_profiles"),
  all<Administration>("administrations"),
  dataset(),
 ]);
 const target=profiles.find(p=>p.user_id===parsed.data);
 if (!target) notFound();
 const admin=administrations.find(a=>a.id===target.administration_id);
 const f=filters({},d.years);
 const scoped={...f,administration:target.role==="administration_data_entry"?(target.administration_id||""):f.administration};
 const m=aggregate(d.submissions,d.revisions,d.lines,d.targets,scoped);
 const fmt=(n:number)=>n.toLocaleString("ar-EG");
 return <div>
  <p><Link href="/users">الرجوع إلى المستخدمين والصلاحيات</Link></p>
  <h1>معاينة نطاق صلاحيات المستخدم</h1>
  <p className="notice">دي معاينة للقراءة فقط من حساب المشرف العام. مش تسجيل دخول مكان الشخص التاني، ومفيش أي تعديل على هويته أو صلاحياته. المعاينة بتوضح البيانات والعمليات المسموح بيها وفق الدور والإدارة المرتبطة بالحساب.</p>
  <section className="card">
   <h2>بيانات الدور الحالي</h2>
   <div className="grid">
    <div><small>رقم الحساب</small><p dir="ltr">{target.user_id}</p></div>
    <div><small>الدور</small><p><strong>{labels[target.role]}</strong></p></div>
    <div><small>البيانات المتاحة</small><p>{admin?admin.name_ar+" فقط":"بيانات كل الإدارات الصحية"}</p></div>
    <div><small>التعديل</small><p>{target.role==="directorate_viewer"?"غير مسموح":target.role==="administration_data_entry"?"داخل الإدارة وخلال فترة البلاغ فقط":"تشغيل على مستوى المديرية"}</p></div>
   </div>
  </section>
  <section className="card">
   <h2>مثال فعلي للأرقام المتاحة ضمن نطاق المستخدم</h2>
   <div className="metrics">
    <div className="metric"><span>البلاغات المعتمدة</span><strong>{fmt(m.reportCount)}</strong></div>
    <div className="metric"><span>المفحوصون</span><strong>{fmt(m.screened)}</strong></div>
    <div className="metric"><span>المستهدف السنوي</span><strong>{fmt(m.target)}</strong></div>
   </div>
   <p className="field-help">دي معاينة للنطاق والمعلومات، وليست نسخة كاملة من كل شاشة في حساب المستخدم. لازم نختبر كل دور بحساب اختبار منفصل قبل الاستخدام الفعلي.</p>
  </section>
 </div>;
}
