import { describe, it, expect } from "vitest";
import {
  weekFor,
  expectedWeeks,
  deadline,
  canEdit,
  authorize,
  aggregate,
  linesSchema,
  csv,
  ministryExport,
  previewImport,
  latestPrograms,
  type Filters,
  type Submission,
  type Revision,
  type Line,
  type Target,
  type Program,
} from "../lib/domain";
describe("Cairo reporting interval and cutoff", () => {
  it("changes weeks at Sunday midnight Cairo", () => {
    expect(weekFor("2026-10-24T20:59:00Z")).toBe("2026-10-18");
    expect(weekFor("2026-10-24T21:00:00Z")).toBe("2026-10-25");
  });
  it("uses Cairo timezone on both sides of DST", () => {
    expect(deadline("2026-10-18")).toBe("2026-10-25T13:00:00Z");
    expect(deadline("2026-10-25")).toBe("2026-11-01T14:00:00Z");
  });
  it("allows one minute before and denies at/after 16:00", () => {
    expect(
      canEdit(
        "administration_data_entry",
        "2026-10-25",
        "2026-11-01T13:59:00Z",
      ),
    ).toBe(true);
    expect(
      canEdit(
        "administration_data_entry",
        "2026-10-25",
        "2026-11-01T14:00:00Z",
      ),
    ).toBe(false);
    expect(
      canEdit(
        "administration_data_entry",
        "2026-10-25",
        "2026-11-01T14:01:00Z",
      ),
    ).toBe(false);
  });
  it("checks reopen expiry and viewer restriction", () => {
    expect(
      canEdit(
        "administration_data_entry",
        "2026-10-25",
        "2026-11-02T14:00:00Z",
        "2026-11-03T14:00:00Z",
      ),
    ).toBe(true);
    expect(
      canEdit(
        "administration_data_entry",
        "2026-10-25",
        "2026-11-03T14:00:00Z",
        "2026-11-03T14:00:00Z",
      ),
    ).toBe(false);
    expect(
      canEdit("directorate_viewer", "2026-10-25", "2026-10-25T00:00:00Z"),
    ).toBe(false);
  });
  it("rejects non Sunday dates", () =>
    expect(() => deadline("2026-10-26")).toThrow());
});
const f: Filters = {
  year: "y",
  mode: "official",
  sector: "general",
  program: "comprehensive",
  grade: "",
  administration: "",
  from: "",
  to: "",
};
const submissions: Submission[] = [
  {
    id: "s",
    administration_id: "a",
    school_year_id: "y",
    week_start: "2026-10-25",
    official_revision_id: "r1",
    reopened_until: null,
    reopen_reason: null,
  },
];
const revisions: Revision[] = [
  {
    id: "r1",
    submission_id: "s",
    revision_number: 1,
    status: "approved",
    submitted_at: null,
    review_comment: null,
    created_at: "",
  },
  {
    id: "r2",
    submission_id: "s",
    revision_number: 2,
    status: "provisional",
    submitted_at: null,
    review_comment: null,
    created_at: "",
  },
];
const lines: Line[] = [
  {
    revision_id: "r1",
    program_version_id: "p",
    program_code: "comprehensive",
    sector: "general",
    grade_code: "primary1",
    screened: 10,
    findings: { anemia: 8, dental: 7 },
  },
  {
    revision_id: "r1",
    program_version_id: "p",
    program_code: "comprehensive",
    sector: "azhar",
    grade_code: "primary1",
    screened: 20,
    findings: {},
  },
  {
    revision_id: "r1",
    program_version_id: "v",
    program_code: "vision",
    sector: "general",
    grade_code: "kg2",
    screened: 100,
    findings: {},
  },
  {
    revision_id: "r2",
    program_version_id: "p",
    program_code: "comprehensive",
    sector: "general",
    grade_code: "primary1",
    screened: 30,
    findings: { anemia: 5 },
  },
];
const targets: Target[] = [
  {
    id: "t1",
    administration_id: "a",
    school_year_id: "y",
    program_version_id: "p",
    program_code: "comprehensive",
    sector: "general",
    grade_code: "primary1",
    target_count: 100,
    version: 1,
    status: "approved",
    effective_at: "2026-10-01T00:00:00.000Z",
    review_comment: null,
  },
  {
    id: "t2",
    administration_id: "a",
    school_year_id: "y",
    program_version_id: "p",
    program_code: "comprehensive",
    sector: "general",
    grade_code: "primary1",
    target_count: 200,
    version: 2,
    status: "proposed",
    effective_at: null,
    review_comment: null,
  },
];
const calc = (opts: Partial<Filters> = {}) =>
  aggregate(submissions, revisions, lines, targets, { ...f, ...opts });
