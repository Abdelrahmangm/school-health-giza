export default function Setup() {
  return (
    <main className="auth">
      <p className="eyebrow">تهيئة بيئة التطوير</p>
      <h1>يلزم ربط مشروع Supabase اختباري</h1>
      <section className="card stack">
        <p>
          الواجهة مثبتة، لكن لا توجد قاعدة بيانات متصلة. لا تعرض هذه الصفحة أي
          بيانات أو مؤشرات تجريبية على أنها فعلية.
        </p>
        <ol>
          <li>أنشئ مشروع Supabase للاختبار فقط.</li>
          <li>
            طبّق migration الموجود في <code>supabase/migrations</code>. لا تطبق
            ملف SQL القديم الموجود بالجذر.
          </li>
          <li>
            اضبط <code>NEXT_PUBLIC_SUPABASE_URL</code> و
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> في إعدادات البيئة.
          </li>
          <li>
            أنشئ حساب اختبار عبر دعوة Supabase، ثم اربط أول مدير وفق دليل{" "}
            <code>docs/SETUP.md</code>.
          </li>
          <li>أعد تشغيل الخادم، ثم اختبر الأدوار قبل السماح بالوصول.</li>
        </ol>
        <p className="notice">
          هذا الإصدار لم يُنشر. إعداد الدعوات ومراجعة الأمان ومطابقة ملف الوزارة
          شروط مستقلة قبل الاستخدام الحقيقي.
        </p>
      </section>
    </main>
  );
}
