"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { stageImportBatches } from "@/app/actions";
import { readCsv, readXlsx, sha256Hex, MAX_FILE_BYTES, type Sheet } from "@/lib/spreadsheet";
import { buildImport, detectSector, weekdayName, type ImportOptions, type ImportResult, type Override, type Submission } from "@/lib/import";
import { Temporal } from "@js-temporal/polyfill";
import { errorMessages } from "@/lib/messages";
import { labels, type Administration, type Program, type SchoolYear } from "@/lib/domain";

const meaningText = (m: ImportResult["plan"]["columns"][number]["meaning"]) => {
  switch (m.kind) {
    case "administration":
      return "اسم الإدارة";
    case "timestamp":
      return "وقت الإرسال (بيتحسب منه الأسبوع)";
    case "week":
      return "أسبوع البلاغ";
    case "sector":
      return "القطاع";
    case "target":
      return `المستهدف السنوي · ${labels[m.grade]} (اقتراح، مش رسمي)`;
    case "screened":
      return `المفحوصون · ${labels[m.grade]}`;
    case "indicator":
      return `${labels[m.indicator] ?? m.indicator} · ${labels[m.grade]}`;
    default:
      return "اتجاهل: " + m.reason;
  }
};

const shortDate = (iso: string) => {
  const d = Temporal.PlainDate.from(iso);
  return `${d.day}/${d.month}`;
};
const weekText = (iso: string) => `${shortDate(iso)} – ${shortDate(Temporal.PlainDate.from(iso).add({ days: 6 }).toString())}`;
const statusText: Record<Submission["status"], string> = { kept: "هيتاخد", superseded: "اتغطّى بإرسال أحدث", excluded: "مستبعد" };

