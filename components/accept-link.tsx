"use client";
import { useEffect, useState } from "react";
import { acceptSession } from "@/app/actions";
/**
 * Invitation and password-reset e-mails return here with tokens in the URL fragment
 * (never sent to any server log). We hand them to the server once, which stores them
 * as HttpOnly cookies, then wipe them from the address bar and history.
 */
export function AcceptLink() {
  const [state, setState] = useState<"working" | "failed">("working");
  useEffect(() => {
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    window.history.replaceState(null, "", url.pathname);
    const code = url.searchParams.get("code");
    const tokenHash = url.searchParams.get("token_hash");
    if (code) {
      window.location.replace("/auth/callback?code=" + encodeURIComponent(code));
      return;
    }
    if (tokenHash) {
      window.location.replace(`/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(url.searchParams.get("type") ?? "")}`);
      return;
    }
    const access = hash.get("access_token");
    const refresh = hash.get("refresh_token");
    if (!access || !refresh) {
      setState("failed");
      return;
    }
    acceptSession(access, refresh).then((r) => (r.ok ? window.location.replace("/auth/set-password?welcome=1") : setState("failed")));
  }, []);
  return state === "working" ? (
    <p className="card" role="status">
      لحظة، بنجهّز حسابك…
    </p>
  ) : (
    <section className="card stack">
      <p className="flash flash-error" role="alert">
        الرابط ده انتهت صلاحيته أو اتستخدم قبل كده.
      </p>
      <p>اطلب رابط جديد من «نسيت كلمة السر»، أو اطلب من المشرف العام يبعتلك الدعوة تاني.</p>
      <a className="button" href="/auth/forgot">
        طلب رابط جديد
      </a>
    </section>
  );
}
