import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "../../../../utils/supabase/server";

function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function normalizeTime(t: string) {
  return t.slice(0, 5);
}

function getManilaNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  const hour = Number(get("hour"));
  const minute = Number(get("minute"));

  return {
    today: `${get("year")}-${get("month")}-${get("day")}`,
    nowMinutes: hour * 60 + minute,
    checkedInAt: new Date().toISOString(),
  };
}

type ReservationRow = {
  id: number;
  room_name: string;
  reserved_date: string;
  time_start: string;
  time_end: string;
  status: string;
  attendance_status: string | null;
};

export async function POST(request: Request) {
  const body = await request.json();
  const token = String(body.token ?? "").trim();

  if (!token) {
    return NextResponse.json({ error: "Missing QR token." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  }

  const { data: qrToken, error: tokenError } = await supabase
    .from("attendance_qr_tokens")
    .select("id, token, room_name, expires_at")
    .eq("token", token)
    .single();

  if (tokenError || !qrToken) {
    return NextResponse.json(
      { error: "Invalid attendance QR code." },
      { status: 404 }
    );
  }

  if (new Date(qrToken.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { error: "This QR code has expired. Please scan the latest QR code." },
      { status: 410 }
    );
  }

  const { today, nowMinutes, checkedInAt } = getManilaNow();

  const { data: reservations, error: reservationError } = await supabase
    .from("reservations")
    .select(
      "id, room_name, reserved_date, time_start, time_end, status, attendance_status"
    )
    .eq("student_email", user.email)
    .eq("reserved_date", today)
    .eq("status", "approved")
    .order("room_name", { ascending: true })
    .order("time_start", { ascending: true });

  if (reservationError) {
    return NextResponse.json(
      { error: reservationError.message },
      { status: 500 }
    );
  }

  const allRows = (reservations ?? []) as ReservationRow[];

  if (allRows.length === 0) {
    return NextResponse.json(
      {
        error: "You do not have an approved reservation today.",
      },
      { status: 404 }
    );
  }

  const activeRows = allRows.filter((reservation) => {
    const start = timeToMinutes(normalizeTime(reservation.time_start));
    const end = timeToMinutes(normalizeTime(reservation.time_end));

    const checkInWindowStart = start - 10;
    const checkInWindowEnd = end;

    return nowMinutes >= checkInWindowStart && nowMinutes < checkInWindowEnd;
  });

  if (activeRows.length === 0) {
    return NextResponse.json(
      {
        error:
          "You do not have an active reservation right now. Check-in opens 10 minutes before your reserved timeslot.",
      },
      { status: 409 }
    );
  }

  const activeRooms = Array.from(new Set(activeRows.map((row) => row.room_name)));

  if (activeRooms.length > 1) {
    return NextResponse.json(
      {
        error:
          "Multiple active reservations were found in different rooms. Please contact staff.",
      },
      { status: 409 }
    );
  }

  const activeRoom = activeRooms[0];

  const rows = allRows.filter((reservation) => reservation.room_name === activeRoom);

  const activeIndex = rows.findIndex((reservation) => {
    const start = timeToMinutes(normalizeTime(reservation.time_start));
    const end = timeToMinutes(normalizeTime(reservation.time_end));

    const checkInWindowStart = start - 10;
    const checkInWindowEnd = end;

    return nowMinutes >= checkInWindowStart && nowMinutes < checkInWindowEnd;
  });

  if (activeIndex === -1) {
    return NextResponse.json(
      {
        error:
          "You do not have an active reservation right now. Check-in opens 10 minutes before your reserved timeslot.",
      },
      { status: 409 }
    );
  }

  let left = activeIndex;
  let right = activeIndex;

  while (
    left > 0 &&
    normalizeTime(rows[left - 1].time_end) ===
    normalizeTime(rows[left].time_start)
  ) {
    left--;
  }

  while (
    right < rows.length - 1 &&
    normalizeTime(rows[right].time_end) ===
    normalizeTime(rows[right + 1].time_start)
  ) {
    right++;
  }

  const continuousBlock = rows.slice(left, right + 1);
  const reservationIds = continuousBlock.map((reservation) => reservation.id);

  const alreadyCheckedIn = continuousBlock.every(
    (reservation) => reservation.attendance_status === "checked_in"
  );

  if (alreadyCheckedIn) {
    return NextResponse.json({
      ok: true,
      already_checked_in: true,
      room_name: activeRoom,
      reserved_date: today,
      time_start: normalizeTime(continuousBlock[0].time_start),
      time_end: normalizeTime(continuousBlock[continuousBlock.length - 1].time_end),
      checked_count: continuousBlock.length,
      message: "You are already checked in for this reservation block.",
    });
  }

  const { error: updateError } = await supabase
    .from("reservations")
    .update({
      attendance_status: "checked_in",
      checked_in_at: checkedInAt,
      attendance_method: "qr",
      attendance_token_id: qrToken.id,
    })
    .in("id", reservationIds)
    .eq("student_email", user.email);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await supabase.from("reservation_activity_log").insert({
    action_type: "student_checked_in",
    room_name: activeRoom,
    action_date: today,
    time_start: normalizeTime(continuousBlock[0].time_start),
    time_end: normalizeTime(continuousBlock[continuousBlock.length - 1].time_end),
    student_email: user.email,
    details: "Student checked in using single rotating QR attendance.",
  });

  return NextResponse.json({
    ok: true,
    already_checked_in: false,
    room_name: activeRoom,
    reserved_date: today,
    time_start: normalizeTime(continuousBlock[0].time_start),
    time_end: normalizeTime(continuousBlock[continuousBlock.length - 1].time_end),
    checked_count: continuousBlock.length,
    message: "Attendance check-in successful.",
  });
}
