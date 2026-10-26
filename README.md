# منصة الفحص الصحي المدرسي — الجيزة

تطبيق عربي RTL باستخدام **Next.js / TypeScript / Supabase** للبلاغات المجمعة، الاعتماد، المستهدفات السنوية والتقارير. هذا **فرع للمراجعة، وليس إصدارًا جاهزًا للإنتاج**. لم يُنشر التطبيق، ولا توجد بيانات حقيقية أو مزامنة مع Google Sheets.

```bash
npm ci
npm run dev
```

يلزم Node.js 24. من دون إعداد Supabase تعرض المسارات المحمية إرشادات الإعداد؛ لا تُعرض أرقام DEMO كمؤشرات فعلية.

- [إعداد قاعدة اختبار والمصادقة والدعوات](docs/SETUP.md)
- [البنية وقواعد الحساب والصلاحيات](docs/ARCHITECTURE.md)
- [المنجز والقيود ونتائج التحقق](docs/IMPLEMENTATION_STATUS.md)
- [بوابة مراجعة الأمان](DEPLOYMENT_CHECKLIST.md)

## التحقق

```bash
npm run typecheck
npm test                       # قواعد الوقت والتجميع والتحقق من الإدخال
npm run test:db                # Docker PostgreSQL مع fixture لـ auth.uid
npm run build
npm run test:e2e               # صفحات الإنتاج دون اتصال Supabase
bash scripts/test-integration.sh # Auth + PostgREST + PostgreSQL + متصفح، DEMO فقط
```

اختبارات المتصفح تستخدم Chromium المثبت، أو `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`، أو متصفح Playwright. ثبّته عند الحاجة بـ `npx playwright install --with-deps chromium`. اختبارات التكامل تنشئ حاويات مؤقتة وتحذفها، وتحتاج المنفذين المحليين 3001 و55433. لا تشغّلها مع متغيرات مشروع حقيقي. تفاصيل ذلك في دليل الإعداد.

## الملفات المرجعية

`AGENTS.md` و`CODEX_TASK.md` هما المتطلبات الأصلية. ملف `0001_core.sql` في الجذر **مرجع تاريخي غير مستخدم**. طبّق فقط migrations الجديدة على مشروع اختبار فارغ. التطبيق لا يطابق مخطط SQL القديم، ولا يوجد مسار ترقية لقاعدة سبق تطبيق ذلك الملف عليها.

تصدير CSV تحليلي متاح. **تصدير نموذج الوزارة معطل** لأن ملف `الفحص الطبي الشامل 2026-2027 - الجيزه(2).xlsx` غير متاح؛ لم تُخمن مطابقة الأعمدة.
