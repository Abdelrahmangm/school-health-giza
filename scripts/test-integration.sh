#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
tag="health-demo-$RANDOM-$$"
state=$(mktemp -d /tmp/school-health-integration.XXXXXX)
last_step="initialize"
diagnostics(){
  local rc="$?"
  echo "::error::Integration test failed at stage: $last_step (exit $rc)" >&2
  echo "::group::Disposable container status" >&2
  docker ps -a --filter "name=$tag-" --format 'table {{.Names}}\t{{.Status}}' >&2 || true
  for service in db auth rest gateway; do
    echo "::group::Recent $service container logs" >&2
    docker logs --tail 90 "$tag-$service" 2>&1 | sed -E 's/(password|secret|apikey|authorization)([=: ]+)[^ ]+/\1\2[REDACTED]/Ig' >&2 || true
    echo "::endgroup::" >&2
  done
  echo "::endgroup::" >&2
}
cleanup(){ docker rm -f "$tag-gateway" "$tag-rest" "$tag-auth" "$tag-db" >/dev/null 2>&1 || true; docker network rm "$tag" >/dev/null 2>&1 || true; rm -rf "$state"; }
trap diagnostics ERR
trap cleanup EXIT
# Isolated synthetic stack. Signup/autoconfirm is for disposable TEST containers only.
last_step="create isolated network"
docker network create "$tag" >/dev/null
last_step="start PostgreSQL container"
docker run -d --name "$tag-db" --network "$tag" --network-alias db -e POSTGRES_PASSWORD=DEMO-local-test-only postgres:17-alpine >/dev/null
last_step="wait for PostgreSQL readiness"
# The postgres Docker entrypoint briefly starts a socket-only bootstrap server,
# then shuts it down before the final TCP server starts. A socket pg_isready
# check can pass during bootstrap and race with that shutdown.
# Verify a real SQL query over TCP, using ONLY the disposable container password.
database_ready=0
for attempt in {1..45}; do
  if docker exec -e PGPASSWORD=DEMO-local-test-only "$tag-db" \
    psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -Atqc 'select 1' 2>/dev/null | grep -qx 1; then
    database_ready=1
    break
  fi
  sleep 1
done
if [[ "$database_ready" -ne 1 ]]; then
  echo "PostgreSQL final TCP server did not become ready" >&2
  docker logs --tail 90 "$tag-db" >&2 || true
  false
fi
last_step="create disposable roles and auth bootstrap"
docker exec -e PGPASSWORD=DEMO-local-test-only -i "$tag-db" \
  psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;
grant usage on schema public,auth to anon,authenticated,service_role;
grant execute on function auth.uid() to anon,authenticated,service_role;
SQL
jwt_secret=$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')
# Keys are synthetic and only valid for these disposable local containers.
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$(DEMO_JWT_SECRET="$jwt_secret" node -e 'const c=require("node:crypto");const b=x=>Buffer.from(JSON.stringify(x)).toString("base64url");const p=b({alg:"HS256",typ:"JWT"})+"."+b({role:"anon",iss:"supabase",iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600});process.stdout.write(p+"."+c.createHmac("sha256",process.env.DEMO_JWT_SECRET).update(p).digest("base64url"))')
# Env files contain only ephemeral DEMO credentials and are removed on exit.
cat > "$state/auth.env" <<EOF_AUTH
GOTRUE_API_HOST=0.0.0.0
GOTRUE_API_PORT=9999
API_EXTERNAL_URL=http://127.0.0.1:55433
GOTRUE_SITE_URL=http://127.0.0.1:3001
GOTRUE_DB_NAMESPACE=auth
GOTRUE_DB_DRIVER=postgres
GOTRUE_DB_DATABASE_URL=postgres://postgres:DEMO-local-test-only@db:5432/postgres?sslmode=disable&search_path=auth
GOTRUE_JWT_SECRET=$jwt_secret
GOTRUE_JWT_EXP=3600
GOTRUE_JWT_AUD=authenticated
GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
GOTRUE_DISABLE_SIGNUP=false
GOTRUE_MAILER_AUTOCONFIRM=true
GOTRUE_EXTERNAL_EMAIL_ENABLED=true
GOTRUE_RATE_LIMIT_EMAIL_SENT=100
EOF_AUTH
last_step="start GoTrue"
docker run -d --name "$tag-auth" --network "$tag" --network-alias auth --env-file "$state/auth.env" supabase/gotrue:v2.177.0 >/dev/null
last_step="wait for GoTrue database migrations"
auth_ready=0
for attempt in {1..60}; do
  if docker exec "$tag-db" psql -U postgres -tAc "select to_regclass('auth.users') is not null" 2>/dev/null | grep -qx t; then auth_ready=1; break; fi
  sleep 1
done
if [[ "$auth_ready" -ne 1 ]]; then echo "GoTrue did not create auth.users" >&2; false; fi
last_step="apply application schema and RLS migrations"
docker exec -i "$tag-db" psql -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/202610270001_platform.sql
cat > "$state/rest.env" <<EOF_REST
PGRST_DB_URI=postgres://postgres:DEMO-local-test-only@db:5432/postgres
PGRST_DB_SCHEMAS=public
PGRST_DB_ANON_ROLE=anon
PGRST_JWT_SECRET=$jwt_secret
EOF_REST
last_step="start PostgREST"
docker run -d --name "$tag-rest" --network "$tag" --network-alias rest --env-file "$state/rest.env" postgrest/postgrest:v12.2.3 >/dev/null
cat > "$state/default.conf" <<'NGINX'
server {
 listen 80;
 location /auth/v1/ { proxy_pass http://auth:9999/; proxy_set_header Host $host; }
 location /rest/v1/ { proxy_pass http://rest:3000/; proxy_set_header Host $host; }
}
NGINX
last_step="start nginx gateway"
docker create --name "$tag-gateway" --network "$tag" -p 127.0.0.1:55433:80 nginx:1.28-alpine >/dev/null
docker cp "$state/default.conf" "$tag-gateway:/etc/nginx/conf.d/default.conf"
docker start "$tag-gateway" >/dev/null
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55433
export DEMO_DB_CONTAINER="$tag-db"
export NEXT_PUBLIC_DEMO_MODE=true
last_step="check auth endpoint via gateway"
gateway_ready=0
for attempt in {1..45}; do
  if curl --connect-timeout 2 --max-time 4 -fsS "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/health" >/dev/null 2>&1; then gateway_ready=1; break; fi
  sleep 1
done
if [[ "$gateway_ready" -ne 1 ]]; then
  echo "Auth health endpoint unavailable via nginx" >&2
  curl -i --connect-timeout 2 --max-time 5 "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/health" >&2 || true
  false
fi
last_step="check PostgREST via gateway"
rest_ready=0
for attempt in {1..45}; do
  code=$(curl --connect-timeout 2 --max-time 4 -s -o /dev/null -w '%{http_code}' "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/" || true)
  # 200/401/404 are valid service responses; 502 or 000 signal upstream not ready.
  if [[ "$code" == "200" || "$code" == "401" || "$code" == "404" ]]; then rest_ready=1; break; fi
  sleep 1
done
if [[ "$rest_ready" -ne 1 ]]; then echo "PostgREST unavailable via gateway (last HTTP $code)" >&2; false; fi
last_step="prepare synthetic integration users"
node scripts/prepare-auth.mjs
last_step="run Playwright integration assertions"
npm exec -- playwright test --config playwright.integration.config.ts
