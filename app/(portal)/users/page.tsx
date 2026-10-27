import { session, all } from "@/lib/data";
import { labels, type Profile, type Administration } from "@/lib/domain";
import { assignRole } from "@/app/actions";
export default async function Users() {
  const { profile } = await session();
  if (profile.role !== "directorate_admin") return <h1>غير مصرح</h1>;
  const [users, admins] = await Promise.all([
    all<Profile>("user_profiles"),
    all<Administration>("administrations"),
  ]);
  return (
    <>
      <h1>الفريق والصلاحيات</h1>
      <p className="muted">من هنا تقدر تراجع دور كل حساب والإدارة المرتبط بيها. أي تغيير في الدور بيتسجل في سجل المراجعة.</p>
      <p className="notice">
        إضافة الحسابات الجديدة بتتم حاليًا من لوحة Supabase. لازم الحساب يكون موجود هناك قبل ما تحدد دوره هنا. لحماية النظام، محدش يقدر يغيّر دور حسابه بنفسه. الأدوار الأربعة الجديدة اللي تم الاتفاق عليها محتاجة ترقية منفصلة لقاعدة البيانات ومراجعة أمنية قبل تفعيلها.
      </p>
      <section className="card">
        <h2>إضافة صلاحية لحساب موجود</h2>
        <form action={assignRole} className="grid">
          <label>
            رقم الحساب في Supabase (User ID)
            <input name="user_id" required dir="ltr" />
          </label>
          <label>
            صلاحية الحساب حاليًا
            <select name="role">
              <option value="administration_data_entry">مسؤول إدارة صحية — يشوف بيانات إدارته فقط</option>
              <option value="directorate_viewer">فريق المديرية — مشاهدة بدون تعديل</option>
              <option value="directorate_admin">صلاحية الإدارة المركزية الحالية</option>
            </select>
          </label>
          <label>
            الإدارة الصحية المرتبط بيها الحساب
            <select name="administration_id">
              <option value="">بدون إدارة لدور المديرية</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name_ar}
                </option>
              ))}
            </select>
          </label>
          <button>حفظ الدور والإدارة</button>
        </form>
      </section>
      <section className="card">
        <h2>إيه صلاحيات كل دور؟</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>الدور المطلوب</th><th>مسموح يشوف إيه؟</th><th>مسموح يعدّل إيه؟</th><th>الحالة</th></tr></thead>
          <tbody>
            <tr><td>مدير إدارة الصحة المدرسية — مشرف عام</td><td>كل الإدارات والبرامج، ومراجعة عمل الفريق</td><td>إدارة الصلاحيات والاعتمادات والإعدادات</td><td>محتاج فصل عن دور المسؤول الحالي</td></tr>
            <tr><td>مسؤول البرنامج — تشغيل ومتابعة</td><td>كل النظام والبلاغات</td><td>التشغيل والمراجعة حسب التفويض، بدون تعديل سلطة المشرف العام</td><td>محتاج تفعيل دور مستقل</td></tr>
            <tr><td>مسؤولو الإدارات الصحية</td><td>الإدارة المربوطة بالحساب فقط</td><td>بلاغات ومستهدفات إدارتهم حسب قواعد الاعتماد والمواعيد</td><td>موجود في النظام الحالي</td></tr>
            <tr><td>فريق المديرية</td><td>بيانات المديرية المتاحة للعرض</td><td>مش مسموح بالتعديل</td><td>موجود في النظام الحالي</td></tr>
          </tbody>
        </table></div>
        <p className="field-help">ميزة «عرض الشاشة بصلاحيات مستخدم آخر» مش مفعّلة لحد ما نضيف معاينة للقراءة فقط باختبارات تمنع تجاوز صلاحيات الإدارات.</p>
      </section>
      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>رقم الحساب (User ID)</th>
              <th>الدور الحالي</th>
              <th>الإدارة</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.user_id}>
                <td dir="ltr">{u.user_id}</td>
                <td>{labels[u.role]}</td>
                <td>
                  {admins.find((a) => a.id === u.administration_id)?.name_ar ||
                    "المديرية"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
