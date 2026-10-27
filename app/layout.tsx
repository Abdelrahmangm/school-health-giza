import type { Metadata } from "next";
import "./globals.css";
import "./redesign.css";
export const metadata: Metadata = {
 title: "منصة الفحص الصحي المدرسي | الجيزة",
 description: "نظام البلاغات الأسبوعية والمستهدفات — مديرية الشؤون الصحية بالجيزة",
 robots: { index: false, follow: false },
};
export default function Layout({children}:{children:React.ReactNode}){
 return <html lang="ar" dir="rtl"><body>{children}</body></html>;
}
