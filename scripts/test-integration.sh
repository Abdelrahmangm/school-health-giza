#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
tag="health-demo-$RANDOM-$$"
state=$(mktemp -d /tmp/school-health-integration.XXXXXX)
cleanup(){ docker rm -f "$tag-gateway" "$tag-rest" "$tag-auth" "$tag-db" >/dev/null 2>&1 || true; docker network rm "$tag" >/dev/null 2>&1 || true; rm -rf "$state"; }
trap cleanup EXIT
# Isolated synthetic stack. Signup/autoconfirm is for disposable TEST containers only.
docker network create "$tag" >/dev/null
docker run -d --name "$tag-db" --network "$tag" --network-alias db -e POSTGRES_PASSWORD=DEMO-local-test-only postgres:17-alpine >/dev/null
for attempt in {1..30}; do if docker exec "$tag-db" pg_isready -U postgres >/dev/null 2>&1; then break; fi; sleep 1; done
docker exec -i "$tag-db" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
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
docker run -d --name "$tag-auth" --network "$tag" --network-alias auth --env-file "$state/auth.env" supabase/gotrue:v2.177.0 >/dev/null
for attempt in {1..40}; do if docker exec "$tag-db" psql -U postgres -tAc "select to_regclass('auth.users') is not null" | rg -q t; then break; fi; if [[ "$attempt" == 40 ]]; then docker logs "$tag-auth"; exit 1; fi; sleep 1; done
docker exec -i "$tag-db" psql -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/202610270001_platform.sql >/dev/null
cat > "$state/rest.env" <<EOF_REST
PGRST_DB_URI=postgres://postgres:DEMO-local-test-only@db:5432/postgres
PGRST_DB_SCHEMAS=public
PGRST_DB_ANON_ROLE=anon
PGRST_JWT_SECRET=$jwt_secret
EOF_REST
docker run -d --name "$tag-rest" --network "$tag" --network-alias rest --env-file "$state/rest.env" postgrest/postgrest:v12.2.3 >/dev/null
cat > "$state/default.conf" <<'NGINX'
server {
 listen 80;
 location /auth/v1/ { proxy_pass http://auth:9999/; proxy_set_header Host $host; }
 location /rest/v1/ { proxy_pass http://rest:3000/; proxy_set_header Host $host; }
}
NGINX
docker create --name "$tag-gateway" --network "$tag" -p 127.0.0.1:55433:80 nginx:1.28-alpine >/dev/null
docker cp "$state/default.conf" "$tag-gateway:/etc/nginx/conf.d/default.conf"
docker start "$tag-gateway" >/dev/null
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55433
export DEMO_DB_CONTAINER="$tag-db"
export NEXT_PUBLIC_DEMO_MODE=true
for attempt in {1..30}; do if curl -fsS "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/health" >/dev/null 2>&1; then break; fi; if [[ "$attempt" == 30 ]]; then docker logs "$tag-auth"; docker logs "$tag-gateway"; exit 1; fi; sleep 1; done
node scripts/prepare-auth.mjs
npm exec -- playwright test --config playwright.integration.config.ts
