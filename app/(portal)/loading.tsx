/** Shown the instant a tab is pressed, while the page's numbers load. */
export default function Loading() {
  return (
    <div className="skeleton" role="status" aria-live="polite">
      <span className="sr-only">جارٍ التحميل…</span>
      <div className="sk sk-title" />
      <div className="sk-row">
        <div className="sk sk-card" />
        <div className="sk sk-card" />
        <div className="sk sk-card" />
      </div>
      <div className="sk sk-block" />
    </div>
  );
}
