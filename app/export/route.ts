import { NextResponse, type NextRequest } from "next/server";
import { session, payload, reference, filters } from "@/lib/data";
import type { Filters } from "@/lib/domain";
import { aggregate, csv, labels } from "@/lib/domain";
export async function GET(req: NextRequest) {
  const { db } = await session();
  if (req.nextUrl.searchParams.get("format") === "ministry")
    return NextResponse.json(
      { error: "MINISTRY_MAPPING_NOT_VERIFIED" },
      { status: 409 },
    );
  let d: Awaited<ReturnType<typeof payload>>;
  let f: Filters;
  const snapshot = req.nextUrl.searchParams.get("snapshot");
  if (snapshot) {
    const { data, error } = await db
      .from("report_snapshots")
      .select("filters,payload")
      .eq("id", snapshot)
      .single();
    if (error || !data)
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    d = data.payload;
    f = data.filters;
  } else {
    const ref = await reference();
    f = filters(Object.fromEntries(req.nextUrl.searchParams), ref.years);
    // Filtered in PostgreSQL under the caller's RLS instead of downloading every table.
    d = await payload(f);
  }
  const m = aggregate(d.submissions, d.revisions, d.lines, d.targets, f);
  const rows: unknown[][] = [
    [
      "تصدير تحليلي — ليس نموذج الوزارة",
      "الحالة",
      f.mode === "official" ? "رسمي معتمد" : "أولي غير معتمد",
    ],
    [
      "نوع السجل",
      "العام",
      "الإدارة",
      "أسبوع الأحد",
      "البرنامج",
      "القطاع",
      "الصف",
      "المؤشر",
      "العدد",
    ],
  ];
  for (const l of m.rows) {
    const r = d.revisions.find((r) => r.id === l.revision_id)!;
    const s = d.submissions.find((s) => s.id === r.submission_id)!;
    const dimensions = [
      d.years.find((y) => y.id === f.year)?.label,
      d.administrations.find((a) => a.id === s.administration_id)?.name_ar,
      s.week_start,
      labels[l.program_code!] || l.program_code,
      labels[l.sector],
      labels[l.grade_code] || l.grade_code,
    ];
    rows.push(["فحص", ...dimensions, "المفحوصون", l.screened]);
    for (const [indicator, count] of Object.entries(l.findings))
      rows.push([
        "نتيجة مؤشر",
        ...dimensions,
        labels[indicator] || indicator,
        count,
      ]);
  }
  rows.push(
    ["ملخص المفحوصين", m.screened],
    ["المستهدف السنوي (مرة واحدة فقط)", m.target],
    ["تنبيه", "نتائج المؤشرات متداخلة؛ لا تُجمع مع سجلات الفحص"],
  );
  return new Response(csv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="school-health-analytics.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
