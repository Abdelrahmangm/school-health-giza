export const dynamic = "force-dynamic";
import { supabase, configured } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { setPassword } from "@/app/actions";
export default async function SetPassword() {
  if (!configured()) redirect("/setup");
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  return (
    <main className="auth">
      <h1>تعيين كلمة المرور</h1>
      <form action={setPassword} className="card stack">
        <label>
          كلمة مرور جديدة
          <input
            name="password"
            type="password"
            minLength={12}
            required
            autoComplete="new-password"
          />
        </label>
        <label>
          تأكيد كلمة المرور
          <input
            name="confirm"
            type="password"
            minLength={12}
            required
            autoComplete="new-password"
          />
        </label>
        <button>حفظ والدخول</button>
      </form>
    </main>
  );
}
