import "server-only";
import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

/**
 * Supabase Auth admin client for sending invitation / recovery e-mails ONLY.
 * - Uses SUPABASE_SECRET_KEY (or the legacy service-role key) from the server
 *   environment. It is never prefixed NEXT_PUBLIC_, so Next.js cannot ship it to the browser.
 * - "server-only" makes any accidental client import fail the build.
 * - Role and administration permissions are written by RPCs under the supervisor's
 *   own session, never with this key, so RLS stays the authority for data access.
 */
export function authAdmin() {
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!secret || !url) return null;
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  }).auth.admin;
}

/** Public e-mail client (publishable key) using the implicit flow so links work on any device. */
export function authPublic() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false, flowType: "implicit" },
  }).auth;
}

/**
 * The address e-mail links return to. Prefer the configured SITE_URL; otherwise the
 * Vercel production domain; otherwise the current request origin. Supabase additionally
 * rejects any redirect that is not in its "Redirect URLs" allow-list.
 */
export async function siteUrl() {
  const configured = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("127.0.0.1") || host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
