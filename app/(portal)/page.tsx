import Link from "next/link";
import { facts, filters, reference, session, submissionPage, targetsFor } from "@/lib/data";
import { aggregateFacts, labels, type FactSet } from "@/lib/domain";
import { FilterForm } from "@/components/filters";
import { UiIcon } from "@/components/portal-nav";
import { Flash } from "@/components/flash";
import { AreaChart, Gauge, Radar, Sparkline } from "@/components/charts";

const fmt = (value: number) => value.toLocaleString("ar-EG", { maximumFractionDigits: 1 });
const percent = (value: number | null) => (value === null ? "—" : fmt(value) + "٪");
const dm = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d.toLocaleString("ar-EG")}/${m.toLocaleString("ar-EG")}`;
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ profile }, ref, params] = await Promise.all([session(), reference(), searchParams]);
  const f = filters(params, ref.years);
  // One weekly query feeds the totals, the weekly chart and every administration's trend.
  const [data, targets, latest] = await Promise.all([
    facts(f, true),
    targetsFor(f.year),
    submissionPage({ year: f.year, administration: f.administration, page: 1, size: 4 }),
  ]);
  const m = aggregateFacts(data, targets, f);
  const weeks = [...new Set(data.facts.map((x) => x.w).filter((w): w is string => !!w))]
    .filter((w) => (!f.from || w >= f.from) && (!f.to || w <= f.to))
    .sort();
  const forWeek = (set: FactSet, w: string): FactSet => ({ facts: set.facts.filter((x) => x.w === w), reports: [] });
  const weekly = weeks.map((w) => aggregateFacts(forWeek(data, w), [], f).screened);
  const yearLabel = ref.years.find((y) => y.id === f.year)?.label ?? "";
  const ranking = ref.administrations
    .filter((a) => !f.administration || a.id === f.administration)
    .map((a) => {
      const own = { ...f, administration: a.id };
      return {
        id: a.id,
        name: a.name_ar,
        values: aggregateFacts(data, targets, own),
        trend: weeks.map((w) => aggregateFacts(forWeek(data, w), [], own).screened),
      };
    })
    .sort((x, y) => (y.values.achievement ?? -1) - (x.values.achievement ?? -1) || y.values.screened - x.values.screened);
  const topRates = Object.entries(m.rates)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => ({ label: labels[k] || k, value: v as number }))
    .sort((a, b) => b.value - a.value);
  const recent = latest.rows.flatMap((s) => {
    const revision = [...s.submission_revisions].sort((a, b) => b.revision_number - a.revision_number)[0];
    return revision ? [{ submission: s, revision }] : [];
  });
  const adminName = (id: string) => ref.administrations.find((a) => a.id === id)?.name_ar || "إدارة غير معروفة";
  const canWrite = profile.role !== "directorate_viewer";
  const hues = ["teal", "coral", "mustard"];

  return (
    <div className="dash">
      <div className="dash-grid">
        {/* Column 1 */}
        <section className="dash-col">
          <Flash params={params} />
          <div className="teal-card metric">
            <div className="teal-card-top">
              <span className="chip" aria-hidden="true" />
              <span className="wave" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M8 8.5a5 5 0 0 1 0 7 M12 6a8.5 8.5 0 0 1 0 12 M16 3.5a12 12 0 0 1 0 17" />
                </svg>
              </span>
            </div>
            <span className="teal-card-label">المفحوصين خلال الفترة</span>
            <strong>{fmt(m.screened)}</strong>
            <div className="teal-card-foot">
              <span>
                {labels[f.program] || f.program} · {labels[f.sector] || f.sector}
              </span>
              <span>{yearLabel}</span>
            </div>
          </div>
          {canWrite ? (
            <Link href="/reports/new" className="coral-card">
              <span className="coral-icon">
                <UiIcon name="file" size={30} stroke={1.5} />
                <span className="coral-plus">+</span>
              </span>
              <span>
                <b>سجّل بلاغ الأسبوع وتابع الإنجاز.</b>
                <small>
                  بلاغ جديد <UiIcon name="arrow" size={15} />
                </small>
              </span>
            </Link>
          ) : (
            <Link href="/analytics" className="coral-card">
              <span className="coral-icon">
                <UiIcon name="analytics" size={30} stroke={1.5} />
              </span>
              <span>
                <b>شوف تقارير الإدارات والمؤشرات.</b>
                <small>
                  التقارير <UiIcon name="arrow" size={15} />
                </small>
              </span>
            </Link>
          )}
          <div className="quick-tiles">
            {[
              { href: "/targets", icon: "targets", label: "المستهدفات" },
              { href: canWrite ? "/imports" : "/reports", icon: canWrite ? "imports" : "reports", label: canWrite ? "الاستيراد" : "البلاغات" },
              { href: "/analytics", icon: "export", label: "التصدير" },
            ].map((t) => (
              <Link key={t.href} href={t.href} className="quick-tile">
                <span className="quick-icon">
                  <UiIcon name={t.icon} size={30} stroke={1.4} />
                </span>
                <b>{t.label}</b>
                <span className="quick-plus" aria-hidden="true">
                  <UiIcon name="plus" size={13} stroke={2} />
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Column 2 */}
        <section className="dash-col dash-col-mid">
          <Gauge value={m.achievement} title="نسبة الإنجاز" caption="من المستهدف السنوي المعتمد" />
          <div className="panel">
            <div className="panel-head">
              <h2>المفحوصين أسبوع بأسبوع</h2>
            </div>
            <AreaChart series={weekly} labels={weeks.map(dm)} title="عدد المفحوصين في كل أسبوع" />
          </div>
          <div className="panel">
            <div className="panel-head">
              <h2>أحدث البلاغات</h2>
              <Link href="/reports" aria-label="كل البلاغات" className="arrow-link">
                <UiIcon name="arrow" size={20} />
              </Link>
            </div>
            {recent.length ? (
              <div className="tx-list">
                {recent.map(({ submission, revision }) => (
                  <Link key={revision.id} href={"/reports/" + revision.id} className="tx">
                    <span className="tx-icon">
                      <UiIcon name="reports" size={18} />
                    </span>
                    <span className="tx-main">
                      <small>أسبوع {dm(submission.week_start)}</small>
                      <b>{adminName(submission.administration_id)}</b>
                    </span>
                    <span className={"tx-status s-" + revision.status}>{labels[revision.status] || revision.status}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="empty small">لسه مفيش بلاغات للعام ده.</p>
            )}
          </div>
        </section>

        {/* Column 3 */}
        <section className="dash-col dash-col-end">
          <div className="split">
            <div className="split-cell">
              <div className="panel-head">
                <h2>
                  أعلى
                  <br />
                  المؤشرات
                </h2>
                <Link href="/analytics" aria-label="كل المؤشرات" className="arrow-link">
                  <UiIcon name="arrow" size={20} />
                </Link>
              </div>
              <Radar items={topRates} />
            </div>
            <div className="split-cell">
              <div className="panel-head">
                <h2>المستهدف</h2>
              </div>
              <span className="round-icon coral">
                <UiIcon name="targets" size={20} />
              </span>
              <div className="metric target-figure">
                <strong>{fmt(m.target)}</strong>
              </div>
              <span className="up">
                <UiIcon name="trend" size={15} /> {percent(m.achievement)} <small>إنجاز</small>
              </span>
            </div>
          </div>
          <div className="panel">
            <div className="panel-head">
              <h2>ترتيب الإدارات</h2>
              <Link href="/analytics" aria-label="مقارنة كل الإدارات" className="arrow-link">
                <UiIcon name="arrow" size={20} />
              </Link>
            </div>
            {ranking.length ? (
              <ol className="rank">
                {ranking.slice(0, 6).map((a, i) => (
                  <li key={a.id}>
                    <span className={"rank-badge " + hues[i % 3]}>{a.name.replace(/^ال/, "").slice(0, 1)}</span>
                    <span className="rank-name">
                      <b>{a.name}</b>
                      <small>{fmt(a.values.screened)} مفحوص</small>
                    </span>
                    <span className="rank-num">
                      <b>{percent(a.values.achievement)}</b>
                      <small>{fmt(a.values.target)}</small>
                    </span>
                    <Sparkline values={a.trend} label={"اتجاه " + a.name} />
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty small">مفيش إدارات متاحة للحساب ده.</p>
            )}
          </div>
        </section>
      </div>

      <section className="dash-wide">
        <details className="filter-panel">
          <summary>
            <UiIcon name="analytics" size={16} /> تصفية: {yearLabel} · {labels[f.program] || f.program} · {labels[f.sector] || f.sector} ·{" "}
            {f.mode === "official" ? "المعتمد بس" : "الأولي المنتظر"}
          </summary>
          <FilterForm {...ref} value={f} />
        </details>
        <div className="panel">
          <div className="panel-head">
            <h2>نتايج المؤشرات الطبية</h2>
            <Link href="/analytics" className="arrow-link" aria-label="التقارير">
              <UiIcon name="arrow" size={20} />
            </Link>
          </div>
          {Object.keys(m.findings).length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>المؤشر</th>
                    <th>العدد</th>
                    <th>النسبة من المفحوصين</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(m.findings)
                    .sort((a, b) => b[1] - a[1])
                    .map(([key, value]) => (
                      <tr key={key}>
                        <td>{labels[key] || key}</td>
                        <td>{fmt(value)}</td>
                        <td>{percent(m.rates[key])}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty small">مفيش مؤشرات متسجلة في الفترة دي.</p>
          )}
          <small className="muted">
            الطفل ممكن يتسجل في أكتر من مؤشر، فمجموع المؤشرات مش عدد أطفال. {f.mode === "official" ? "الأرقام دي المعتمدة بس." : "دي أرقام أولية لسه مستنية الاعتماد."}
          </small>
        </div>
      </section>
    </div>
  );
}
