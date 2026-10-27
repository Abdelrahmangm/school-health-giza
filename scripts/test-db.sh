#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# CI uses an isolated PostgreSQL 16 service via PGHOST and related PG* variables.
# Local developers use an ephemeral, non-network-exposed Docker database.
name=""
if [[ -z "${PGHOST:-}" ]]; then
  name="school-health-test-${RANDOM}-$$"
  docker run -d --name "$name" -e POSTGRES_PASSWORD=DEMO-local-test-only postgres:16-alpine >/dev/null
  db_psql=(docker exec -i "$name" psql -U postgres -v ON_ERROR_STOP=1)
  db_ready=(docker exec "$name" pg_isready -U postgres -d postgres)
else
  : "${PGPASSWORD:?Set an isolated test-only PGPASSWORD}"
  export PGUSER="${PGUSER:-postgres}" PGDATABASE="${PGDATABASE:-postgres}" PGPORT="${PGPORT:-5432}"
  db_psql=(psql -X -v ON_ERROR_STOP=1)
  db_ready=(pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE")
fi
cleanup() { if [[ -n "$name" ]]; then docker rm -f "$name" >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT

ready=0
for attempt in {1..45}; do
  if "${db_ready[@]}" >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if [[ "$ready" != 1 ]]; then
  echo "Isolated PostgreSQL test database did not become ready." >&2
  if [[ -n "$name" ]]; then docker logs "$name" >&2; fi
  exit 1
fi

"${db_psql[@]}" <<'SQL'
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
SQL
for migration in supabase/migrations/*.sql; do
  "${db_psql[@]}" < "$migration"
done
for suite in supabase/tests/*.sql; do
  echo "Running $suite"
  "${db_psql[@]}" < "$suite"
done
