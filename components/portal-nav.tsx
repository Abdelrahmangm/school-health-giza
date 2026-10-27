"use client";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

const icons: Record<string, string> = {
  home: "M3 10 12 3l9 7v10H3V10zm6 10v-7h6v7",
  reports: "M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8 M8 16h8",
  targets: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 3v4",
  analytics: "M3 20V12 M9 20V7 M15 20V10 M21 20V4 M2 20h20",
  programs: "M4 4h16v16H4z M8 12h8 M12 8v8",
  imports: "M12 3v12 m-5-5 5 5 5-5 M4 18v3h16v-3",
  users: "M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9v-2a7 7 0 0 1 14 0v2 M19 6a4 4 0 0 1 0 8 M18 17a5 5 0 0 1 4 4",
  audit: "M12 2 4 5v7c0 5 4 8 8 10 4-2 8-5 8-10V5z m-4 9 3 3 5-6",
  logout: "M9 4H4v16h5 M14 8l4 4-4 4 M8 12h10",
  key: "M15 7a4 4 0 1 1-3.9 4.9L4 19v2h3v-2h2v-2h2l1.1-1.1A4 4 0 0 1 15 7z",
  calendar: "M4 6h16v14H4z M4 10h16 M8 3v5 M16 3v5",
  export: "M12 15V3 m-5 5 5-5 5 5 M4 15v6h16v-6",
  plus: "M12 5v14 M5 12h14",
  arrow: "M19 12H5 m6-6-6 6 6 6",
  hand: "M3 15h4l5 3h5a2 2 0 0 0 0-4h-4 M7 15v5 M3 20h4 M13 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  trend: "M3 17l6-6 4 4 8-8 M15 7h6v6",
  file: "M6 3h9l4 4v14H6z M14 3v5h5",
};
export function UiIcon({ name, size = 19, stroke = 1.7 }: { name: string; size?: number; stroke?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path d={icons[name] || icons.home} />
    </svg>
  );
}

/** Small pulse on the tab you just pressed, until the new page is on screen. */
function Pending() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={"tab-pending" + (pending ? " is-pending" : "")} />;
}

const menu = [
  { href: "/", label: "الرئيسية" },
  { href: "/reports", label: "البلاغات" },
  { href: "/targets", label: "المستهدفات" },
  { href: "/analytics", label: "المؤشرات" },
  { href: "/programs", label: "البرامج" },
];
export function PortalNav({ role }: { role: string }) {
  const pathname = usePathname();
  const operator = ["directorate_admin", "directorate_supervisor", "program_manager"].includes(role);
  const visible = [
    ...menu,
    ...(role !== "directorate_viewer" ? [{ href: "/imports", label: "الاستيراد" }] : []),
    ...(operator ? [{ href: "/users", label: "المستخدمين" }, { href: "/audit", label: "السجل" }] : []),
  ];
  const active = (href: string) => pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
  return (
    <nav aria-label="التنقل الرئيسي" className="tabs">
      {visible.map((item) => (
        <Link key={item.href} href={item.href} aria-current={active(item.href) ? "page" : undefined} className={"tab" + (active(item.href) ? " is-active" : "")}>
          {item.label}
          <Pending />
        </Link>
      ))}
    </nav>
  );
}