function SubmissionTable({ list, onChange }: { list: Submission[]; onChange: (row: number, o: Override) => void }) {
  const [onlyAttention, setOnlyAttention] = useState(false);
  const attention = (s: Submission) => s.status !== "kept" || s.notes.length > 0 || s.errors.length > 0 || s.late || s.overridden;
  const shown = onlyAttention ? list.filter(attention) : list;
  return (
    <details open className="submissions-review">
      <summary>
        مراجعة الإرسالات ({list.filter((s) => s.status === "kept").length.toLocaleString("ar-EG")} هيتاخدوا من {list.length.toLocaleString("ar-EG")})
      </summary>
      <p className="field-help">
        كل صف هنا إرسال من الفورم. الأسبوع بيتحسب لوحده: اللي يوصل من الأربع لحد التلات اللي بعده بيتحسب على الأسبوع (الأحد–السبت) اللي بدأ قبله،
        والموعد الرسمي الأحد ٤ العصر. لو إدارة بعتت نفس أعداد المفحوصين تاني، بيتعامل كتعديل لنفس البلاغ. تقدر تغيّر الأسبوع أو تشيل علامة «يتاخد» لأي
        إرسال.
      </p>
      <label className="inline">
        <input type="checkbox" checked={onlyAttention} onChange={(e) => setOnlyAttention(e.target.checked)} /> اعرض اللي محتاج مراجعة بس
      </label>
      <div className="table-wrap">
        <table className="submission-table">
          <thead>
            <tr>
              <th>يتاخد</th>
              <th>صف</th>
              <th>الإدارة</th>
              <th>وقت الإرسال</th>
              <th>الأسبوع</th>
              <th>المفحوصين</th>
              <th>الحالة والملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => {
              const base = Temporal.PlainDate.from(s.proposedWeek);
              const weeks = [-3, -2, -1, 0, 1, 2].map((n) => base.add({ days: 7 * n }).toString());
              if (!weeks.includes(s.week)) weeks.push(s.week);
              return (
                <tr key={s.row} className={s.status === "kept" ? (s.errors.length ? "row-invalid" : undefined) : "row-muted"}>
                  <td>
                    <input
                      type="checkbox"
                      checked={s.status !== "excluded"}
                      aria-label={"يتاخد إرسال صف " + s.row}
                      onChange={(e) => onChange(s.row, { include: e.target.checked })}
                    />
                  </td>
                  <td>{s.row}</td>
                  <td>
                    {s.administration}
                    {s.sector === "azhar" ? " (أزهري)" : ""}
                  </td>
                  <td>
                    {weekdayName(s.weekday)} {s.submitted}
                    {s.late && <span className="badge badge-warning">متأخر</span>}
                  </td>
                  <td>
                    <select value={s.week} aria-label={"أسبوع إرسال صف " + s.row} onChange={(e) => onChange(s.row, { week: e.target.value })}>
                      {weeks.sort().map((w) => (
                        <option key={w} value={w}>
                          {weekText(w)}
                          {w === s.proposedWeek ? " (المقترح)" : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{s.screened.toLocaleString("ar-EG")}</td>
                  <td>
                    <strong>{statusText[s.status]}</strong>
                    {[...s.reasons, ...s.errors.map((e) => "⚠ " + e), ...s.notes].length > 0 && (
                      <ul className="compact">
                        {s.reasons.map((r, i) => (
                          <li key={"r" + i}>{r}</li>
                        ))}
                        {s.errors.map((r, i) => (
                          <li key={"e" + i} className="error">
                            {r}
                          </li>
                        ))}
                        {s.notes.map((r, i) => (
                          <li key={"n" + i}>{r}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function ImportWizard({
  administrations,
  years,
  programs,
  defaultYear,
  ownAdministration,
}: {
  administrations: Administration[];
  years: SchoolYear[];
  programs: Program[];
  defaultYear: string;
  ownAdministration?: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<{ name: string; sha: string; sheets: Sheet[] } | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [year, setYear] = useState(defaultYear);
  const [loadError, setLoadError] = useState("");
  const [stageError, setStageError] = useState("");
  const [pending, start] = useTransition();
  const ownName = administrations.find((a) => a.id === ownAdministration)?.name_ar;
  const [options, setOptions] = useState<ImportOptions>({
    sector: "column",
    valueMode: "weekly",
    weekRule: "window",
    defaultAdministration: ownName,
  });
  const [overrides, setOverrides] = useState<Record<string, Record<number, Override>>>({});
  const set = (patch: Partial<ImportOptions>) => setOptions((o) => ({ ...o, ...patch }));
  const sheet = file?.sheets[sheetIndex];
  const sheetKey = (file?.sha ?? "") + "|" + sheetIndex;
  const sheetOverrides = useMemo(() => overrides[sheetKey] ?? {}, [overrides, sheetKey]);
  const override = (row: number, o: Override) =>
    setOverrides((all) => ({ ...all, [sheetKey]: { ...(all[sheetKey] ?? {}), [row]: { ...(all[sheetKey]?.[row] ?? {}), ...o } } }));
  const catalog = useMemo(() => {
    const map = new Map<string, Program>();
    for (const p of programs.filter((p) => p.school_year_id === year && p.enabled)) if (!map.has(p.code) || map.get(p.code)!.version < p.version) map.set(p.code, p);
    return [...map.values()];
  }, [programs, year]);
  const result = useMemo(() => {
    if (!sheet) return null;
    try {
      return buildImport(sheet, { ...options, overrides: sheetOverrides }, {
        administrations: administrations.map((a) => a.name_ar),
        programs: catalog,
        allowed: ownName ? [ownName] : undefined,
      });
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [sheet, options, sheetOverrides, administrations, catalog, ownName]);
  const errors = result && "issues" in result ? result.issues.filter((i) => i.level === "error") : [];
  const warnings = result && "issues" in result ? result.issues.filter((i) => i.level === "warning") : [];
  const ready = result && "batches" in result && result.batches.length > 0 && errors.length === 0;

  async function load(f: File) {
    setLoadError("");
    setFile(null);
    if (f.size > MAX_FILE_BYTES) return setLoadError("الملف أكبر من 10 ميجا.");
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const sheets = /\.csv$/i.test(f.name) || f.type === "text/csv" ? readCsv(new TextDecoder().decode(bytes), f.name) : readXlsx(bytes);
      const usable = sheets.filter((s) => s.rows.length > 1);
      if (!usable.length) return setLoadError("الملف فاضي أو مفيهوش شيتات فيها بيانات.");
      setFile({ name: f.name, sha: await sha256Hex(bytes), sheets: usable });
      setSheetIndex(0);
    } catch (e) {
      setLoadError((e as Error).message || "ماقدرناش نقرا الملف.");
    }
  }

  return (
    <section className="card stack import-wizard">
      <h2>1) اختار الملف والعام الدراسي</h2>
      <div className="grid">
        <label>
          ملف Excel ‏(xlsx) أو CSV
          <input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
        </label>
        <label>
          العام الدراسي
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="field-help">
        الملف بيتقري على جهازك للمعاينة الأول، ومفيش حاجة بتتحفظ غير لما تدوس «حفظ في منطقة التجهيز». ممنوع ملفات فيها أسماء أو بيانات شخصية للطلبة —
        السيستم بياخد الأعداد المجمّعة بس.
      </p>
      {loadError && (
        <p className="flash flash-error" role="alert">
          {loadError}
        </p>
      )}
      {file && (
        <>
          <h2>2) إعدادات القراءة</h2>
          <div className="grid">
            <label>
              الشيت
              <select value={sheetIndex} onChange={(e) => setSheetIndex(Number(e.target.value))}>
                {file.sheets.map((s, i) => (
                  <option key={i} value={i}>
                    {s.name} ({(s.rows.length - 1).toLocaleString("ar-EG")} صف)
                  </option>
                ))}
              </select>
            </label>
            <label>
              القطاع
              <select value={options.sector} onChange={(e) => set({ sector: e.target.value as ImportOptions["sector"] })}>
                <option value="column">
                  تلقائي من اسم الشيت أو عمود القطاع
                  {sheet && detectSector(sheet.name) ? ` (${detectSector(sheet.name) === "azhar" ? "أزهري" : "عام"})` : ""}
                </option>
                <option value="general">عام</option>
                <option value="azhar">أزهري</option>
              </select>
            </label>
            <label>
              نوع الأرقام في الملف
              <select value={options.valueMode} onChange={(e) => set({ valueMode: e.target.value as ImportOptions["valueMode"] })}>
                <option value="weekly">أعداد الأسبوع الجديدة بس</option>
                <option value="cumulative">تراكمي من أول السنة (هنحسب الفرق لكل أسبوع)</option>
              </select>
            </label>
            <label>
              الأسبوع من تاريخ الإرسال
              <select value={options.weekRule} onChange={(e) => set({ weekRule: e.target.value as ImportOptions["weekRule"] })}>
                <option value="window">زي الفورم: من الأربع للتلات اللي بعده = الأسبوع اللي بدأ قبله (موصى به)</option>
                <option value="previous">دايمًا الأسبوع اللي قبل أسبوع الإرسال</option>
                <option value="same">دايمًا نفس أسبوع الإرسال</option>
              </select>
            </label>
            {!ownName && (
              <label>
                الإدارة (لو الملف مفيهوش عمود إدارة)
                <select value={options.defaultAdministration ?? ""} onChange={(e) => set({ defaultAdministration: e.target.value || undefined })}>
                  <option value="">من عمود الإدارة في الملف</option>
                  {administrations.map((a) => (
                    <option key={a.id} value={a.name_ar}>
                      {a.name_ar}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              أسبوع البلاغ (لو الملف مفيهوش تاريخ)
              <input type="date" value={options.defaultWeek ?? ""} onChange={(e) => set({ defaultWeek: e.target.value || undefined })} />
            </label>
          </div>

          <h2>3) المعاينة والمراجعة</h2>
          {result && "error" in result && (
            <p className="flash flash-error" role="alert">
              {result.error}
            </p>
          )}
          {result && "plan" in result && (
            <>
              <details>
                <summary>
                  مطابقة الأعمدة ({result.plan.columns.filter((c) => c.meaning.kind !== "unknown").length.toLocaleString("ar-EG")} عمود متفهوم من{" "}
                  {result.plan.columns.filter((c) => c.header.trim()).length.toLocaleString("ar-EG")})
                </summary>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>عنوان العمود في الملف</th>
                        <th>اتفهم على إنه</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.plan.columns
                        .filter((c) => c.header.trim())
                        .map((c) => (
                          <tr key={c.index} className={c.meaning.kind === "unknown" ? "row-muted" : undefined}>
                            <td>{c.header}</td>
                            <td>{result.plan.format === "long" ? "صيغة الأعمدة القياسية" : meaningText(c.meaning)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </details>
              {result.submissions.length > 0 && <SubmissionTable list={result.submissions} onChange={override} />}
              {errors.length > 0 && (
                <div className="flash flash-error" role="alert">
                  <strong>لازم تتصلّح قبل الحفظ ({errors.length.toLocaleString("ar-EG")}):</strong>
                  <ul>
                    {errors.slice(0, 30).map((i, n) => (
                      <li key={n}>
                        {i.row ? `صف ${i.row}: ` : ""}
                        {i.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {warnings.length > 0 && (
                <details className="flash flash-warning" open={warnings.length <= 5}>
                  <summary>ملاحظات للمراجعة ({warnings.length.toLocaleString("ar-EG")})</summary>
                  <ul>
                    {warnings.slice(0, 60).map((i, n) => (
                      <li key={n}>{i.message}</li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>الإدارة</th>
                      <th>الأسابيع</th>
                      <th>إجمالي المفحوصين</th>
                      <th>صفوف البيانات</th>
                      <th>مستهدفات (اقتراح)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.batches.map((b) => (
                      <tr key={b.administration}>
                        <td>{b.administration}</td>
                        <td>{b.weeks.join("، ") || "—"}</td>
                        <td>{b.screened.toLocaleString("ar-EG")}</td>
                        <td>{b.rows.filter((r) => r.indicator !== "target").length.toLocaleString("ar-EG")}</td>
                        <td>{b.rows.filter((r) => r.indicator === "target").length.toLocaleString("ar-EG")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!result.batches.length && <p className="empty">مفيش بيانات صالحة في الشيت ده.</p>}
              </div>
              <p className="field-help">
                كل إدارة بتتحفظ في دفعة لوحدها، والعام والأزهري مفصولين. الحفظ هنا مش بيغيّر أي رقم رسمي؛ بعده هتشوف مقارنة بالأرقام الحالية وتقرر تحوّلها
                لمسودات بلاغات.
              </p>
              {stageError && (
                <p className="flash flash-error" role="alert">
                  {stageError}
                </p>
              )}
              <button
                type="button"
                disabled={!ready || pending}
                onClick={() =>
                  start(async () => {
                    setStageError("");
                    if (!result || !("batches" in result)) return;
                    const ids = new Map(administrations.map((a) => [a.name_ar, a.id]));
                    const response = await stageImportBatches(
                      JSON.stringify({
                        year,
                        source_name: file.name.slice(0, 200),
                        source_sha256: file.sha,
                        value_mode: options.valueMode,
                        week_rule: options.weekRule,
                        sheet: sheet!.name.slice(0, 120),
                        batches: result.batches.map((b) => ({ administration_id: ids.get(b.administration), rows: b.rows })),
                      }),
                    );
                    if (response.ok) router.push("/imports?msg=staged");
                    else setStageError((errorMessages[response.code ?? "GENERIC"] ?? errorMessages.GENERIC) + (response.staged ? ` (اتحفظ ${response.staged} دفعة قبل المشكلة)` : ""));
                  })
                }
              >
                {pending ? "جارٍ الحفظ…" : "حفظ في منطقة التجهيز"}
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
