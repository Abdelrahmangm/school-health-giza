import { notFound } from "next/navigation";
import { linesOf, reference, session } from "@/lib/data";
import { authorize, latestPrograms, weekFor } from "@/lib/domain";
import { ReportForm } from "@/components/report-form";
export default async function NewReport({ searchParams }: { searchParams: Promise<{ submission?: string }> }) {
  const [{ profile, db }, ref, p] = await Promise.all([session(), reference(), searchParams]);
  authorize(profile, true);
  let s: { id: string; administration_id: string; school_year_id: string; week_start: string; official_revision_id: string | null } | null = null;
  if (p.submission) {
    const { data } = await db
      .from("weekly_submissions")
      .select("id,administration_id,school_year_id,week_start,official_revision_id")
      .eq("id", p.submission)
      .maybeSingle();
    if (!data) notFound();
    s = data;
  }
  const initial = await linesOf(s?.official_revision_id ?? null);
  return (
    <>
      <h1>{s ? "اقتراح نسخة تعديل" : "إنشاء بلاغ أسبوعي"}</h1>
      <p className="muted">النسخة المعتمدة بتفضل هي الرسمية لحد ما التعديل يتعتمد.</p>
      <ReportForm
        administrations={ref.administrations}
        years={ref.years}
        programs={latestPrograms(ref.programs).filter((x) => x.enabled)}
        initial={initial}
        administration={s?.administration_id || profile.administration_id || undefined}
        year={s?.school_year_id}
        week={s?.week_start || weekFor(new Date().toISOString())}
      />
    </>
  );
}
