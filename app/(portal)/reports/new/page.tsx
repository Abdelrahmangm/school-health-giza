import { dataset, session } from "@/lib/data";
import { authorize, weekFor } from "@/lib/domain";
import { ReportForm } from "@/components/report-form";
export default async function NewReport({
  searchParams,
}: {
  searchParams: Promise<{ submission?: string }>;
}) {
  const { profile } = await session();
  authorize(profile, true);
  const d = await dataset();
  const p = await searchParams;
  const s = d.submissions.find((s) => s.id === p.submission);
  return (
    <>
      <h1>{s ? "اقتراح نسخة تعديل" : "إنشاء بلاغ أسبوعي"}</h1>
      <p className="muted">تظل النسخة المعتمدة رسمية حتى اعتماد التعديل.</p>
      <ReportForm
        {...d}
        initial={
          s
            ? d.lines.filter((l) => l.revision_id === s.official_revision_id)
            : []
        }
        administration={
          s?.administration_id || profile.administration_id || undefined
        }
        year={s?.school_year_id}
        week={s?.week_start || weekFor(new Date().toISOString())}
      />
    </>
  );
}
