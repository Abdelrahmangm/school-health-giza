import { execFileSync } from "node:child_process";
const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
const roles = [
  ["admin", "directorate_admin", null],
  ["viewer", "directorate_viewer", null],
  ["entry", "administration_data_entry", "أوسيم"],
  ["other", "administration_data_entry", "كرداسة"],
];
for (const [name, role, administration] of roles) {
  const result = await fetch(api + "/auth/v1/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `demo-${name}@example.test`,
      password: "DEMO-only-password-2026!",
    }),
  });
  const data = await result.json();
  if (!result.ok || !data.user?.id)
    throw new Error("Local DEMO auth signup failed: " + JSON.stringify(data));
  const id = data.user.id;
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Unexpected test user id");
  const sql = `insert into public.user_profiles(user_id,role,administration_id) values('${id}','${role}',${administration ? `(select id from public.administrations where name_ar='${administration}')` : "null"});`;
  // Disposable DEMO database only: either a local throw-away cluster or a Docker container.
  if (process.env.DEMO_DB_URL)
    execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", process.env.DEMO_DB_URL], {
      input: sql,
      stdio: ["pipe", "ignore", "pipe"],
    });
  else
    execFileSync(
      "docker",
      ["exec", "-i", process.env.DEMO_DB_CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
      { input: sql, stdio: ["pipe", "ignore", "pipe"] },
    );
}
console.log("Created four isolated DEMO accounts; no real email or data used.");
