"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveReport } from "@/app/actions";
import {
  labels,
  latestPrograms,
  linesSchema,
  type Administration,
  type Program,
  type SchoolYear,
  type Line,
} from "@/lib/domain";
export function ReportForm({
  administrations,
  years,
  programs,
  initial = [],
  administration,
  year,
  week,
  revisionId,
}: {
  administrations: Administration[];
  years: SchoolYear[];
  programs: Program[];
  initial?: Line[];
  administration?: string;
  year?: string;
  week?: string;
  revisionId?: string;
}) {
  const router = useRouter();
  const [y, setY] = useState(year || years.at(-1)?.id || "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const active = latestPrograms(programs).filter(
    (p) => p.school_year_id === y && p.enabled,
  );
  return (
    <form
      className="card"
      onKeyDown={(event) => {
        // Enter advances to the next numeric cell without triggering a full form submit.
        // Native Tab and Shift+Tab remain available for accessible keyboard navigation.
        if (event.key !== "Enter" || !(event.target instanceof HTMLInputElement) || event.target.type !== "number") return;
        event.preventDefault();
        const inputs = Array.from(event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="number"]:not(:disabled)'));
        const index = inputs.indexOf(event.target);
        inputs[index + 1]?.focus();
        inputs[index + 1]?.select();
      }}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError("");
        const lines: Line[] = [];
        for (const p of active)
          for (const sector of ["general", "azhar"] as const)
            for (const grade of p.grades) {
              const key = p.id + "-" + sector + "-" + grade;
              if (form.get(key + "-include") !== "on") continue;
              lines.push({
                program_version_id: p.id,
                sector,
                grade_code: grade,
                screened: Number(form.get(key + "-screened")),
                findings: Object.fromEntries(
                  p.indicators.map((i) => [i, Number(form.get(key + "-" + i))]),
                ),
              });
            }
        const valid = linesSchema.safeParse(lines);
        if (!valid.success) {
          setError(valid.error.issues.map((i) => i.message).join("؛ "));
          return;
        }
        form.set("lines", JSON.stringify(valid.data));
        start(async () => {
          try {
            const id = await saveReport(form);
            router.push("/reports/" + id);
          } catch {
            setError(
              "تعذر الحفظ. راجع الصلاحية والموعد، وعدم وجود نسخة نشطة أخرى.",
            );
          }
        });
      }}
    >
      <div className="grid">
        <label>
          الإدارة
          <select
            name="administration_id"
            defaultValue={administration}
            required
          >
            {administrations.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name_ar}
              </option>
            ))}
          </select>
        </label>
        <label>
          العام الدراسي
          <select
            name="school_year_id"
            value={y}
            onChange={(e) => setY(e.target.value)}
            disabled={!!revisionId}
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
              </option>
            ))}
          </select>
          {revisionId && (
            <input type="hidden" name="school_year_id" value={y} />
          )}
        </label>
        <label>
          بداية الأسبوع (الأحد)
          <input
            name="week_start"
            type="date"
            required
            defaultValue={week}
            readOnly={!!revisionId}
          />
        </label>
      </div>
      {revisionId && (
        <input type="hidden" name="revision_id" value={revisionId} />
      )}
      <p className="notice subsection">
        سجّل عدد الطلبة اللي اتفحصوا في الأسبوع ده بس، مش الإجمالي من بداية السنة. اختار الصفوف اللي
        هتدخل بياناتها. الحفظ بيحدّث المسودة الحالية بالكامل. الطفل ممكن يظهر في أكتر من مؤشر طبي، لكن عدد أي مؤشر ما ينفعش يزيد عن عدد المفحوصين.
      </p>
      <p className="field-help">للإدخال السريع: اضغط Enter بعد أي رقم للانتقال للخانة الرقمية اللي بعدها، أو Tab للتنقل الطبيعي بين كل الحقول. مفيش حفظ تلقائي؛ اضغط «حفظ المسودة» بعد ما تخلص.</p>
      {active.map((p) => (
        <section key={p.id} className="subsection">
          <h2>
            {p.name_ar} <span className="badge">إصدار {p.version}</span>
          </h2>
          <div className="table-wrap report-entry-wrapper">
            <table className="report-entry-table">
              <thead>
                <tr>
                  <th>تضمين</th>
                  <th>القطاع</th>
                  <th>الصف</th>
                  <th>المفحوصون</th>
                  {p.indicators.map((i) => (
                    <th key={i}>{labels[i] || i}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(["general", "azhar"] as const).flatMap((sector) =>
                  p.grades.map((grade) => {
                    const key = p.id + "-" + sector + "-" + grade;
                    const old = initial.find(
                      (l) =>
                        l.sector === sector &&
                        l.grade_code === grade &&
                        (l.program_code === p.code ||
                          l.program_version_id === p.id),
                    );
                    return (
                      <tr key={key}>
                        <td>
                          <input
                            type="checkbox"
                            name={key + "-include"}
                            defaultChecked={!!old}
                            aria-label={
                              "تضمين " + labels[sector] + " " + labels[grade]
                            }
                          />
                        </td>
                        <td>{labels[sector]}</td>
                        <td>{labels[grade] || grade}</td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            max={10000000}
                            step={1}
                            name={key + "-screened"}
                            defaultValue={old?.screened ?? 0}
                            aria-label={
                              "المفحوصون " +
                              labels[sector] +
                              " " +
                              labels[grade]
                            }
                          />
                        </td>
                        {p.indicators.map((i) => (
                          <td key={i}>
                            <input
                              type="number"
                              min={0}
                              max={10000000}
                              step={1}
                              name={key + "-" + i}
                              defaultValue={old?.findings[i] ?? 0}
                              aria-label={
                                (labels[i] || i) +
                                " " +
                                labels[sector] +
                                " " +
                                labels[grade]
                              }
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {!active.length && (
        <p className="empty">لا توجد برامج نشطة لهذا العام.</p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="actions">
        <button disabled={pending || !active.length}>
          {pending ? "جارٍ الحفظ…" : "حفظ المسودة"}
        </button>
        <small>
          لا تصبح المسودة بلاغًا أوليًا حتى الضغط على إرسال للمراجعة.
        </small>
      </div>
    </form>
  );
}