describe("official/provisional analytics and annual targets", () => {
  it("keeps sectors separate unless combined requested", () => {
    expect(calc().screened).toBe(10);
    expect(calc({ sector: "azhar" }).screened).toBe(20);
    expect(calc({ sector: "combined" }).screened).toBe(30);
  });
  it("never includes kg2 vision in comprehensive denominator", () => {
    expect(calc().screened).toBe(10);
    expect(calc({ program: "vision" }).screened).toBe(100);
  });
  it("keeps proposed revision out of official totals", () => {
    expect(calc().screened).toBe(10);
    expect(calc({ mode: "pending" }).screened).toBe(30);
  });
  it("replaces official revision instead of adding", () => {
    expect(
      aggregate(
        [{ ...submissions[0], official_revision_id: "r2" }],
        revisions,
        lines,
        targets,
        f,
      ).screened,
    ).toBe(30);
  });
  it("does not sum overlapping disease findings into unique children", () => {
    const a = calc();
    expect(a.screened).toBe(10);
    expect(a.rates.anemia).toBe(80);
    expect(a.findings.dental).toBe(7);
  });
  it("does not include unapproved target changes", () =>
    expect(calc().target).toBe(100));
  it("counts annual target once across multiple weeks", () => {
    const s2 = {
      ...submissions[0],
      id: "s2",
      week_start: "2026-11-01",
      official_revision_id: "r3",
    };
    const r3 = { ...revisions[0], id: "r3", submission_id: "s2" };
    const l3 = { ...lines[0], revision_id: "r3" };
    const result = aggregate(
      [...submissions, s2],
      [...revisions, r3],
      [...lines, l3],
      targets,
      f,
    );
    expect(result.screened).toBe(20);
    expect(result.target).toBe(100);
  });
  it("uses effective target history for a prior snapshot", () => {
    const history = [
      { ...targets[0], status: "superseded" },
      {
        ...targets[1],
        status: "approved",
        effective_at: "2026-11-01T00:00:00.000Z",
      },
    ];
    expect(
      aggregate(submissions, revisions, lines, history, {
        ...f,
        asOf: "2026-10-31T23:59:59.000Z",
      }).target,
    ).toBe(100);
    expect(aggregate(submissions, revisions, lines, history, f).target).toBe(
      200,
    );
  });
  it("preserves historical program when next year disabled", () => {
    const p = {
      id: "p",
      school_year_id: "y",
      code: "vision",
      name_ar: "test",
      version: 1,
      enabled: true,
      grades: ["kg2"],
      indicators: [],
    } as Program;
    const next = { ...p, id: "p2", school_year_id: "y2", enabled: false };
    expect(
      latestPrograms([p, next]).find((p) => p.school_year_id === "y")?.enabled,
    ).toBe(true);
  });
});
describe("server input and export safeguards", () => {
  it("denies viewer writes and cross-administration writes", () => {
    expect(() =>
      authorize(
        { user_id: "u", role: "directorate_viewer", administration_id: null },
        true,
      ),
    ).toThrow("FORBIDDEN");
    expect(() =>
      authorize(
        {
          user_id: "u",
          role: "administration_data_entry",
          administration_id: "a",
        },
        true,
        "b",
      ),
    ).toThrow("FORBIDDEN");
  });
  it("rejects negative, fractional, excessive and unknown identifying fields", () => {
    const row = {
      program_version_id: "00000000-0000-4000-8000-000000000001",
      sector: "general",
      grade_code: "primary1",
      screened: 10,
      findings: { anemia: 2 },
    };
    expect(linesSchema.safeParse([row]).success).toBe(true);
    for (const bad of [
      { ...row, screened: -1 },
      { ...row, screened: 1.5 },
      { ...row, findings: { anemia: 11 } },
      { ...row, patient_name: "x" },
    ])
      expect(linesSchema.safeParse([bad]).success).toBe(false);
    expect(linesSchema.safeParse([row, row]).success).toBe(false);
  });
  it("escapes CSV cells and formula injection", () => {
    expect(csv([['=HYPERLINK("x")', "a,b", 'a"b']])).toContain(
      '"\'=HYPERLINK(""x"")"',
    );
    expect(csv([["a,b"]])).toBe('\uFEFF"a,b"');
  });
  it("refuses ministry export without verified workbook mapping", () =>
    expect(() => ministryExport()).toThrow("MINISTRY_MAPPING_NOT_VERIFIED"));
  it("previews valid import and flags duplicates and invalid counts", () => {
    const head = "week,program,sector,grade,indicator,count\n";
    const row = "2026-10-25,comprehensive,general,primary1,anemia,5";
    const result = previewImport(
      head + row + "\n" + row + "\n2026-10-25,vision,general,kg2,ptosis,NaN",
    );
    expect(result.rows).toHaveLength(1);
    expect(result.warnings).toHaveLength(2);
  });
  it("rejects identifying columns and unsupported grade combinations", () => {
    expect(() => previewImport("patient_name,count\nDEMO,5")).toThrow();
    expect(
      previewImport(
        "week,program,sector,grade,indicator,count\n2026-10-25,comprehensive,general,kg2,anemia,5",
      ).warnings,
    ).toHaveLength(1);
  });
});

describe("weekly completeness", () => {
  it("includes missing weeks but not future weeks", () => {
    expect(
      expectedWeeks(
        {
          id: "y",
          label: "test",
          starts_on: "2026-10-01",
          ends_on: "2027-08-31",
        },
        "",
        "",
        "2026-10-26T12:00:00Z",
      ),
    ).toEqual(["2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25"]);
  });
});

it("handles configurable indicator names without prototype collisions", () => {
  const custom = { ...lines[0], findings: { constructor: 2 } };
  expect(
    aggregate(submissions, revisions, [custom], targets, f).findings
      .constructor,
  ).toBe(2);
});
