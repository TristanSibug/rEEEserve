// create sample hash password
// node -e "const b = require('bcryptjs'); b.hash('123', 10).then(h => console.log(h))"

import { NextResponse } from "next/server";
import { createClient } from "../../../utils/supabase/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
  const { username, password } = await request.json();

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from("staff_credentials")
    .select("id, username, password, role")
    .eq("username", username)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const match = await bcrypt.compare(password, data.password);
  if (!match) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const response = NextResponse.json({
    ok: true,
    role: data.role,
  });

  response.cookies.set("staff_id", String(data.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  response.cookies.set("staff_role", data.role, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return response;
}
