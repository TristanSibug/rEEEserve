import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { createClient } from "../../../../../utils/supabase/server";

export const runtime = "nodejs";

const TOKEN_LIFETIME_SECONDS = 30;

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const staffRole = cookieStore.get("staff_role")?.value;

  if (staffRole !== "admin") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { origin } = new URL(request.url);

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + TOKEN_LIFETIME_SECONDS * 1000
  ).toISOString();

  const { data, error } = await supabase
    .from("attendance_qr_tokens")
    .insert({
      token,
      room_name: null,
      expires_at: expiresAt,
    })
    .select("id, token, room_name, expires_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const scanUrl = `${origin}/attendance/scan?token=${encodeURIComponent(token)}`;

  return NextResponse.json({
    id: data.id,
    token: data.token,
    room_name: data.room_name,
    expires_at: data.expires_at,
    scan_url: scanUrl,
    lifetime_seconds: TOKEN_LIFETIME_SECONDS,
  });
}
