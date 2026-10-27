// Fails if anything secret-looking ended up in files served to the browser.
// Run after `npm run build`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
const roots = [".next/static"];
const forbidden = [
  /SUPABASE_SECRET_KEY/,
  /SUPABASE_SERVICE_ROLE_KEY/,
  /sb_secret_[A-Za-z0-9_-]{10,}/,
  /"role"\s*:\s*"service_role"/,
  /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*cm9sZSI6InNlcnZpY2Vfcm9sZS[A-Za-z0-9_-]*/, // JWT payload containing "role":"service_role"
];
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
let files = 0;
const hits = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|css|html|json|txt|map)$/.test(name)) {
      files++;
      const text = readFileSync(p, "utf8");
      for (const re of forbidden) if (re.test(text)) hits.push(`${p}: ${re}`);
      if (secret && text.includes(secret)) hits.push(`${p}: the actual secret key value`);
    }
  }
}
for (const r of roots) walk(r);
if (!files) {
  console.error("No client bundle found; run `npm run build` first.");
  process.exit(1);
}
if (hits.length) {
  console.error("Secret material found in browser bundle:\n" + hits.join("\n"));
  process.exit(1);
}
console.log(`Client bundle check passed (${files} files, no server secrets).`);
