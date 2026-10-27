import { AcceptLink } from "@/components/accept-link";
export const dynamic = "force-dynamic";
export default function Accept() {
  return (
    <main className="auth">
      <img className="auth-logo" src="/school-health-logo.png" alt="شعار إدارة الصحة المدرسية والشباب بالجيزة" width="96" height="96" />
      <h1>تفعيل الحساب</h1>
      <AcceptLink />
    </main>
  );
}
