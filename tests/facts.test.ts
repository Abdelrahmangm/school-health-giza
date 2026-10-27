import { describe, it, expect } from "vitest";
import { aggregate, aggregateFacts, type Fact, type FactSet, type Filters, type Line, type Revision, type Submission, type Target } from "../lib/domain";

// Mirrors public.report_facts so the fast path is checked against the original aggregate().
function facts(submissions: Submission[], revisions: Revision[], lines: Line[], year: string, mode: "official" | "pending", byWeek: boolean): FactSet {
  const sel = submissions
    .filter((s) => s.school_year_id === year)
    .flatMap((s) => revisions.filter((r) => r.submission_id === s.id && (mode === "official" ? r.id === s.official_revision_id : r.status === "provisional")).map((r) => ({ s, r })));
  const map = new Map<string, Fact>();
  for (const { s, r } of sel)
    for (const l of lines.filter((l) => l.revision_id === r.id)) {
      const w = byWeek ? s.week_start : null;
      const k = [s.administration_id, w, l.program_code, l.sector, l.grade_code].join("|");
      const x = map.get(k) ?? { a: s.administration_id, w, p: l.program_code!, s: l.sector, g: l.grade_code, n: 0, f: {} };
      x.n += l.screened;
      for (const [i, v] of Object.entries(l.findings)) x.f[i] = (x.f[i] ?? 0) + v;
      map.set(k, x);
    }
  return { facts: [...map.values()], reports: sel.map(({ s }) => ({ a: s.administration_id, w: s.week_start })) };
}

function rand(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

describe("aggregateFacts equals aggregate", () => {
  it("for random DEMO data across modes, sectors, programs, grades, administrations and periods", () => {
    const r = rand(7);
    const admins = ["A", "B", "C"];
    const weeks = ["2026-09-06", "2026-09-13", "2026-09-20", "2026-09-27"];
    const submissions: Submission[] = [];
    const revisions: Revision[] = [];
    const lines: Line[] = [];
    let id = 0;
    for (const a of admins)
      for (const w of weeks) {
        const s: Submission = { id: "s" + ++id, administration_id: a, school_year_id: "y", week_start: w, official_revision_id: null, reopened_until: null, reopen_reason: null };
        submissions.push(s);
        const statuses = r() < 0.5 ? ["superseded", "approved", "provisional"] : ["approved"];
        statuses.forEach((status, n) => {
          const rev: Revision = { id: "r" + ++id, submission_id: s.id, revision_number: n + 1, status, submitted_at: null, review_comment: null, created_at: "" };
          revisions.push(rev);
          if (status === "approved") s.official_revision_id = rev.id;
          for (const [p, grades] of [["comprehensive", ["kg1", "primary1"]], ["vision", ["kg2"]]] as const)
            for (const sector of ["general", "azhar"] as const)
              for (const g of grades) {
                const screened = Math.floor(r() * 100);
                lines.push({ revision_id: rev.id, program_version_id: p, program_code: p, sector, grade_code: g, screened, findings: { anemia: Math.floor(r() * screened) } });
              }
        });
      }
    const targets: Target[] = admins.flatMap((a, i) => [
      { id: "t" + i, administration_id: a, school_year_id: "y", program_version_id: "p", program_code: "comprehensive", sector: "general", grade_code: "kg1", target_count: 500, version: 1, status: "superseded", effective_at: "2026-09-01T00:00:00Z", review_comment: null },
      { id: "u" + i, administration_id: a, school_year_id: "y", program_version_id: "p", program_code: "comprehensive", sector: "general", grade_code: "kg1", target_count: 900, version: 2, status: "approved", effective_at: "2026-09-20T00:00:00Z", review_comment: null },
    ]);
    for (const mode of ["official", "pending"] as const)
      for (const sector of ["general", "azhar", "combined"])
        for (const program of ["comprehensive", "vision"])
          for (const grade of ["", "kg1", "kg2"])
            for (const administration of ["", "B"])
              for (const [from, to] of [["", ""], ["2026-09-13", "2026-09-20"]]) {
                const f: Filters = { year: "y", mode, sector, program, grade, administration, from, to, asOf: to ? "2026-09-26T21:59:59.999Z" : undefined };
                const expected = aggregate(submissions, revisions, lines, targets, f);
                const got = aggregateFacts(facts(submissions, revisions, lines, "y", mode, Boolean(from)), targets, f);
                expect({ ...got }).toEqual({ screened: expected.screened, target: expected.target, achievement: expected.achievement, findings: expected.findings, rates: expected.rates, reportCount: expected.reportCount });
              }
  });
});
