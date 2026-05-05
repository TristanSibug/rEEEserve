import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "../../../utils/supabase/server";

type DemoRole = "student" | "instructor" | "admin";

const DEMO_LOGIN_ENABLED = process.env.DEMO_LOGIN_ENABLED === "true";
const COOKIE_MAX_AGE = 60 * 60 * 8;

function cookieOptions(httpOnly: boolean) {
  return {
    httpOnly,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  };
}

function clearCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const role = url.searchParams.get("role") as DemoRole | null;

  if (!DEMO_LOGIN_ENABLED) {
    return NextResponse.redirect(`${url.origin}/`);
  }

  if (role !== "student" && role !== "instructor" && role !== "admin") {
    return NextResponse.json(
      { error: "Invalid demo login role." },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  if (role === "student") {
    const response = NextResponse.redirect(`${url.origin}/dashboard`);

    response.cookies.set("staff_id", "", clearCookieOptions());
    response.cookies.set("staff_role", "", clearCookieOptions());

    response.cookies.set("demo_role", "student", cookieOptions(false));
    response.cookies.set(
      "demo_email",
      "demo.student@eee.upd.edu.ph",
      cookieOptions(false)
    );

    return response;
  }

  const { data: staff, error } = await supabase
    .from("staff_credentials")
    .select("id, username, email, role")
    .eq("role", role)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!staff) {
    return NextResponse.json(
      {
        error: `No ${role} account found in staff_credentials. Add at least one ${role} row first.`,
      },
      { status: 404 }
    );
  }

  const response = NextResponse.redirect(
    role === "admin"
      ? `${url.origin}/admin/dashboard`
      : `${url.origin}/instructor/dashboard`
  );

  response.cookies.set("demo_role", role, cookieOptions(false));
  response.cookies.set("demo_email", "", {
    ...cookieOptions(false),
    maxAge: 0,
  });

  response.cookies.set("staff_id", String(staff.id), cookieOptions(true));
  response.cookies.set("staff_role", staff.role, cookieOptions(true));

  return response;
}
