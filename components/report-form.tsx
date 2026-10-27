"use client";
import { useRouter } from "next/navigation";
import { memo, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveReport } from "@/app/actions";
import { errorMessages } from "@/lib/messages";
import {
  labels,
  latestPrograms,
  linesSchema,
  type Administration,
  type Program,
  type SchoolYear,
  type Line,
} from "@/lib/domain";

const SECTORS = ["general", "azhar"] as const;

/**
 * The entry grid is rendered once and never re-rendered while typing: inputs are
 * uncontrolled, and validation/auto-include touch only the affected row in the DOM.
 * This keeps typing and moving between cells instant even with many rows.
 */
const ProgramGrid = memo(function ProgramGrid({ p, initial }: { p: Program; initial: Line[] }) {
  return (
    <section className="subsection">
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
            {SECTORS.flatMap((sector) =>
              p.grades.map((grade) => {
                const key = p.id + "-" + sector + "-" + grade;
                const old = initial.find(
                  (l) => l.sector === sector && l.grade_code === grade && (l.program_code === p.code || l.program_version_id === p.id),
                );
                const cell = (name: string, col: number, value: number, label: string) => (
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={10000000}
                    step={1}
                    name={name}
                    data-col={p.id + ":" + col}
                    defaultValue={value}
                    aria-label={label}
                  />
                );
                return (
                  <tr key={key} data-row={key} className={sector === "azhar" ? "sector-azhar" : undefined}>
                    <td>
                      <input type="checkbox" name={key + "-include"} defaultChecked={!!old} aria-label={"تضمين " + labels[sector] + " " + labels[grade]} />
                    </td>
                    <td>{labels[sector]}</td>
                    <td>{labels[grade] || grade}</td>
                    <td>{cell(key + "-screened", 0, old?.screened ?? 0, "المفحوصون " + labels[sector] + " " + labels[grade])}</td>
                    {p.indicators.map((i, n) => (
                      <td key={i}>{cell(key + "-" + i, n + 1, old?.findings[i] ?? 0, (labels[i] || i) + " " + labels[sector] + " " + labels[grade])}</td>
                    ))}
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
});

function checkRow(row: HTMLTableRowElement) {
  const inputs = Array.from(row.querySelectorAll<HTMLInputElement>('input[type="number"]'));
  const [screened, ...findings] = inputs;
  const s = Number(screened.value || 0);
  let bad = false;
  for (const input of inputs) {
    const v = input.value;
    const invalid = v !== "" && (!/^\d+$/.test(v) || (input !== screened && Number(v) > s));
    input.setAttribute("aria-invalid", invalid ? "true" : "false");
    input.title = invalid ? (input === screened ? "لازم رقم صحيح موجب" : "أكبر من عدد المفحوصين") : "";
    bad ||= invalid;
  }
  row.classList.toggle("row-invalid", bad);
  return findings;
}

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
  const dirty = useRef(false);
  const active = useMemo(
    () =>
      latestPrograms(programs)
        .filter((p) => p.school_year_id === y && p.enabled)
        // Comprehensive screening first; KG2 vision is its own separate program below it.
        .sort((a, b) => (a.code === "comprehensive" ? -1 : b.code === "comprehensive" ? 1 : a.code.localeCompare(b.code))),
    [programs, y],
  );

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  return (
    <form
      className="card report-form"
      onInput={(event) => {
        const target = event.target as HTMLInputElement;
        if (target.type !== "number") return;
        dirty.current = true;
        const row = target.closest("tr");
        if (!row) return;
        // Typing a number in a row includes that row automatically, so data is never silently dropped.
        const include = row.querySelector<HTMLInputElement>('input[type="checkbox"]');
        if (include && target.value !== "" && target.value !== "0") include.checked = true;
        checkRow(row);
      }}
      onWheel={(event) => {
        // Prevent the mouse wheel from silently changing a focused number.
        const t = event.target as HTMLElement;
        if (t instanceof HTMLInputElement && t.type === "number" && document.activeElement === t) t.blur();
      }}
      onFocus={(event) => {
        const t = event.target;
        if (t instanceof HTMLInputElement && t.type === "number") t.select();
      }}
      onKeyDown={(event) => {
        const t = event.target;
        if (!(t instanceof HTMLInputElement) || t.type !== "number") return;
        const form = event.currentTarget;
        const move = (next: HTMLInputElement | null | undefined) => {
          if (!next) return;
          event.preventDefault();
          next.focus();
        };
        if (event.key === "Enter") {
          // Enter = next cell (like a spreadsheet), never submits the form by accident.
          event.preventDefault();
          const inputs = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="number"]:not(:disabled)'));
          move(inputs[inputs.indexOf(t) + (event.shiftKey ? -1 : 1)]);
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          // Up/down move within the same column instead of changing the number.
          const col = t.dataset.col;
          const same = Array.from(form.querySelectorAll<HTMLInputElement>(`input[data-col="${col}"]`));
          move(same[same.indexOf(t) + (event.key === "ArrowDown" ? 1 : -1)]);
          if (!same[same.indexOf(t) + (event.key === "ArrowDown" ? 1 : -1)]) event.preventDefault();
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError("");
        const lines: Line[] = [];
        for (const p of active)
          for (const sector of SECTORS)
            for (const grade of p.grades) {
              const key = p.id + "-" + sector + "-" + grade;
              if (form.get(key + "-include") !== "on") continue;
              lines.push({
                program_version_id: p.id,
                sector,
                grade_code: grade,
                screened: Number(form.get(key + "-screened")),
                findings: Object.fromEntries(p.indicators.map((i) => [i, Number(form.get(key + "-" + i))])),
              });
            }
        if (!lines.length) {
          setError("مفيش ولا صف متعلّم عليه «تضمين». اكتب الأرقام في الصفوف اللي فحصتها.");
          return;
        }
        const valid = linesSchema.safeParse(lines);
        if (!valid.success) {
          setError([...new Set(valid.error.issues.map((i) => (i.message.startsWith("Invalid") || i.message.startsWith("Too") ? "فيه رقم مش صحيح (لازم رقم صحيح موجب)" : i.message)))].join("؛ "));
          event.currentTarget.querySelectorAll<HTMLTableRowElement>("tr[data-row]").forEach(checkRow);
          return;
        }
        form.set("lines", JSON.stringify(valid.data));
        start(async () => {
          const result = await saveReport(form);
          if (result.id) {
            dirty.current = false;
            router.push("/reports/" + result.id);
          } else setError(errorMessages[result.error ?? "GENERIC"] ?? errorMessages.GENERIC);
        });
      }}
    >
      <div className="grid">
        <label>
          الإدارة
          <select name="administration_id" defaultValue={administration} required>
            {administrations.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name_ar}
              </option>
            ))}
          </select>
        </label>
        <label>
          العام الدراسي
          <select name="school_year_id" value={y} onChange={(e) => setY(e.target.value)} disabled={!!revisionId}>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
              </option>
            ))}
          </select>
          {revisionId && <input type="hidden" name="school_year_id" value={y} />}
        </label>
        <label>
          بداية الأسبوع (الأحد)
          <input name="week_start" type="date" required defaultValue={week} readOnly={!!revisionId} />
        </label>
      </div>
      {revisionId && <input type="hidden" name="revision_id" value={revisionId} />}
      <p className="notice subsection">
        سجّل عدد الطلبة اللي اتفحصوا في الأسبوع ده بس، مش الإجمالي من بداية السنة. الحفظ بيحدّث المسودة الحالية بالكامل. الطفل ممكن يظهر في أكتر من
        مؤشر طبي، لكن عدد أي مؤشر ما ينفعش يزيد عن عدد المفحوصين.
      </p>
      <p className="field-help">
        للإدخال السريع: <kbd>Enter</kbd> للخانة اللي بعدها، <kbd>Shift</kbd>+<kbd>Enter</kbd> للي قبلها، والأسهم <kbd>↑</kbd> <kbd>↓</kbd> لنفس العمود في
        الصف اللي فوق أو تحت. أول ما تكتب رقم في صف، الصف بيتعلّم عليه «تضمين» لوحده. الخانة الحمرا معناها رقم محتاج مراجعة.
      </p>
      {active.map((p) => (
        <ProgramGrid key={p.id} p={p} initial={initial} />
      ))}
      {!active.length && <p className="empty">مفيش برامج مفعّلة للعام ده.</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="actions sticky-actions">
        <button disabled={pending || !active.length}>{pending ? "جارٍ الحفظ…" : "حفظ المسودة"}</button>
        <small>المسودة مش بتبقى بلاغ أولي غير لما تدوس «إرسال للمراجعة».</small>
      </div>
    </form>
  );
}
