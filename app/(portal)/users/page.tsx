import Link from "next/link";
import { session, all } from "@/lib/data";
import { labels, isOperator, isSupervisor, type Profile, type Administration } from "@/lib/domain";
import { assignRole } from "@/app/actions";
export default async function Users() {
 const {profile}=await session();
 if (!isOperator(profile.role)) return <h1>غير مصرح ليك بفتح الصفحة دي</h1>;
 const [users,admins]=await Promise.all([all<Profile>("user_profiles"),all<Administration>("administrations")]);
 return <>
  <h1>المستخدمون والصلاحيات</h1>
  <p className="muted">من هنا تقدر تعرف مين له حق يشوف إيه في السيستم، وتراجع الإدارة المرتبطة بكل حساب. صلاحيات الإدارات بتتراجع على قاعدة البيانات، مش على شكل الشاشة بس.</p>
  <section className="card">
   <h2>الأدوار المتاحة في النظام</h2>
   <div className="table-wrap"><table><thead><tr><th>الدور</th><th>بيشوف إيه؟</th><th>بيعمل إيه؟</th></tr></thead><tbody>
    <tr><td>مدير إدارة الصحة المدرسية (المشرف العام)</td><td>كل بيانات الإدارات والبرامج</td><td>المراجعة والإشراف وتحديد أدوار الناس</td></tr>
    <tr><td>مسؤول البرنامج</td><td>كل البيانات والشاشات التشغيلية</td><td>يتابع التشغيل والبلاغات والمستهدفات؛ ما يقدرش يمنح صلاحيات</td></tr>
    <tr><td>مسؤول الإدارة الصحية</td><td>البيانات الخاصة بإدارته بس</td><td>يسجل البلاغات ويقترح تعديل المستهدفات في المواعيد المسموحة</td></tr>
    <tr><td>فريق المديرية</td><td>البيانات المتاحة للمتابعة على مستوى المديرية</td><td>اطلاع فقط؛ ما فيش تعديل أو اعتماد</td></tr>
   </tbody></table></div>
   <p className="field-help">الدور القديم «مدير المديرية» ما زال متاحًا مؤقتًا للحسابات الموجودة علشان الدخول ما يتعطلش أثناء نقل الصلاحيات.</p>
  </section>
  {isSupervisor(profile.role)&&<section className="card">
   <h2>تحديد دور حساب</h2>
   <p className="field-help">أضف الشخص أولًا من Supabase → Authentication → Users. بعد كده حدد رقم حسابه وصلاحيته هنا. المشرف العام ما يقدرش يغيّر دور نفسه.</p>
   <form action={assignRole} className="grid">
    <label>رقم الحساب (User ID من Supabase)<input name="user_id" dir="ltr" placeholder="انسخ رقم حساب المستخدم من Supabase" required/></label>
    <label>الدور المطلوب
     <select name="role" defaultValue="administration_data_entry">
      <option value="directorate_supervisor">مدير إدارة الصحة المدرسية — مشرف عام</option>
      <option value="program_manager">مسؤول البرنامج — تشغيل ومتابعة</option>
      <option value="administration_data_entry">مسؤول الإدارة الصحية — إدارته بس</option>
      <option value="directorate_viewer">فريق المديرية — اطلاع فقط</option>
     </select>
    </label>
    <label>الإدارة الصحية (للمسؤول المحلي فقط)
     <select name="administration_id"><option value="">مش مربوط بإدارة واحدة</option>{admins.map(a=><option key={a.id} value={a.id}>{a.name_ar}</option>)}</select>
    </label>
    <button type="submit">حفظ الصلاحية</button>
   </form>
   <p className="field-help">لو اخترت مسؤول إدارة صحية، لازم تحدد إدارته. باقي الأدوار لازم تسيب الإدارة فاضية. التعديل بيتسجل في سجل المراجعة.</p>
  </section>}
  <section className="card">
   <h2>الحسابات المسجلة</h2>
   <div className="table-wrap"><table><thead><tr><th>رقم الحساب</th><th>الدور الحالي</th><th>نطاق البيانات</th><th>معاينة الصلاحيات</th></tr></thead><tbody>
    {users.map(u=><tr key={u.user_id}>
     <td dir="ltr">{u.user_id}</td><td>{labels[u.role]}</td>
     <td>{admins.find(a=>a.id===u.administration_id)?.name_ar||"بيانات المديرية"}</td>
     <td>{isSupervisor(profile.role)?<Link href={"/users/preview?user="+u.user_id}>معاينة اللي يقدر يشوفه</Link>:<span className="muted">عرض فقط</span>}</td>
    </tr>)}
    {!users.length&&<tr><td colSpan={4}>لسه ما فيش حسابات لها صلاحيات.</td></tr>}
   </tbody></table></div>
  </section>
 </>;
}
