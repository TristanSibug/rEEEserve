import { NextResponse } from "next/server";
import { createClient } from "../../../utils/supabase/server";
import { cookies } from "next/headers";

const ROOM_CAPACITY: Record<string, number> = {
  "EEEI 301": 10,
  "EEEI 305": 10,
  "EEEI 308": 16,
};

type CookieStore = Awaited<ReturnType<typeof cookies>>;
type SupabaseServerClient = ReturnType<typeof createClient>;

function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function overlaps(startA: string, endA: string, startB: string, endB: string) {
  return (
    timeToMinutes(startA) < timeToMinutes(endB) &&
    timeToMinutes(endA) > timeToMinutes(startB)
  );
}

function getManilaDateTime() {
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
    parts.find(part => part.type === type)?.value ?? "00";

  return {
    today: `${get("year")}-${get("month")}-${get("day")}`,
    nowMinutes: Number(get("hour")) * 60 + Number(get("minute")),
    nowTime: `${get("hour")}:${get("minute")}:${get("second")}`,
  };
}

function isPastOrTooSoon(date: string, timeStart: string) {
  const { today, nowMinutes } = getManilaDateTime();

  if (date < today) return true;
  if (date > today) return false;

  return timeToMinutes(timeStart) < nowMinutes + 60;
}

async function getActiveStudentEmail(
  supabase: SupabaseServerClient,
  cookieStore: CookieStore
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const realEmail = user?.email?.toLowerCase() ?? "";

  if (realEmail) return realEmail;

  const demoEmail =
    process.env.DEMO_LOGIN_ENABLED === "true"
      ? cookieStore.get("demo_email")?.value?.toLowerCase() ?? ""
      : "";

  return demoEmail;
}

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const studentEmail = await getActiveStudentEmail(supabase, cookieStore);

  if (!studentEmail) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { today, nowTime } = getManilaDateTime();

  const { data, error } = await supabase
    .from("reservations")
    .select(
      "id, student_email, room_name, reserved_date, time_start, time_end, status"
    )
    .eq("student_email", studentEmail)
    .in("status", [
      "approved",
      "pending",
      "cancelled_by_admin",
      "cancelled_by_instructor",
    ])
    .order("reserved_date", { ascending: true })
    .order("time_start", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const reservations = data ?? [];

  const current = reservations.filter(r => {
    if (r.status !== "approved") return false;

    if (r.reserved_date > today) return true;
    if (r.reserved_date < today) return false;

    return r.time_end > nowTime;
  });

  const past = reservations.filter(r => {
    if (
      r.status === "cancelled_by_admin" ||
      r.status === "cancelled_by_instructor"
    ) {
      return true;
    }

    if (r.status === "pending") return false;

    if (r.reserved_date < today) return true;
    if (r.reserved_date > today) return false;

    return r.time_end <= nowTime;
  });

  return NextResponse.json({
    current,
    past,
  });
}

