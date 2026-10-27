"use client";
/** Ticks or clears every checkbox with the given name inside the same form. */
export function SelectAll({ name, label = "تحديد الكل" }: { name: string; label?: string }) {
  return (
    <button
      type="button"
      className="secondary"
      onClick={(e) => {
        const boxes = Array.from(e.currentTarget.form?.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${name}"]`) ?? []);
        const all = boxes.every((b) => b.checked);
        boxes.forEach((b) => (b.checked = !all));
      }}
    >
      {label}
    </button>
  );
}
