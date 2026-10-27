import Link from "next/link";
import { all, reference, session } from "@/lib/data";
import { labels, isOperator, isSupervisor, type Profile } from "@/lib/domain";
import { inviteUser, resendInvitation, updateUserAccess } from "@/app/actions";
import { Flash } from "@/components/flash";
import { RoleFields } from "@/components/role-fields";

export default async function Users({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { profile, user } = await session();
  const params = await searchParams;
  if (!isOperator(profile.role)) return <h1>غير مصرح ليك بفتح الصفحة دي</h1>;
  const [users, ref] = await Promise.all([
    all<Profile>("user_profiles", undefined, "user_id,role,administration_id,full_name,email,status,created_at"),
    reference(),
  ]);
  const admins = ref.administrations;
  const supervisor = isSupervisor(profile.role);
  const inviteReady = Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  users.sort((a, b) => (a.status === b.status ? (a.full_name ?? a.email ?? "").localeCompare(b.full_name ?? b.email ?? "", "ar") : a.status === "active" ? -1 : 1));
  return (
    <>
      <h1>المستخدمون والصلاحيات</h1>
      <Flash params={params} />
      <p className="muted">
        من هنا تضيف الناس وتحدد كل واحد يشوف ويعمل إيه. الصلاحيات بتتراجع على الخادم وفي قاعدة البيانات نفسها، مش بس في شكل الشاشة.
      </p>
      {supervisor && (
        <section className="card">
          <h2>إضافة مستخدم جديد</h2>
          <p className="field-help">
            اكتب الاسم والإيميل والدور بس. هيوصل للشخص إيميل دعوة يفتحه ويختار كلمة السر بنفسه؛ إنت عمرك ما هتعرف كلمة السر بتاعته.
          </p>
          {!inviteReady && (
            <p className="flash flash-error" role="alert">
              إرسال الدعوات لسه مش مفعّل: لازم يتضاف المفتاح السري SUPABASE_SECRET_KEY في إعدادات Vercel (Environment Variables) — مش في الكود.
            </p>
          )}
          <form action={inviteUser} className="grid">
            <label>
              الاسم بالكامل
              <input name="full_name" required minLength={2} maxLength={120} autoComplete="off" />
            </label>
            <label>
              الإيميل
              <input name="email" type="email" required dir="ltr" autoComplete="off" />
            </label>
            <RoleFields administrations={admins} idPrefix="invite" />
            <button type="submit">إرسال الدعوة</button>
          </form>
        </section>
      )}
      <section className="card table-wrap">
        <h2>الحسابات ({users.length.toLocaleString("ar-EG")})</h2>
        <table className="users-table">
          <thead>
            <tr>
              <th>الاسم والإيميل</th>
              <th>الدور الحالي</th>
              <th>نطاق البيانات</th>
              <th>الحالة</th>
              {supervisor && <th>تعديل الصلاحية</th>}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.user_id} className={u.status === "disabled" ? "row-disabled" : undefined}>
                <td>
                  <strong>{u.full_name || "—"}</strong>
                  <br />
                  <small dir="ltr">{u.email || u.user_id}</small>
                  {supervisor && (
                    <>
                      <br />
                      <Link href={"/users/preview?user=" + u.user_id}>معاينة اللي يقدر يشوفه</Link>
                    </>
                  )}
                </td>
                <td>{labels[u.role]}</td>
                <td>{admins.find((a) => a.id === u.administration_id)?.name_ar || "كل الإدارات"}</td>
                <td>
                  <span className={"badge" + (u.status === "disabled" ? " red" : "")}>{u.status === "disabled" ? "موقوف" : "نشط"}</span>
                </td>
                {supervisor && (
                  <td>
                    {u.user_id === user.id ? (
                      <span className="muted">ده حسابك — ما ينفعش تغيّر صلاحيتك بنفسك.</span>
                    ) : (
                      <details>
                        <summary>تعديل</summary>
                        <form action={updateUserAccess} className="stack">
                          <input type="hidden" name="user_id" value={u.user_id} />
                          <label>
                            الاسم
                            <input name="full_name" defaultValue={u.full_name ?? ""} maxLength={120} />
                          </label>
                          <RoleFields administrations={admins} role={u.role} administration={u.administration_id} legacy={u.role === "directorate_admin"} idPrefix={"u-" + u.user_id} />
                          <label>
                            حالة الحساب
                            <select name="status" defaultValue={u.status ?? "active"}>
                              <option value="active">نشط</option>
                              <option value="disabled">موقوف (ما يقدرش يدخل، وتاريخه محفوظ)</option>
                            </select>
                          </label>
                          <button type="submit">حفظ</button>
                        </form>
                        {u.email && u.status !== "disabled" && (
                          <form action={resendInvitation} className="subsection">
                            <input type="hidden" name="user_id" value={u.user_id} />
                            <button className="secondary" type="submit">
                              إعادة إرسال الدعوة / رابط تغيير كلمة السر
                            </button>
                          </form>
                        )}
                      </details>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {!users.length && (
              <tr>
                <td colSpan={5}>لسه مفيش حسابات.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h2>الأدوار المتاحة</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الدور</th>
                <th>بيشوف إيه؟</th>
                <th>بيعمل إيه؟</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>المشرف العام</td>
                <td>كل الإدارات والبرامج والتقارير وسجل المراجعة</td>
                <td>كل حاجة، ومعاها إضافة المستخدمين وتحديد أدوارهم وإيقاف الحسابات</td>
              </tr>
              <tr>
                <td>مدير البرنامج</td>
                <td>كل البيانات والشاشات التشغيلية</td>
                <td>متابعة واعتماد البلاغات والمستهدفات والبرامج؛ ما يقدرش يمنح صلاحيات</td>
              </tr>
              <tr>
                <td>مسؤول الإدارة الصحية</td>
                <td>بيانات إدارته بس</td>
                <td>يسجّل البلاغات ويستورد بيانات إدارته ويقترح مستهدفاتها في المواعيد المسموحة</td>
              </tr>
              <tr>
                <td>فريق المديرية</td>
                <td>البلاغات المبعوتة والمؤشرات على مستوى المديرية</td>
                <td>اطلاع فقط؛ مفيش تعديل ولا اعتماد</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
