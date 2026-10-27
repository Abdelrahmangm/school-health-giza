import { errorMessages, noticeMessages } from "@/lib/messages";
/** Shows the result of the last action (?msg=… or ?err=…) as a clear, accessible message. */
export function Flash({ params }: { params: Record<string, string | string[] | undefined> }) {
  const msg = typeof params.msg === "string" ? params.msg : "";
  const err = typeof params.err === "string" ? params.err : "";
  if (err)
    return (
      <p className="flash flash-error" role="alert">
        {errorMessages[err] ?? errorMessages.GENERIC}
      </p>
    );
  if (msg && noticeMessages[msg])
    return (
      <p className="flash flash-ok" role="status">
        {noticeMessages[msg]}
        {typeof params.done === "string" && /^\d+$/.test(params.done) && ` (اتنفذ ${Number(params.done).toLocaleString("ar-EG")}${typeof params.failed === "string" && Number(params.failed) > 0 ? ` · محتاج مراجعة ${Number(params.failed).toLocaleString("ar-EG")}` : ""})`}
      </p>
    );
  return null;
}
