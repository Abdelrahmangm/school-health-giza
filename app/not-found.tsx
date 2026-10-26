import Link from "next/link";
export default function NotFound() {
  return (
    <main className="auth">
      <h1>الصفحة غير موجودة أو غير متاحة</h1>
      <Link href="/">العودة للرئيسية</Link>
    </main>
  );
}
