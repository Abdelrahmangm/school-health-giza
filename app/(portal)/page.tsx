import Link from "next/link";
import type { CSSProperties } from "react";
import { dataset, filters } from "@/lib/data";
import { aggregate, labels } from "@/lib/domain";
import { FilterForm } from "@/components/filters";
import { UiIcon } from "@/components/portal-nav";
export default async function Dashboard({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const d=await dataset();
 const f=filters(await searchParams,d.years);
 const m=aggregate(d.submissions,d.revisions,d.lines,d.targets,f);
 const fmt=(n:number)=>n.toLocaleString("ar-EG",{maximumFractionDigits:1});
 const pct=(v:number|null)=>v===null?"—":fmt(v)+"٪";
 const bound=(v:number|null)=>Math.max(0,Math.min(100,v??0));
 const today=d.years.find(y=>y.id===f.year);
 const activeReports=d.submissions.filter(s=>s.school_year_id===f.year && (!f.administration||f.administration===s.administration_id) && (!f.from||s.week_start>=f.from) && (!f.to||s.week_start<=f.to));
 const approved=activeReports.filter(s=>s.official_revision_id).length;
 const provisional=activeReports.filter(s=>d.revisions.some(r=>r.submission_id===s.id&&r.status==="provisional")).length;
 const returned=activeReports.filter(s=>d.revisions.some(r=>r.submission_id===s.id&&r.status==="needs_correction")).length;
 const adminRows=d.administrations.filter(a=>!f.administration||f.administration===a.id).map(a=>({id:a.id,name:a.name_ar,...aggregate(d.submissions,d.revisions,d.lines,d.targets,{...f,administration:a.id})})).sort((a,b)=>b.screened-a.screened);
 const programs=["comprehensive","vision"].map(program=>({
   code:program,...aggregate(d.submissions,d.revisions,d.lines,d.targets,{...f,program,grade:""})
 }));
 const recent=activeReports.slice().sort((a,b)=>b.week_start.localeCompare(a.week_start)).slice(0,5).map(s=>{
   const latest=d.revisions.filter(r=>r.submission_id===s.id).sort((a,b)=>b.revision_number-a.revision_number)[0];
   return {id:latest?.id,week:s.week_start,name:d.administrations.find(a=>a.id===s.administration_id)?.name_ar||"الإدارة",status:latest?.status||"draft"};
 });
 return <div className="dashboard-page">
  <section className="dash-hero" aria-label="عنوان لوحة التحكم">
   <div className="dash-hero-content">
     <span className="eyebrow">مرحبًا بك في لوحة المتابعة</span>
     <h1>إدارة الصحة المدرسية والشباب</h1>
     <p>مديرية الشؤون الصحية بالجيزة · البلاغات والمؤشرات والمستهدفات في مكان واحد</p>
   </div>
   <div className="hero-side">
    <div className="hero-year"><small>العام الدراسي</small><strong>{today?.label||"غير محدد"}</strong><small>البيانات الفعلية فقط</small></div>
    <div className="hero-ornament" aria-hidden="true"><UiIcon name="book" size={65}/></div>
   </div>
  </section>
  <section className="dash-filters" aria-label="تصفية المؤشرات"><FilterForm {...d} value={f}/></section>
  <section className="metrics dashboard-metrics" aria-label="المؤشرات الرئيسية">
   <article className="metric metric-card"><div><span>المفحوصون خلال الفترة</span><strong className="value">{fmt(m.screened)}</strong><small className="unit">{labels[f.program]||f.program} · {labels[f.sector]||f.sector}</small></div><span className="metric-icon"><UiIcon name="users" size={24}/></span></article>
   <article className="metric metric-card"><div><span>المستهدف السنوي المعتمد</span><strong className="value">{fmt(m.target)}</strong><small className="unit">المستهدف لا يُجمع أسبوعيًا</small></div><span className="metric-icon"><UiIcon name="target" size={24}/></span></article>
   <article className="metric metric-card"><div><span>نسبة الإنجاز</span><strong className="value">{pct(m.achievement)}</strong><small className="unit">عدد المفحوصين ÷ المستهدف السنوي</small></div><span className="metric-icon"><UiIcon name="chart" size={24}/></span></article>
   <article className="metric metric-card"><div><span>البلاغات المحتسبة</span><strong className="value">{fmt(m.reportCount)}</strong><small className="unit">{f.mode==="official"?"المعتمدة فقط":"الأولية بانتظار الاعتماد"}</small></div><span className="metric-icon"><UiIcon name="report" size={24}/></span></article>
  </section>
  <section className="card workflow-card" aria-labelledby="flowTitle">
   <div className="dash-card-title"><h2 id="flowTitle">مسار البلاغ الأسبوعي</h2><Link className="button" href="/reports">إدارة البلاغات ←</Link></div>
   <div className="workflow-steps">
    {[{name:"إدخال البيانات",icon:"report",hint:"بلاغ موحد لكل إدارة"},{name:"الإرسال",icon:"book",hint:"نسخة أولية"},{name:"المراجعة والاعتماد",icon:"check",hint:"اعتماد المديرية"},{name:"النتائج الرسمية",icon:"chart",hint:"تظهر بعد الاعتماد"}].map(step=><div className="workflow-step" key={step.name}><span className="dot"><UiIcon name={step.icon} size={20}/></span><strong>{step.name}</strong><small>{step.hint}</small></div>)}
   </div>
  </section>
  <div className="dash-grid">
   <section className="card">
    <div className="dash-card-title"><h2>متابعة إدارات الجيزة</h2><Link href="/analytics">عرض التفاصيل</Link></div>
    {adminRows.length?<div className="admin-list">{adminRows.slice(0,7).map(a=><div className="admin-row" key={a.id}><span className="admin-name">{a.name}</span><span className="admin-bar"><i style={{width:bound(a.achievement)+"%"}}/></span><span className="pct">{pct(a.achievement)}</span></div>)}</div>:<p className="empty">لا توجد إدارات متاحة للحساب.</p>}
    <small>الإنجاز محسوب من البيانات المعتمدة حسب الفلاتر. «—» يعني عدم وجود مستهدف معتمد.</small>
   </section>
   <section className="card">
    <div className="dash-card-title"><h2>برامج الفحص</h2><Link href="/programs">عرض البرامج</Link></div>
    <div className="program-list">{programs.map(p=><div className="program-tile" key={p.code}><div className="tag">{labels[p.code]}</div><strong>{fmt(p.screened)}</strong><small>مفحوص خلال الفترة</small><div><small>الإنجاز: {pct(p.achievement)}</small></div></div>)}</div>
    <p className="muted" style={{fontSize:11,margin:"12px 0 0"}}>فحص ثانية حضانة للإبصار فقط، والفحص الشامل في صفوفه المعتمدة؛ العام والأزهري منفصلان.</p>
   </section>
   <section className="card">
    <div className="dash-card-title"><h2>الإنجاز مقابل المستهدف</h2><Link href="/targets">المستهدفات</Link></div>
    <div className="donut" style={{"--progress":bound(m.achievement)+"%"} as CSSProperties}><div className="donut-inner"><div>{pct(m.achievement)}<small>الإنجاز</small></div></div></div>
    <div className="progress-details">
     <div><span>المستهدف السنوي</span><strong>{fmt(m.target)}</strong></div>
     <div><span>المفحوصون في الفترة</span><strong>{fmt(m.screened)}</strong></div>
     <div><span>الفرق عن المستهدف</span><strong>{fmt(Math.max(0,m.target-m.screened))}</strong></div>
    </div>
   </section>
  </div>
  <div className="dash-grid">
   <section className="card">
    <div className="dash-card-title"><h2>أحدث البلاغات</h2><Link href="/reports">عرض الكل</Link></div>
    {recent.length?<div className="report-feed">{recent.map((r,i)=><div className="report-feed-row" key={r.id||i}><span className="file-icon"><UiIcon name="report"/></span><div><strong>{r.name}</strong><small>أسبوع الأحد: {r.week}</small></div><span className={"badge "+(r.status==="provisional"?"status-pending":r.status==="needs_correction"?"status-correction":r.status==="draft"?"status-draft":"")}>{labels[r.status]||r.status}</span></div>)}</div>:<p className="empty">لا توجد بلاغات حتى الآن. لن تُعرض أرقام افتراضية.</p>}
   </section>
   <section className="card">
    <div className="dash-card-title"><h2>قائمة المتابعة</h2><Link href="/reports">البلاغات</Link></div>
    <div className="progress-details">
     <div><span>بلاغات معتمدة</span><strong>{fmt(approved)}</strong></div>
     <div><span>بلاغات بانتظار المراجعة</span><strong>{fmt(provisional)}</strong></div>
     <div><span>بلاغات معادة للتصحيح</span><strong>{fmt(returned)}</strong></div>
    </div>
    <p className="muted" style={{fontSize:11,marginTop:14}}>تستمر الأرقام الرسمية من النسخة المعتمدة، حتى عند وجود تعديل قيد المراجعة.</p>
   </section>
   <section className="card">
    <div className="dash-card-title"><h2>المؤشرات المسجلة</h2><Link href="/analytics">التحليلات</Link></div>
    {Object.keys(m.findings).length?<div className="progress-details">{Object.entries(m.findings).slice(0,6).map(([key,num])=><div key={key}><span>{labels[key]||key}</span><strong>{fmt(num)}</strong></div>)}</div>:<p className="empty">لا توجد نتائج مؤشرات ضمن هذا الترشيح.</p>}
    <small>النتائج قد تتداخل، ولا تُمثّل بالضرورة عدد أطفال مختلفين.</small>
   </section>
  </div>
  <p className="dashboard-footer-notice">{f.mode==="official"?"عرض البيانات المعتمدة رسميًا فقط.":"عرض البيانات الأولية بانتظار الاعتماد فقط."} · هذه المنصة لا تخزن بيانات شخصية للطلاب.</p>
 </div>;
}
