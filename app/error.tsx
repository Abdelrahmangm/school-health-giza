"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="card" role="alert">
      <h1>تعذر إتمام الطلب</h1>
      <p>
        تحقق من الاتصال والصلاحية وموعد إغلاق البلاغ. لا تُكرر الإرسال قبل
        مراجعة حالة النسخة.
      </p>
      <button onClick={reset}>إعادة المحاولة</button>
    </section>
  );
}
