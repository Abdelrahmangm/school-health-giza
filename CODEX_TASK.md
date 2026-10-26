# CODEX MASTER TASK — Giza School Health

## Goal
Complete a fully working, maintainable Arabic RTL application called "منصة الفحص الصحي المدرسي — مديرية الشؤون الصحية بالجيزة". Intended workflow: Open in Codex as a GitHub repo, have Codex inspect the repository, plan and implement code, run tests, open PR, and provide a reviewable preview. Continue from pre-existing Lovable app code if exported/synced; don't throw away functioning source.

## Current state
Lovable project editor: https://lovable.dev/projects/a628243a-fb0b-4d94-a1a4-0eb1de9fb5bd
At last inspection: partially built demo, several routes placeholders, build errors, no cloud DB or login/RLS. Do not assume it is deployable or secure.

## Exact business requirements (approved)
- 13 administrations: أوسيم، كرداسة، البدرشين، الصف، أطفيح، أبو النمرس، شرق القناطر، غرب القناطر، شمال العياط، جنوب العياط، الوراق، الحوامدية، الواحات.
- Single weekly *combined submission* per administration, with distinct general/azhar sector and stage and program breakdowns. Submission counts are new students screened during that week, NOT cumulative.
- Reporting interval Sunday 00:00 through Saturday 23:59 Cairo local time. Submission lock FOLLOWING Sunday at 16:00 Africa/Cairo. Staff cannot edit after deadline. Directorate admin can reopen with mandatory reason/audit.
- After submission data immediately visible as provisional. Admin can approve or return for correction; only approved numbers count as official. Approved revision remains official when a new amendment is proposed until approved. Never double count revisions.
- Roles: Directorate Admin (full permission and approval); Directorate Viewer (all directorate metrics and reports read only); Administration Data Entry (assigned administration only and its drafts, reports, target proposals). Enforce through database RLS plus server-side checks.
- Program A comprehensive screening: ONLY five grade categories: first kindergarten, first primary, fourth primary, first preparatory, first secondary. Program B Vision screening for SECOND kindergarten only (visual impairment, strabismus, ptosis), independent totals and targets.
- All targets and facts independently keyed general vs Azhar. Each administration may propose changes to its own annual targets; only directorate admin can approve. Preserve historical versions and effective timestamps.
- Programs, active school years, associated grades, sectors, and diagnostic indicators configurable and versioned per school year. Second kindergarten vision-only active 2026-27 but may be disabled 2027-28 without deleting past data.
- Each indicator may overlap on the same child. Totals per disease are counts of findings, not unique count of affected children.
- Primary output: Ministry 2026–2027 Excel-compatible export (general, azhar, combined) with exact ordered fields and confirmed calculations. Source ministry workbook file: "الفحص الطبي الشامل 2026-2027 - الجيزه(2).xlsx"; do not guess missing mapping. Separate annual targets and cumulative screened numbers; never add second KG to comprehensive. Ability to export for each administration, all directorate, week, and YTD.
- Access controls and no patient-identifiable data. Do not deploy publicly without review.

## Data sources (read-only)
- https://docs.google.com/spreadsheets/d/1o3z_AVQ6a85CtYPvLJTYEK8TIY6q8HaHL3ajFGdY6lw/edit
- https://docs.google.com/spreadsheets/d/1xvcx0bYyGj8UAfMYkstA8pKDfaf4qfbi4ku4pM4FLvY/edit
- https://docs.google.com/spreadsheets/d/121Lt9kHjQpC9vQJX8HLpZODh7cCxWA8ZR7rYvTgatDY/edit
Don't claim any integration before it is actually connected; provide secure import/mapping with preview and warnings for duplicates, invalid numeric strings, inconsistent administration spellings.

## Required pages/features
1. Auth/Login with protected navigation, user role and administration.
2. Directorate dashboard: official/provisional filters; school year/sector/grade/program/week/admin filters; target, examined, achievement and disease metrics.
3. Weekly reports: list, submission wizard, draft, review/approve/return with feedback, revision timeline; cutoff enforcement on backend.
4. Targets: administration proposes, admin approves, audit/history and automatic re-computation without corrupting prior snapshot reports.
5. Program management: school-year versions, add/deactivate programs and grades, indicator schema.
6. Analytics: reporting completeness; trend; administration comparisons; indicator incidence rate per screened count with explicit definition.
7. Excel/CSV export; versioned ministry template mappings with test assertions for exact columns/order.
8. User management and audit.
9. Legacy data imports in staging.
10. Automated tests and README/setup commands.

## Acceptance tests
- Week Sunday→Saturday and lock following Sunday 16:00 Cairo; boundary +/-1 minute.
- Two sectors never merge unless a combined total explicitly requested.
- Second kindergarten contributes only to vision program, never comprehensive denominator.
- Data-entry user cannot read/modify any other admin data even using direct DB/API.
- Viewer cannot create/edit/approve reports.
- Provisional fact visible in pending dashboard only; approvals change official metric; approval of amended revision replaces previous official, not adds.
- One administration/week consolidated report cannot be duplicated.
- Targets: proposed changes invisible to official calculations pending approval; approved version history retained.
- Turning off vision in 2027–28 leaves 2026–27 history intact.
- Exports reproducibly match ministry field mapping.
- No production sample/demo data leakage. Build and tests pass.

## Delivery
Provide code, SQL migrations, environment .env.example (no secrets), tests, clear runbook, seed DEMO only, deployment security checklist, and describe actual completed vs pending functionality. Use a feature branch/PR and no destructive direct production writes.
