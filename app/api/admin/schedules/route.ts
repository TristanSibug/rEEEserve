import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import { cookies } from "next/headers";
import { sendReservationCancelledEmail } from "../../../../utils/email";

function normalizeTime(t: string) {
  return t.slice(0, 5);
}

function timeToMinutes(t: string) {
  const clean = normalizeTime(t);
  const [h, m] = clean.split(":").map(Number);
  return h * 60 + m;
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
  };
}

function isPastOrTooSoon(date: string, timeStart: string) {
  const { today, nowMinutes } = getManilaDateTime();

  if (date < today) return true;
  if (date > today) return false;

  return timeToMinutes(timeStart) < nowMinutes + 30;
}

function overlaps(startA: string, endA: string, startB: string, endB: string) {
  return (
    timeToMinutes(startA) < timeToMinutes(endB) &&
    timeToMinutes(endA) > timeToMinutes(startB)
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const room = searchParams.get("room");

  if (!date) {
    return NextResponse.json(
      { error: "Missing date." },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  let query = supabase
    .from("room_schedule_blocks")
    .select("*")
    .eq("block_date", date)
    .order("time_start");

  if (room) {
    query = query.eq("room_name", room);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const body = await request.json();

  const staffRole = cookieStore.get("staff_role")?.value;
  const staffId = cookieStore.get("staff_id")?.value;

  if (staffRole !== "admin") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const bookingFor = body.booking_for as "instructor" | "block";

  const room = body.room_name;
  const date = body.block_date ?? body.schedule_date;
  const timeStart = body.time_start;
  const timeEnd = body.time_end;
  const force = body.force === true;

  if (
    (bookingFor !== "instructor" && bookingFor !== "block") ||
    !room ||
    !date ||
    !timeStart ||
    !timeEnd
  ) {
    return NextResponse.json(
      { error: "Missing slot details." },
      { status: 400 }
    );
  }

  if (timeToMinutes(timeEnd) <= timeToMinutes(timeStart)) {
    return NextResponse.json(
      { error: "End time must be after start time." },
      { status: 400 }
    );
  }

  if (isPastOrTooSoon(date, timeStart)) {
    return NextResponse.json(
      { error: "This timeslot is no longer available." },
      { status: 409 }
    );
  }

  const { data: staffData } = await supabase
    .from("staff_credentials")
    .select("username")
    .eq("id", staffId)
    .single();

  const adminName = staffData?.username ?? "admin";

  const [year, month, day] = date.split("-").map(Number);
  const selectedDate = new Date(year, month - 1, day);
  const dayOfWeek = selectedDate.getDay();

  const { data: weeklySchedules, error: weeklyError } = await supabase
    .from("weekly_lab_schedules")
    .select("id, time_start, time_end, course_name")
    .eq("room_name", room)
    .eq("day_of_week", dayOfWeek);

  if (weeklyError) {
    return NextResponse.json({ error: weeklyError.message }, { status: 500 });
  }

  const weeklyConflict = (weeklySchedules ?? []).find(schedule =>
    overlaps(timeStart, timeEnd, schedule.time_start, schedule.time_end)
  );

  if (weeklyConflict) {
    return NextResponse.json(
      {
        error: weeklyConflict.course_name
          ? `This slot is occupied by ${weeklyConflict.course_name}.`
          : "This slot is occupied by a weekly class schedule.",
      },
      { status: 409 }
    );
  }

  const { data: roomBlocks, error: blockError } = await supabase
    .from("room_schedule_blocks")
    .select("id, time_start, time_end, block_type, label")
    .eq("room_name", room)
    .eq("block_date", date);

  if (blockError) {
    return NextResponse.json({ error: blockError.message }, { status: 500 });
  }

  const blockConflict = (roomBlocks ?? []).find(block =>
    overlaps(timeStart, timeEnd, block.time_start, block.time_end)
  );

  if (blockConflict) {
    return NextResponse.json(
      {
        error: blockConflict.label ?? "This slot is already blocked or reserved.",
      },
      { status: 409 }
    );
  }

  const { data: activeReservations, error: reservationError } = await supabase
    .from("reservations")
    .select(
      "id, student_email, room_name, reserved_date, time_start, time_end, status"
    )
    .eq("room_name", room)
    .eq("reserved_date", date)
    .in("status", ["pending", "approved"]);

  if (reservationError) {
    return NextResponse.json(
      { error: reservationError.message },
      { status: 500 }
    );
  }

  const conflicts = (activeReservations ?? []).filter(r =>
    overlaps(timeStart, timeEnd, r.time_start, r.time_end)
  );

  if (conflicts.length > 0 && !force) {
    return NextResponse.json(
      {
        needsConfirmation: true,
        affectedCount: conflicts.length,
        message:
          conflicts.length === 1
            ? "This action conflicts with 1 student booking. Continue and cancel that booking?"
            : `This action conflicts with ${conflicts.length} student bookings. Continue and cancel those bookings?`,
      },
      { status: 409 }
    );
  }

  const conflictIds = conflicts.map(r => r.id);

  const blockType =
    bookingFor === "instructor"
      ? "instructor_reservation"
      : body.block_type ?? "admin_block";

  const instructorName = String(body.instructor_name ?? "").trim();

  const label =
    bookingFor === "instructor"
      ? `Reserved by ${instructorName || adminName}`
      : body.label ?? `Blocked by ${adminName}`;

  const { data: insertedBlock, error: insertError } = await supabase
    .from("room_schedule_blocks")
    .insert({
      room_name: room,
      block_date: date,
      time_start: timeStart,
      time_end: timeEnd,
      block_type: blockType,
      label,
      created_by_staff_id: staffId ? Number(staffId) : null,
      created_by_role: "admin",
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  if (conflictIds.length > 0) {
    const { error: cancelError } = await supabase
      .from("reservations")
      .update({
        status: "cancelled_by_admin",
        cancelled_by_staff_id: staffId ? Number(staffId) : null,
        cancellation_reason:
          bookingFor === "instructor"
            ? "Overridden by admin for instructor reservation."
            : "Overridden by admin room block.",
        cancelled_at: new Date().toISOString(),
      })
      .in("id", conflictIds);

    if (cancelError) {
      await supabase
        .from("room_schedule_blocks")
        .delete()
        .eq("id", insertedBlock.id);

      return NextResponse.json({ error: cancelError.message }, { status: 500 });
    }
  }

  await supabase.from("reservation_activity_log").insert({
    action_type:
      bookingFor === "instructor"
        ? "admin_reserved_for_instructor"
        : "admin_blocked_room",
    room_name: room,
    action_date: date,
    time_start: timeStart,
    time_end: timeEnd,
    staff_id: staffId ? Number(staffId) : null,
    details:
      conflicts.length > 0
        ? `${label}. Cancelled ${conflicts.length} student reservation(s).`
        : label,
  });

  await Promise.allSettled(
    conflicts
      .filter(r => r.student_email)
      .map(r =>
        sendReservationCancelledEmail({
          to: r.student_email as string,
          room: r.room_name,
          date: r.reserved_date,
          timeStart: r.time_start,
          timeEnd: r.time_end,
          instructorName: adminName,
        })
      )
  );

  return NextResponse.json({
    ok: true,
    type: bookingFor,
    block: insertedBlock,
    cancelledStudentReservations: conflicts.length,
  });
}
