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
      <h1>المستخدمون والصلاحيات</h1>
      <p className="notice">
        الحسابات بالدعوة عبر لوحة Supabase فقط. اضبط رابط الدعوة وسياسة كلمات
        المرور وMFA قبل أي استخدام حقيقي. تُسند الصلاحية بعد إنشاء حساب Auth. لا
        يستطيع المدير تغيير صلاحية حسابه من هنا.
      </p>
      <section className="card">
        <h2>ربط حساب أو تعديل صلاحية</h2>
        <form action={assignRole} className="grid">
          <label>
            معرّف مستخدم Auth (UUID)
            <input name="user_id" required dir="ltr" />
          </label>
          <label>
            الدور
            <select name="role">
              <option value="administration_data_entry">
                مدخل بيانات الإدارة
              </option>
              <option value="directorate_viewer">مشاهد المديرية</option>
              <option value="directorate_admin">مدير المديرية</option>
            </select>
          </label>
          <label>
            الإدارة (لإدخال البيانات فقط)
            <select name="administration_id">
              <option value="">بدون إدارة لدور المديرية</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name_ar}
                </option>
              ))}
            </select>
          </label>
          <button>حفظ الصلاحية وتسجيلها في التدقيق</button>
        </form>
      </section>
      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>معرّف المستخدم</th>
              <th>الدور</th>
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
