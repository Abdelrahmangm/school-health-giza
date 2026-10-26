# Giza School Health — Codex Handoff

This package contains implementation requirements and a baseline secure relational schema for Codex. It is not a fully coded deployed web application.

**How to use:** Export/sync the Lovable source project to a PRIVATE GitHub repository, open the repo in Codex, place AGENTS.md and CODEX_TASK.md in the root, attach the two xlsx reference files as needed, then ask Codex: "Read AGENTS.md and CODEX_TASK.md. Inspect the existing project, fix build errors, implement the defined requirements with tests in stages, and create a PR. Do not use live health data."

Files:
- AGENTS.md: persistent development guidelines
- CODEX_TASK.md: complete business rules and acceptance checks
- supabase/migrations/0001_core.sql: baseline schema with scope fields and RLS; security policies must be reviewed/tested before real users
- docs/DEPLOYMENT_CHECKLIST.md: release gate
