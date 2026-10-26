import {
  labels,
  latestPrograms,
  type Administration,
  type SchoolYear,
  type Program,
  type Filters,
} from "@/lib/domain";
export function FilterForm({
  administrations,
  years,
  programs,
  value,
}: {
  administrations: Administration[];
  years: SchoolYear[];
  programs: Program[];
  value: Filters;
}) {
  const programsForYear = latestPrograms(programs).filter(
    (p) => p.school_year_id === value.year,
  );
  return (
    <form className="card filters" method="get">
      <label>
        العام الدراسي
        <select name="year" defaultValue={value.year}>
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        مصدر الأرقام
        <select name="mode" defaultValue={value.mode}>
          <option value="official">المعتمد الرسمي</option>
          <option value="pending">الأولي بانتظار الاعتماد فقط</option>
        </select>
      </label>
      <label>
        القطاع
        <select name="sector" defaultValue={value.sector}>
          <option value="general">عام</option>
          <option value="azhar">أزهري</option>
          <option value="combined">القطاعان معًا</option>
        </select>
      </label>
      <label>
        البرنامج
        <select name="program" defaultValue={value.program}>
          {programsForYear.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name_ar}
            </option>
          ))}
        </select>
      </label>
      <label>
        الإدارة
        <select name="administration" defaultValue={value.administration}>
          <option value="">كل الإدارات المتاحة</option>
          {administrations.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name_ar}
            </option>
          ))}
        </select>
      </label>
      <label>
        الصف
        <select name="grade" defaultValue={value.grade}>
          <option value="">كل صفوف البرنامج</option>
          {[
            ...new Set(
              programsForYear
                .filter((p) => p.code === value.program)
                .flatMap((p) => p.grades),
            ),
          ].map((g) => (
            <option key={g} value={g}>
              {labels[g] || g}
            </option>
          ))}
        </select>
      </label>
      <label>
        من أسبوع الأحد
        <input type="date" name="from" defaultValue={value.from} />
      </label>
      <label>
        حتى أسبوع الأحد
        <input type="date" name="to" defaultValue={value.to} />
      </label>
      <button>تحديث النتائج</button>
      <small>
        الفترة تخص أسابيع الفحص. المستهدف سنوي، لا يُجمع أسبوعيًا. عند تحديد
        نهاية الفترة تُستخدم نسخ المستهدف النافذة في نهايتها.
      </small>
    </form>
  );
}
