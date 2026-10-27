#!/usr/bin/env bash
# Disposable integration stack WITHOUT Docker: a throw-away PostgreSQL cluster,
# the official Supabase Auth (GoTrue) and PostgREST release binaries, a tiny Node
# gateway and a local SMTP sink that only writes .eml files to a temp folder.
# Everything (data, keys, mail) is synthetic DEMO and deleted on exit.
#
# Required env: PG_BIN (dir with initdb/pg_ctl), GOTRUE_DIR (dir with `auth` binary + migrations),
#               POSTGREST_BIN (postgrest binary). Optional: SEED_VOLUME=1, PLAYWRIGHT_ARGS.
set -euo pipefail
cd "$(dirname "$0")/.."
# Find the newest installed PostgreSQL when PG_BIN is unset or wrong (runner images change versions).
if [[ -z "${PG_BIN:-}" || ! -x "${PG_BIN}/initdb" ]]; then
  PG_BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
fi
if [[ -z "${PG_BIN:-}" || ! -x "${PG_BIN}/initdb" ]]; then echo "PostgreSQL server binaries not found; install postgresql or set PG_BIN" >&2; exit 1; fi
echo "Using PostgreSQL binaries from $PG_BIN"
: "${GOTRUE_DIR:?Set GOTRUE_DIR to the extracted supabase/auth release}"
: "${POSTGREST_BIN:?Set POSTGREST_BIN to the postgrest binary}"
state=$(mktemp -d /tmp/school-health-local.XXXXXX)
chmod 777 "$state"
pids=()
as_db_user() { if [[ $(id -u) -eq 0 ]]; then runuser -u "${PG_OS_USER:-postgres}" -- "$@"; else "$@"; fi; }
cleanup() {
  for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done
  as_db_user "$PG_BIN/pg_ctl" -D "$state/pg" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$state"
}
trap cleanup EXIT
PGPORT_LOCAL=${PGPORT_LOCAL:-55432}
as_db_user "$PG_BIN/initdb" -D "$state/pg" -U postgres --auth=trust >/dev/null
as_db_user "$PG_BIN/pg_ctl" -D "$state/pg" -l "$state/pg.log" -o "-p $PGPORT_LOCAL -k $state -c listen_addresses=127.0.0.1" start >/dev/null
export DEMO_DB_URL="postgres://postgres@127.0.0.1:$PGPORT_LOCAL/postgres"
psql_demo() { psql -X -q -v ON_ERROR_STOP=1 "$DEMO_DB_URL" "$@"; }
for i in {1..30}; do psql_demo -c 'select 1' >/dev/null 2>&1 && break; sleep 1; done
psql_demo <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;
grant usage on schema public,auth to anon,authenticated,service_role;
grant execute on function auth.uid() to anon,authenticated,service_role;
SQL
jwt_secret=$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')
mint() { DEMO_JWT_SECRET="$jwt_secret" ROLE="$1" node -e 'const c=require("node:crypto");const b=x=>Buffer.from(JSON.stringify(x)).toString("base64url");const p=b({alg:"HS256",typ:"JWT"})+"."+b({role:process.env.ROLE,iss:"supabase",iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+7200});process.stdout.write(p+"."+c.createHmac("sha256",process.env.DEMO_JWT_SECRET).update(p).digest("base64url"))'; }
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$(mint anon)
# Server-only DEMO key for the invitation flow; valid only for these disposable processes.
export SUPABASE_SECRET_KEY; SUPABASE_SECRET_KEY=$(mint service_role)
export MAIL_SINK_DIR="$state/mail"
SMTP_PORT=52525 node scripts/dev/smtp-sink.mjs & pids+=($!)
(
  cd "$GOTRUE_DIR"
  exec env GOTRUE_API_HOST=127.0.0.1 PORT=59999 GOTRUE_API_PORT=59999 API_EXTERNAL_URL=http://127.0.0.1:55433 \
    GOTRUE_MAILER_URLPATHS_INVITE=/auth/v1/verify GOTRUE_MAILER_URLPATHS_RECOVERY=/auth/v1/verify GOTRUE_MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE=/auth/v1/verify \
    GOTRUE_SITE_URL=http://127.0.0.1:3001 GOTRUE_URI_ALLOW_LIST='http://127.0.0.1:3001/**' \
    GOTRUE_DB_DRIVER=postgres GOTRUE_DB_NAMESPACE=auth GOTRUE_DB_MIGRATIONS_PATH="$GOTRUE_DIR/migrations" \
    DATABASE_URL="postgres://postgres@127.0.0.1:$PGPORT_LOCAL/postgres?sslmode=disable&search_path=auth" \
    GOTRUE_JWT_SECRET="$jwt_secret" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
    GOTRUE_DISABLE_SIGNUP=false GOTRUE_MAILER_AUTOCONFIRM=true GOTRUE_EXTERNAL_EMAIL_ENABLED=true \
    GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT=52525 GOTRUE_SMTP_USER=demo GOTRUE_SMTP_PASS=demo \
    GOTRUE_SMTP_ADMIN_EMAIL=noreply@example.test GOTRUE_SMTP_SENDER_NAME="DEMO" \
    GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 GOTRUE_SMTP_MAX_FREQUENCY=1s GOTRUE_LOG_LEVEL=warn \
    ./auth > "$state/auth.log" 2>&1
) & pids+=($!)
auth_ready=0
for i in {1..90}; do
  if curl -fsS http://127.0.0.1:59999/health >/dev/null 2>&1; then auth_ready=1; break; fi
  sleep 1
done
if [[ "$auth_ready" != 1 ]]; then echo "GoTrue did not become healthy" >&2; cat "$state/auth.log" >&2; exit 1; fi
for migration in supabase/migrations/*.sql; do echo "Applying isolated migration: $(basename "$migration")"; psql_demo -f "$migration"; done
PGRST_DB_URI="$DEMO_DB_URL" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$jwt_secret" \
  PGRST_SERVER_PORT=53000 PGRST_SERVER_HOST=127.0.0.1 PGRST_LOG_LEVEL=warn "$POSTGREST_BIN" > "$state/rest.log" 2>&1 & pids+=($!)
GATEWAY_PORT=55433 AUTH_PORT=59999 REST_PORT=53000 node scripts/dev/gateway.mjs & pids+=($!)
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55433 NEXT_PUBLIC_DEMO_MODE=true SITE_URL=http://127.0.0.1:3001
for i in {1..60}; do curl -fsS "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/health" >/dev/null 2>&1 && break; sleep 1; done
curl -fsS "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/health" >/dev/null || { cat "$state/auth.log" >&2; exit 1; }
for i in {1..30}; do code=$(curl -s -o /dev/null -w '%{http_code}' "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/" || true); [[ "$code" =~ ^(200|401|404)$ ]] && break; sleep 1; done
node scripts/prepare-auth.mjs
if [[ "${SEED_VOLUME:-}" == 1 ]]; then psql_demo -f scripts/dev/seed-volume.sql; fi
if [[ -n "${INTEGRATION_CMD:-}" ]]; then bash -c "$INTEGRATION_CMD"; exit $?; fi
npm exec -- playwright test --config "${PLAYWRIGHT_CONFIG:-playwright.integration.config.ts}" ${PLAYWRIGHT_ARGS:-} || { echo "--- auth log"; tail -40 "$state/auth.log"; echo "--- rest log"; tail -20 "$state/rest.log"; exit 1; }
