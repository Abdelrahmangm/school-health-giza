"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const icons: Record<string,string>={
 home:"M3 10 12 3l9 7v10H3V10zm6 10v-7h6v7",reports:"M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8 M8 16h8",
 targets:"M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 3v4",
 analytics:"M3 20V12 M9 20V7 M15 20V10 M21 20V4 M2 20h20",
 programs:"M4 4h16v16H4z M8 12h8 M12 8v8",imports:"M12 3v12 m-5-5 5 5 5-5 M4 18v3h16v-3",
 users:"M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9v-2a7 7 0 0 1 14 0v2 M19 6a4 4 0 0 1 0 8 M18 17a5 5 0 0 1 4 4",
 audit:"M12 2 4 5v7c0 5 4 8 8 10 4-2 8-5 8-10V5z m-4 9 3 3 5-6",
 logout:"M9 4H4v16h5 M14 8l4 4-4 4 M8 12h10"
};
export function UiIcon({name,size=19}:{name:string,size?:number}){
 return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={icons[name]||icons.home}/></svg>;
}
const menu=[
 {href:"/",label:"لوحة التحكم",icon:"home"},
 {href:"/reports",label:"البلاغات الأسبوعية",icon:"reports"},
 {href:"/targets",label:"المستهدفات السنوية",icon:"targets"},
 {href:"/analytics",label:"المؤشرات والتقارير",icon:"analytics"},
 {href:"/programs",label:"البرامج والأعوام",icon:"programs"}
];
export function PortalNav({role}:{role:string}){
 const pathname=usePathname();
 const visible=[...menu,...(role!=="directorate_viewer"?[{href:"/imports",label:"استيراد البيانات",icon:"imports"}]:[]),...(["directorate_admin","directorate_supervisor","program_manager"].includes(role)?[{href:"/users",label:"المستخدمون والصلاحيات",icon:"users"},{href:"/audit",label:"سجل التدقيق",icon:"audit"}]:[])];
 return <nav aria-label="التنقل الرئيسي">{visible.map(item=><Link key={item.href} href={item.href} aria-current={pathname===item.href?"page":undefined} className={"sidebar-link"+(pathname===item.href||item.href!=="/"&&pathname.startsWith(item.href+"/")?" is-active":"")}><span className="sidebar-symbol"><UiIcon name={item.icon}/></span><span>{item.label}</span></Link>)}</nav>;
}
