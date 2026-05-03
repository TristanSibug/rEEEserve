import { NextResponse } from "next/server";
import { createClient } from "../../../utils/supabase/server";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const email = data.user.email ?? "";
      if (!email.endsWith("@eee.upd.edu.ph")) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/?error=invalid_domain`);
      }
      return NextResponse.redirect(`${origin}/dashboard`);
    }
  }
  return NextResponse.redirect(`${origin}/?error=auth_failed`);
}