export async function POST(request: Request) {
  const body = await request.json();

  const room = String(body.room_name ?? "").trim();
  const date = String(body.reserved_date ?? "").trim();
  const items = body.items;

  if (!room || !date || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "Missing reservation details" },
      { status: 400 }
    );
  }

  const capacity = ROOM_CAPACITY[room];

  if (!capacity) {
    return NextResponse.json({ error: "Invalid room" }, { status: 400 });
  }

  for (const item of items) {
    if (!item.time_start || !item.time_end) {
      return NextResponse.json(
        { error: "Missing timeslot details." },
        { status: 400 }
      );
    }

    if (timeToMinutes(item.time_end) <= timeToMinutes(item.time_start)) {
      return NextResponse.json(
        { error: "End time must be after start time." },
        { status: 400 }
      );
    }
  }

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (
        overlaps(
          items[i].time_start,
          items[i].time_end,
          items[j].time_start,
          items[j].time_end
        )
      ) {
        return NextResponse.json(
          { error: "Selected slots cannot overlap each other." },
          { status: 400 }
        );
      }
    }
  }

  const tooSoonItem = items.find(item =>
    isPastOrTooSoon(date, item.time_start)
  );

  if (tooSoonItem) {
    return NextResponse.json(
      {
        error: "One of the selected slots is no longer available for reservation.",
      },
      { status: 409 }
    );
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const studentEmail = await getActiveStudentEmail(supabase, cookieStore);

  if (!studentEmail) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const [year, month, day] = date.split("-").map(Number);
  const selectedDate = new Date(year, month - 1, day);
  const dayOfWeek = selectedDate.getDay();

  const { data: weeklySchedules, error: weeklyError } = await supabase
    .from("weekly_lab_schedules")
    .select("id, time_start, time_end")
    .eq("room_name", room)
    .eq("day_of_week", dayOfWeek);

  if (weeklyError) {
    return NextResponse.json({ error: weeklyError.message }, { status: 500 });
  }

  const { data: roomSchedules, error: roomError } = await supabase
    .from("room_schedule_blocks")
    .select("id, time_start, time_end")
    .eq("room_name", room)
    .eq("block_date", date);

  if (roomError) {
    return NextResponse.json({ error: roomError.message }, { status: 500 });
  }

  const blockingSchedules = [
    ...(weeklySchedules ?? []),
    ...(roomSchedules ?? []),
  ];

  for (const item of items) {
    const blocked = blockingSchedules.some(schedule =>
      overlaps(
        item.time_start,
        item.time_end,
        schedule.time_start,
        schedule.time_end
      )
    );

    if (blocked) {
      return NextResponse.json(
        {
          error:
            "One of the selected slots is occupied by a class or blocked schedule.",
        },
        { status: 409 }
      );
    }
  }

  const { data: existingReservations, error: reservationError } = await supabase
    .from("reservations")
    .select("id, student_email, time_start, time_end, status")
    .eq("room_name", room)
    .eq("reserved_date", date)
    .in("status", ["approved"]);

  if (reservationError) {
    return NextResponse.json(
      { error: reservationError.message },
      { status: 500 }
    );
  }

  for (const item of items) {
    const userAlreadyReserved = (existingReservations ?? []).some(
      r =>
        r.student_email === studentEmail &&
        overlaps(item.time_start, item.time_end, r.time_start, r.time_end)
    );

    if (userAlreadyReserved) {
      return NextResponse.json(
        { error: "You already reserved one of the selected slots." },
        { status: 409 }
      );
    }

    const existingCount = (existingReservations ?? []).filter(r =>
      overlaps(item.time_start, item.time_end, r.time_start, r.time_end)
    ).length;

    const cartCountForThisSlot = items.filter(cartItem =>
      overlaps(
        item.time_start,
        item.time_end,
        cartItem.time_start,
        cartItem.time_end
      )
    ).length;

    if (existingCount + cartCountForThisSlot > capacity) {
      return NextResponse.json(
        {
          error: "One of the selected slots no longer has enough seats left.",
        },
        { status: 409 }
      );
    }
  }

  const rows = items.map(item => ({
    student_id: null,
    student_email: studentEmail,
    room_name: room,
    reserved_date: date,
    time_start: item.time_start,
    time_end: item.time_end,
    status: "approved",
    created_by_type: "student",
  }));

  const { data, error } = await supabase
    .from("reservations")
    .insert(rows)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("reservation_activity_log").insert(
    rows.map(row => ({
      action_type: "student_reserved",
      room_name: row.room_name,
      action_date: row.reserved_date,
      time_start: row.time_start,
      time_end: row.time_end,
      student_email: row.student_email,
      details: "Student reserved a lab slot.",
    }))
  );

  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "Missing reservation id" },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const studentEmail = await getActiveStudentEmail(supabase, cookieStore);

  if (!studentEmail) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { data: existingReservation, error: readError } = await supabase
    .from("reservations")
    .select("id, reserved_date, time_start, student_email")
    .eq("id", id)
    .eq("student_email", studentEmail)
    .single();

  if (readError || !existingReservation) {
    return NextResponse.json(
      { error: "Reservation not found." },
      { status: 404 }
    );
  }

  if (
    isPastOrTooSoon(
      existingReservation.reserved_date,
      existingReservation.time_start
    )
  ) {
    return NextResponse.json(
      { error: "This reservation can no longer be cancelled." },
      { status: 409 }
    );
  }

  const { error } = await supabase
    .from("reservations")
    .delete()
    .eq("id", id)
    .eq("student_email", studentEmail);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
