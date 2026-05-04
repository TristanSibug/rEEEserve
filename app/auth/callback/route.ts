import { NextResponse } from "next/server";
import { createClient } from "../../../utils/supabase/server";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  if (!code) {
    return NextResponse.redirect(
      `${requestUrl.origin}/login?error=missing_oauth_code`
    );
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
    code
  );

  if (exchangeError) {
    console.error("OAuth code exchange error:", exchangeError.message);
    return NextResponse.redirect(
      `${requestUrl.origin}/login?error=auth_callback_failed`
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    console.error("Get user error:", userError?.message);
    return NextResponse.redirect(`${requestUrl.origin}/login?error=no_user`);
  }

  const email = user.email.toLowerCase();

  const { data: instructor, error: instructorError } = await supabase
    .from("staff_credentials")
    .select("id, username, email, role")
    .eq("role", "instructor")
    .ilike("email", email)
    .maybeSingle();

  if (instructorError) {
    console.error("Instructor lookup error:", instructorError.message);
  }

  if (instructor) {
    return NextResponse.redirect(`${requestUrl.origin}/instructor/dashboard`);
  }

  return NextResponse.redirect(`${requestUrl.origin}/dashboard`);
}
