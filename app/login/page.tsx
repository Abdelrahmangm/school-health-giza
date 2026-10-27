import { login } from "@/app/actions";
import { configured } from "@/lib/supabase";
import Link from "next/link";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="auth">
      <img className="auth-logo" src="/school-health-logo.png" alt="شعار إدارة الصحة المدرسية والشباب بالجيزة" width="96" height="96" />
      <p className="eyebrow">مديرية الشؤون الصحية بالجيزة</p>
      <h1>منصة الفحص الصحي المدرسي</h1>
      <p className="muted">دخول آمن للبلاغات الأسبوعية والمستهدفات.</p>
      <section className="card">
        {error && (
          <p className="error" role="alert">
            {error === "profile"
              ? "حسابك لسه مش متربط بصلاحية. كلّم المشرف العام."
              : error === "disabled"
                ? "الحساب ده موقوف. لو ده غلط، كلّم المشرف العام."
                : error === "link"
                  ? "الرابط انتهت صلاحيته أو اتستخدم قبل كده. اطلب رابط جديد من «نسيت كلمة السر»."
                  : "الإيميل أو كلمة السر مش صح. جرّب تاني."}
          </p>
        )}
        {configured() ? (
          <form action={login} className="stack">
            <label>
              البريد الإلكتروني
              <input
                type="email"
                name="email"
                required
                autoComplete="username"
                dir="ltr"
              />
            </label>
            <label>
              كلمة المرور
              <input
                type="password"
                name="password"
                required
                minLength={8}
                autoComplete="current-password"
                dir="ltr"
              />
            </label>
            <button>تسجيل الدخول</button>
            <Link href="/auth/forgot">نسيت كلمة السر؟</Link>
          </form>
        ) : (
          <>
            <p>لم تُضبط خدمة المصادقة بعد.</p>
            <Link className="button" href="/setup">
              إرشادات إعداد بيئة الاختبار
            </Link>
          </>
        )}
        <p className="subsection muted">
          الحسابات بالدعوة من المشرف العام بس، ومفيش تسجيل عام. ممنوع إدخال أي بيانات
          بتحدد هوية الطالب.
        </p>
      </section>
    </main>
  );
}
