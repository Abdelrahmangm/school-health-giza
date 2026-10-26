# AGENTS.md — Giza School Health Screening

You are implementing a real Arabic RTL administrative application for Giza Directorate of Health Affairs. Prioritize correctness, privacy and working end-to-end flows over visual mockups.

## Work sequence
1. Check project install/build/tests. Fix all existing build errors first.
2. Implement Supabase/Postgres schema, auth, server-side authorization and RLS. No real data until secured.
3. Implement report submission lifecycle, revision and directorate approval.
4. Implement targets approval/versioning; annual targets are NEVER summed weekly.
5. Implement year-scoped programs, grades, indicators; second kindergarten belongs to vision-only in 2026–27.
6. Implement verified aggregations (weekly / YTD, preliminary vs official) and ministry Excel export.
7. Tests, seed demo data with obvious DEMO labels, QA, deployment checklist.

Never present a demo as production ready. Never use patient names or personally identifying health information. Never silently write to the source Google Sheets.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
