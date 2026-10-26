#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
name="school-health-test-${RANDOM}-$$"
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
# Disposable test-only database; no ports, no production credentials, no persistent data.
docker run -d --name "$name" -e POSTGRES_PASSWORD=DEMO-local-test-only postgres:17-alpine >/dev/null
for attempt in {1..30}; do
  if docker exec "$name" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  if [[ "$attempt" == 30 ]]; then docker logs "$name"; exit 1; fi
  sleep 1
done
docker exec -i "$name" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
SQL
docker exec -i "$name" psql -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/202610270001_platform.sql
docker exec -i "$name" psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/acceptance.sql
