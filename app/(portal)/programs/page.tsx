import { reference, session } from "@/lib/data";
import { latestPrograms, labels, isOperator } from "@/lib/domain";
import { SHEET_COMPREHENSIVE_INDICATORS } from "@/lib/catalog";
import { saveProgram, createYear, addSheetIndicators } from "@/app/actions";
import { Flash } from "@/components/flash";
export default async function Programs({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [d, { profile }, params] = await Promise.all([reference(), session(), searchParams]);
  const missingSheetIndicators = latestPrograms(d.programs)
    .filter((p) => p.code === "comprehensive")
    .map((p) => ({ p, missing: SHEET_COMPREHENSIVE_INDICATORS.filter((i) => !p.indicators.includes(i)) }))
    .filter((x) => x.missing.length);
  return (
    <>
      <h1>البرامج والأعوام الدراسية</h1>
      <p className="muted">
        كل تغيير ينشئ إصدارًا جديدًا. لا تُعدّل النسخ التاريخية أو تُحذف.
      </p>
      <div className="notice">
        رياض أطفال ثانية للإبصار فقط في 2026–27. مؤشرات الفحص الشامل الحالية
        قائمة أولية تحتاج اعتماد المديرية؛ لا تعني مطابقة نموذج الوزارة.
      </div>
      <Flash params={params} />
      {isOperator(profile.role) &&
        missingSheetIndicators.map(({ p, missing }) => (
          <section className="card" key={p.id}>
            <h2>مؤشرات موجودة في شيتات البلاغ الأصلية ومش متسجلة في {p.name_ar}</h2>
            <p className="muted">
              {missing.map((i) => labels[i] || i).join("، ")}
            </p>
            <p className="field-help">
              لازم تتضاف علشان استيراد الشيتات القديمة يشتغل. الإضافة بتعمل إصدار جديد للبرنامج من غير ما تغيّر الصفوف الخمسة ولا البيانات القديمة،
              وبتتسجل في سجل المراجعة. راجع القائمة مع المديرية قبل ما تضغط.
            </p>
            <form action={addSheetIndicators}>
              <input type="hidden" name="program_version_id" value={p.id} />
              <button className="secondary">إضافة المؤشرات دي كإصدار جديد</button>
            </form>
          </section>
        ))}
      {isOperator(profile.role) && (
        <>
          <section className="card">
            <h2>إضافة عام دراسي</h2>
            <form action={createYear} className="grid">
              <label>
                التسمية
                <input
                  name="label"
                  placeholder="2027-28"
                  required
                  maxLength={30}
                />
              </label>
              <label>
                البداية
                <input type="date" name="starts_on" required />
              </label>
              <label>
                النهاية
                <input type="date" name="ends_on" required />
              </label>
              <button>إنشاء العام</button>
            </form>
          </section>
          <section className="card">
            <h2>إصدار برنامج جديد</h2>
            <form action={saveProgram} className="grid">
              <label>
                العام
                <select name="school_year_id">
                  {d.years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                كود البرنامج
                <input
                  name="code"
                  pattern="[a-z][a-z0-9_]{0,49}"
                  required
                  placeholder="vision"
                  dir="ltr"
                />
              </label>
              <label>
                الاسم العربي
                <input name="name_ar" required maxLength={150} />
              </label>
              <label>
                الحالة
                <select name="enabled">
                  <option value="true">مفعّل</option>
                  <option value="false">معطّل في هذا الإصدار</option>
                </select>
              </label>
              <label>
                أكواد الصفوف بفواصل
                <input name="grades" placeholder="kg2" required dir="ltr" />
              </label>
              <label>
                أكواد المؤشرات بفواصل
                <input
                  name="indicators"
                  placeholder="visual_impairment,strabismus,ptosis"
                  dir="ltr"
                />
              </label>
              <button>حفظ إصدار جديد</button>
            </form>
            <p className="muted subsection">
              تعطيل vision في عام جديد لا يغيّر بيانات الأعوام السابقة. يلزم نقل
              المسودات إلى آخر إصدار قبل إرسالها.
            </p>
          </section>
        </>
      )}
      <section className="card table-wrap">
        <h2>الإصدارات الحالية لكل عام</h2>
        <table>
          <thead>
            <tr>
              <th>العام</th>
              <th>البرنامج</th>
              <th>الإصدار</th>
              <th>الحالة</th>
              <th>الصفوف</th>
              <th>المؤشرات</th>
            </tr>
          </thead>
          <tbody>
            {latestPrograms(d.programs).map((p) => (
              <tr key={p.id}>
                <td>{d.years.find((y) => y.id === p.school_year_id)?.label}</td>
                <td>{p.name_ar}</td>
                <td>{p.version}</td>
                <td>{p.enabled ? "مفعّل" : "معطّل"}</td>
                <td>{p.grades.map((g) => labels[g] || g).join("، ")}</td>
                <td>{p.indicators.map((i) => labels[i] || i).join("، ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h2>أرشيف الإصدارات</h2>
        {d.programs.map((p) => (
          <p key={p.id}>
            {d.years.find((y) => y.id === p.school_year_id)?.label} ·{" "}
            {p.name_ar} · الإصدار {p.version} · {p.enabled ? "مفعّل" : "معطّل"}
          </p>
        ))}
      </section>
    </>
  );
}
