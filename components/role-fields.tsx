"use client";
import { useState } from "react";
import type { Administration } from "@/lib/domain";
const roleOptions = [
  ["administration_data_entry", "مسؤول إدارة صحية — بيانات إدارته بس"],
  ["program_manager", "مدير البرنامج — تشغيل ومتابعة كاملة من غير منح صلاحيات"],
  ["directorate_viewer", "فريق المديرية — اطلاع فقط"],
  ["directorate_supervisor", "المشرف العام — كل الصلاحيات وإدارة المستخدمين"],
] as const;
/** Role + administration pair: the administration is shown and required only for officers. */
export function RoleFields({ administrations, role = "administration_data_entry", administration = "", legacy = false, idPrefix }: {
  administrations: Administration[];
  role?: string;
  administration?: string | null;
  legacy?: boolean;
  idPrefix: string;
}) {
  const [value, setValue] = useState(role);
  return (
    <>
      <label htmlFor={idPrefix + "-role"}>
        الدور
        <select id={idPrefix + "-role"} name="role" value={value} onChange={(e) => setValue(e.target.value)}>
          {roleOptions.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
          {legacy && <option value="directorate_admin">مشرف عام (الدور القديم)</option>}
        </select>
      </label>
      {value === "administration_data_entry" ? (
        <label htmlFor={idPrefix + "-admin"}>
          الإدارة الصحية
          <select id={idPrefix + "-admin"} name="administration_id" defaultValue={administration ?? ""} required>
            <option value="" disabled>
              اختار الإدارة
            </option>
            {administrations.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name_ar}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="administration_id" value="" />
      )}
    </>
  );
}
