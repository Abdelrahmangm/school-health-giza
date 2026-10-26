import { NextResponse, type NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const db = await supabase();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(new URL("/auth/set-password", request.url));
  }
  return NextResponse.redirect(
    new URL("/login?error=credentials", request.url),
  );
}
