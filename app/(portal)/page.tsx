import Link from "next/link";
import {dataset,filters} from "@/lib/data";
import {aggregate,labels,latestPrograms} from "@/lib/domain";
import {FilterForm} from "@/components/filters";
import {UiIcon} from "@/components/portal-nav";

const fmt=(value:number)=>value.toLocaleString("ar-EG",{maximumFractionDigits:1});
const percent=(value:number|null)=>value===null?"—":fmt(value)+"٪";

export default async function Dashboard({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const d=await dataset();
 const params=await searchParams;
 const f=filters(params,d.years);
 const m=aggregate(d.submissions,d.revisions,d.lines,d.targets,f);
 const selectedYear=d.years.find(y=>y.id===f.year)?.label||"العام الدراسي";
 const comparisons=d.administrations
  .filter(a=>!f.administration||a.id===f.administration)
  .map(a=>({id:a.id,name:a.name_ar,values:aggregate(d.submissions,d.revisions,d.lines,d.targets,{...f,administration:a.id})}));
 const programs=latestPrograms(d.programs)
  .filter(p=>p.school_year_id===f.year&&p.enabled)
  .slice(0,4)
  .map(p=>({id:p.id,name:p.name_ar,values:aggregate(d.submissions,d.revisions,d.lines,d.targets,{...f,program:p.code,grade:""})}));
 const recent=d.submissions
  .filter(s=>s.school_year_id===f.year&&(!f.administration||s.administration_id===f.administration))
  .flatMap(s=>{
   const revision=d.revisions.filter(r=>r.submission_id===s.id).sort((a,b)=>b.revision_number-a.revision_number)[0];
   return revision?[{submission:s,revision}]:[];
  })
  .sort((a,b)=>b.submission.week_start.localeCompare(a.submission.week_start))
  .slice(0,5);
 const adminName=(id:string)=>d.administrations.find(a=>a.id===id)?.name_ar||"إدارة غير معروفة";
 const cap=(value:number|null)=>Math.max(0,Math.min(100,value||0));
 return <div className="dashboard-new">
  <section className="dashboard-hero">
   <div className="dashboard-hero-copy">
    <span className="eyebrow">مديرية الشؤون الصحية بالجيزة · لوحة متابعة الفحص</span>
    <h1>إدارة الصحة المدرسية والشباب</h1>
    <p>البلاغات الأسبوعية، نسب الإنجاز والمستهدفات في مكان واحد</p>
   </div>
   <div className="dashboard-hero-right">
    <div className="dashboard-hero-year"><span>العام الدراسي المختار</span><strong>{selectedYear}</strong></div>
    <div className="dashboard-hero-circle" aria-hidden="true"><UiIcon name="programs" size={42}/></div>
   </div>
  </section>
  <details className="dashboard-filters">
   <summary>تصفية البيانات حسب العام والبرنامج والقطاع والإدارة والفترة</summary>
   <FilterForm {...d} value={f}/>
  </details>
  <section className="metrics dashboard-kpis" aria-label="المؤشرات من قاعدة البيانات">
   <div className="metric dashboard-kpi">
    <div><span>المفحوصون خلال الفترة</span><strong>{fmt(m.screened)}</strong><small>{labels[f.program]||f.program} · {labels[f.sector]||f.sector}</small></div>
    <span className="dashboard-kpi-icon"><UiIcon name="users" size={23}/></span>
   </div>
   <div className="metric dashboard-kpi">
    <div><span>المستهدف السنوي المعتمد</span><strong>{fmt(m.target)}</strong><small>المستهدف لا يُجمع أسبوعيًا</small></div>
    <span className="dashboard-kpi-icon"><UiIcon name="targets" size={23}/></span>
   </div>
   <div className="metric dashboard-kpi">
    <div><span>نسبة الإنجاز</span><strong>{percent(m.achievement)}</strong><small>المفحوصون ÷ المستهدف السنوي</small></div>
    <span className="dashboard-kpi-icon"><UiIcon name="analytics" size={23}/></span>
   </div>
   <div className="metric dashboard-kpi">
    <div><span>البلاغات المحتسبة</span><strong>{fmt(m.reportCount)}</strong><small>نسخة محتسبة واحدة لكل إدارة وأسبوع</small></div>
    <span className="dashboard-kpi-icon"><UiIcon name="reports" size={23}/></span>
   </div>
  </section>
  <section className="card workflow-box">
   <div className="dashboard-card-heading"><h2>دورة البلاغ الأسبوعي</h2><Link href="/reports">عرض البلاغات</Link></div>
   <div className="dashboard-workflow">
    {["تجميع البيانات من الإدارة","رفع البلاغ الأسبوعي","مراجعة مديرية الصحة","اعتماد النسخة الرسمية"].map((step,index)=>
     <div key={step} className="dashboard-stage"><span className="dashboard-stage-bubble">{index+1}</span><span>{step}</span></div>
    )}
   </div>
   <small>يبدأ الأسبوع الأحد وينتهي السبت، وتُقفل التعديلات الأحد التالي الساعة 4:00 مساءً بتوقيت القاهرة. الاعتماد منفصل عن الإغلاق.</small>
  </section>
  <div className="dashboard-columns">
   <section className="card">
    <div className="dashboard-card-heading"><h2>مقارنة الإدارات الصحية</h2><Link href="/analytics">عرض الكل</Link></div>
    {comparisons.length?
     <div className="dashboard-admin">{comparisons.slice(0,7).map(a=>
      <div className="dashboard-admin-row" key={a.id}>
       <strong>{a.name}</strong>
       <div className="dashboard-admin-track" role="img" aria-label={"نسبة الإنجاز "+percent(a.values.achievement)}><i style={{width:cap(a.values.achievement)+"%"}}/></div>
       <span className="percent">{percent(a.values.achievement)}</span>
      </div>)}</div>
     :<p className="empty">لا توجد إدارات متاحة لهذا الحساب.</p>}
    <small>النسب محسوبة من البلاغات والمستهدفات المعتمدة وفق الفلاتر.</small>
   </section>
   <section className="card">
    <div className="dashboard-card-heading"><h2>البرامج الصحية</h2><Link href="/programs">عرض الكل</Link></div>
    {programs.length?<div className="dashboard-programs">{programs.map(p=>
     <div className="dashboard-program-tile" key={p.id}>
      <b>{p.name}</b><strong>{fmt(p.values.screened)}</strong><small>مفحوص خلال الفترة</small>
      <p><span className="badge">{percent(p.values.achievement)} من المستهدف</span></p>
     </div>)}</div>:<p className="empty">لا توجد برامج نشطة لهذا العام.</p>}
    <small>فحص إبصار KG2 برنامج مستقل عن الفحص الشامل.</small>
   </section>
   <section className="card">
    <div className="dashboard-card-heading"><h2>إنجاز المستهدف</h2><Link href="/targets">المستهدفات</Link></div>
    <div className="dashboard-progress-ring" style={{background:"conic-gradient(#36b995 "+cap(m.achievement)+"%,#e6f2eb 0)"}}>
     <div className="dashboard-progress-center"><strong>{percent(m.achievement)}</strong><small>نسبة الإنجاز</small></div>
    </div>
    <div className="dashboard-progress-stats">
     <div><span>المستهدف السنوي</span><b>{fmt(m.target)}</b></div>
     <div><span>المفحوصون خلال الفترة</span><b>{fmt(m.screened)}</b></div>
     <div><span>الفرق حتى المستهدف</span><b>{fmt(Math.max(0,m.target-m.screened))}</b></div>
    </div>
   </section>
  </div>
  <div className="two">
   <section className="card">
    <div className="dashboard-card-heading"><h2>نتائج المؤشرات الطبية</h2><Link href="/analytics">التقارير والإحصاءات</Link></div>
    {Object.keys(m.findings).length?<div className="table-wrap"><table><thead><tr><th>المؤشر</th><th>العدد</th><th>النسبة من المفحوصين</th></tr></thead>
     <tbody>{Object.entries(m.findings).map(([key,value])=><tr key={key}><td>{labels[key]||key}</td><td>{fmt(value)}</td><td>{percent(m.rates[key])}</td></tr>)}</tbody>
    </table></div>:<p className="empty">لا توجد مؤشرات مسجلة ضمن الترشيح.</p>}
    <small>قد يُسجل أكثر من مؤشر لنفس الطفل؛ مجموع المؤشرات لا يمثل عدد أطفال مختلفين.</small>
   </section>
   <section className="card">
    <div className="dashboard-card-heading"><h2>أحدث البلاغات</h2><Link href="/reports">عرض الكل</Link></div>
    {recent.length?<div className="dashboard-recent">{recent.map(({submission,revision})=>
     <Link key={revision.id} href={"/reports/"+revision.id} className="dashboard-recent-row">
      <span className="dashboard-document-icon"><UiIcon name="reports" size={19}/></span>
      <span><strong>{adminName(submission.administration_id)}</strong><small>أسبوع {submission.week_start} · {d.years.find(y=>y.id===submission.school_year_id)?.label}</small></span>
      <span className={"badge"+(revision.status==="provisional"?" yellow":revision.status==="needs_correction"?" red":"")}>{labels[revision.status]||revision.status}</span>
     </Link>)}</div>:<p className="empty">لم تُرسل بلاغات لهذا العام بعد.</p>}
   </section>
  </div>
  <div className="dashboard-data-note">{f.mode==="official"?"تعرض هذه اللوحة الأرقام المعتمدة فقط.":"أنت تشاهد نسخ البلاغات الأولية المنتظرة للاعتماد."} جميع الأرقام مستمدة من البيانات المتاحة لصلاحيات هذا الحساب؛ لا تُعرض أرقام نموذجية.</div>
 </div>;
}
