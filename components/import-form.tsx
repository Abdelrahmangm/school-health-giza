"use client";
import { useEffect, useState } from "react";
import { previewImport, type Administration } from "@/lib/domain";
import { stageImport } from "@/app/actions";
export function ImportForm({
  administrations,
}: {
  administrations: Administration[];
}) {
  const [source, setSource] = useState(
    "week,program,sector,grade,indicator,count\n",
  );
  const [preview, setPreview] = useState<ReturnType<
    typeof previewImport
  > | null>(null);
  const [error, setError] = useState("");
  // Mark client interactivity ready so forms cannot be exercised before hydration.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return (
    <form action={stageImport} className="card stack" data-hydrated={hydrated ? "true" : "false"}>
      <label>
        الإدارة الموحّدة
        <select name="administration_id" required>
          {administrations.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name_ar}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">
        اختر الإدارة من القائمة بدل الاعتماد على تهجئة اسمها في المصدر. لا تضع
        أسماء أو بيانات شخصية. الصيغة المحددة أعلاه فقط؛ لا يوجد ربط مباشر
        بمصادر Google Sheets.
      </p>
      <label>اختار ملف CSV من جهازك (اختياري، أو انسخ محتواه تحت)
        <input type="file" accept=".csv,text/csv" onChange={async (event)=>{const file=event.target.files?.[0]; if(!file) return; if(file.size>100000){setError("الملف كبير جدًا؛ الحد الأقصى 100 كيلوبايت.");return;} const content=await file.text();setSource(content.replace(/^\uFEFF/,""));setPreview(null);setError("");}} />
      </label>
      <label>
        CSV مجمّع (500 صف بحد أقصى)
        <textarea
          name="csv"
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setPreview(null);
          }}
          dir="ltr"
          maxLength={100000}
        />
      </label>
      <button
        type="button"
        className="secondary"
        onClick={() => {
          try {
            setPreview(previewImport(source));
            setError("");
          } catch (e) {
            setError((e as Error).message);
            setPreview(null);
          }
        }}
      >
        معاينة والتحقق
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <>
          <p>
            صفوف صالحة: {preview.rows.length} · تحذيرات:{" "}
            {preview.warnings.length}
          </p>
          {preview.warnings.map((w, i) => (
            <p key={i} className="error">
              {w}
            </p>
          ))}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الأسبوع</th>
                  <th>البرنامج</th>
                  <th>القطاع</th>
                  <th>الصف</th>
                  <th>المؤشر</th>
                  <th>العدد</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.week}</td>
                    <td>{r.program}</td>
                    <td>{r.sector}</td>
                    <td>{r.grade}</td>
                    <td>{r.indicator}</td>
                    <td>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            disabled={preview.warnings.length > 0 || preview.rows.length === 0}
          >
            حفظ في منطقة التجهيز فقط
          </button>
        </>
      )}
    </form>
  );
}
