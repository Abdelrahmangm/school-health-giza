import Link from "next/link";
import { requestPasswordReset } from "@/app/actions";
import { Flash } from "@/components/flash";
export default async function Forgot({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  return (
    <main className="auth">
      <img className="auth-logo" src="/school-health-logo.png" alt="شعار إدارة الصحة المدرسية والشباب بالجيزة" width="96" height="96" />
      <h1>نسيت كلمة السر؟</h1>
      <Flash params={params} />
      <form action={requestPasswordReset} className="card stack">
        <p className="muted">اكتب الإيميل اللي اتبعتتلك عليه الدعوة، وهنبعتلك رابط تختار بيه كلمة سر جديدة.</p>
        <label>
          الإيميل
          <input type="email" name="email" required autoComplete="username" dir="ltr" />
        </label>
        <button>ابعتلي الرابط</button>
        <Link href="/login">رجوع لتسجيل الدخول</Link>
      </form>
    </main>
  );
}
