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
      <p className="eyebrow">مديرية الشؤون الصحية بالجيزة</p>
      <h1>منصة الفحص الصحي المدرسي</h1>
      <p className="muted">دخول آمن للبلاغات الأسبوعية والمستهدفات.</p>
      <section className="card">
        {error && (
          <p className="error" role="alert">
            {error === "profile"
              ? "الحساب غير مرتبط بصلاحية. راجع مسؤول النظام."
              : "تعذر الدخول. تحقق من بيانات الحساب."}
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
          الحسابات بالدعوة فقط. لا يوجد تسجيل عام. يُمنع إدخال معلومات صحية تحدد
          هوية الطالب.
        </p>
      </section>
    </main>
  );
}
