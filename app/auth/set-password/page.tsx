export const dynamic = "force-dynamic";
import Link from "next/link";
import { supabase, configured } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { setPassword } from "@/app/actions";
import { Flash } from "@/components/flash";
export default async function SetPassword({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!configured()) redirect("/setup");
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login?error=link");
  const params = await searchParams;
  const welcome = params.welcome === "1";
  return (
    <main className="auth">
      <img className="auth-logo" src="/school-health-logo.png" alt="شعار إدارة الصحة المدرسية والشباب بالجيزة" width="96" height="96" />
      <h1>{welcome ? "أهلًا بيك! اختار كلمة السر" : "تغيير كلمة السر"}</h1>
      <Flash params={params} />
      <form action={setPassword} className="card stack">
        <p className="muted" dir="auto">
          الحساب: <span dir="ltr">{user.email}</span>
        </p>
        <label>
          كلمة السر الجديدة
          <input name="password" type="password" minLength={12} maxLength={128} required autoComplete="new-password" dir="ltr" />
        </label>
        <small className="field-help">12 حرف على الأقل، وفيها حروف وأرقام. جملة طويلة سهل تفتكرها أحسن من كلمة معقدة.</small>
        <label>
          اكتبها تاني للتأكيد
          <input name="confirm" type="password" minLength={12} maxLength={128} required autoComplete="new-password" dir="ltr" />
        </label>
        <button>حفظ كلمة السر</button>
        {!welcome && <Link href="/">رجوع للرئيسية</Link>}
      </form>
    </main>
  );
}
