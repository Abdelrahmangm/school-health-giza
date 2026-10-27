"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
const shapes: Record<string, ReactNode> = {
 home:<><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></>,
 report:<><path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5M8 12h8M8 16h8"/></>,
 target:<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
 chart:<><path d="M4 20V10m6 10V5m6 15v-8m4 8H2"/></>,
 program:<><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 12h8m-4-4v8"/></>,
 import:<><path d="M12 3v13m-4-4 4 4 4-4M4 17v4h16v-4"/></>,
 users:<><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M18 10a3 3 0 0 1 0 6M17 17a5 5 0 0 1 4 3"/></>,
 audit:<><path d="M12 2 4 5v6c0 5 3.4 8.4 8 11 4.6-2.6 8-6 8-11V5z"/><path d="m8 12 3 3 5-6"/></>,
 search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
 book:<><path d="M4 4h13a3 3 0 0 1 3 3v14H7a3 3 0 0 1-3-3z"/><path d="M4 18a3 3 0 0 1 3-3h13"/></>,
 clock:<><circle cx="12" cy="12" r="9"/><path d="M12 6v7l4 2"/></>,
 check:<><circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/></>,
 eye:<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
};
export function UiIcon({name,size=19}:{name:string;size?:number}){
 return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{shapes[name]||shapes.book}</svg>;
}
const items=[
 {href:"/",label:"الرئيسية",icon:"home"},
 {href:"/reports",label:"البلاغات الأسبوعية",icon:"report"},
 {href:"/targets",label:"المستهدفات السنوية",icon:"target"},
 {href:"/analytics",label:"التحليلات والتقارير",icon:"chart"},
 {href:"/programs",label:"البرامج والأعوام",icon:"program"},
];
export function PortalNav({role}:{role:string}){
 const pathname=usePathname();
 const routes=[...items,...(role!=="directorate_viewer"?[{href:"/imports",label:"استيراد البيانات",icon:"import"}]:[]),...(role==="directorate_admin"?[{href:"/users",label:"المستخدمون والصلاحيات",icon:"users"},{href:"/audit",label:"سجل التدقيق",icon:"audit"}]:[])];
 return <nav aria-label="التنقل الرئيسي">{routes.map(x=><Link aria-current={pathname===x.href?"page":undefined} className={pathname===x.href||x.href!=="/"&&pathname.startsWith(x.href+"/")?"active":""} href={x.href} key={x.href}><span className="nav-icon"><UiIcon name={x.icon}/></span>{x.label}</Link>)}</nav>;
}
