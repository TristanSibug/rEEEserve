import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "../../../../utils/supabase/server";
import { sendReservationCancelledEmail } from "../../../../utils/email";

const RESERVATION_LEAD_TIME_MINUTES = 60;

function normalizeTime(t: string) {
  return t.slice(0, 5);
}

function timeToMinutes(t: string) {
  const clean = normalizeTime(t);
  const [h, m] = clean.split(":").map(Number);
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

  return (
    timeToMinutes(timeStart) <
    nowMinutes + RESERVATION_LEAD_TIME_MINUTES
  );
}

function formatNameFromEmail(email: string) {
  const namePart = email.split("@")[0];

  return namePart
    .split(".")
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatFirstGivenAndLastNameFromEmail(email: string) {
  const parts = email
    .split("@")[0]
    .split(".")
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());

  if (parts.length <= 1) {
    return parts[0] ?? "Instructor";
  }

  return `${parts[0]} ${parts[parts.length - 1]}`;
}

async function getInstructorFromGoogleSession(supabase: any) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    return {
      staff: null,
      email: null,
      error: "You must be logged in with Google to use instructor reservations.",
      status: 401,
    };
  }

  const { data: staff, error: staffError } = await supabase
    .from("staff_credentials")
    .select("id, role, email")
    .eq("role", "instructor")
    .ilike("email", user.email)
    .maybeSingle();

  if (staffError) {
    return {
      staff: null,
      email: null,
      error: staffError.message,
      status: 500,
    };
  }

  if (!staff) {
    return {
      staff: null,
      email: user.email,
      error: "Only instructors can use this reservation route.",
      status: 403,
    };
  }

  return {
    staff,
    email: user.email,
    error: null,
    status: 200,
  };
}

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const auth = await getInstructorFromGoogleSession(supabase);

  if (!auth.staff) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  const staffId = auth.staff.id;
  const { today, nowTime } = getManilaDateTime();

  const { data, error } = await supabase
    .from("room_schedule_blocks")
    .select(
      "id, room_name, block_date, time_start, time_end, block_type, label, created_by_staff_id, created_by_role"
    )
    .eq("block_type", "instructor_reservation")
    .eq("created_by_staff_id", staffId)
    .order("block_date", { ascending: true })
    .order("time_start", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const reservations = (data ?? []).map(r => ({
    id: r.id,
    room_name: r.room_name,
    schedule_date: r.block_date,
    time_start: r.time_start,
    time_end: r.time_end,
    status: r.block_type,
    course_name: r.label,
  }));

  const current = reservations.filter(r => {
    if (r.schedule_date > today) return true;
    if (r.schedule_date < today) return false;

    return r.time_end > nowTime;
  });

  const past = reservations.filter(r => {
    if (r.schedule_date < today) return true;
    if (r.schedule_date > today) return false;

    return r.time_end <= nowTime;
  });

  return NextResponse.json({ current, past });
}

export async function POST(request: Request) {
  const body = await request.json();

  const room = body.room_name;
  const date = body.schedule_date;
  const timeStart = body.time_start;
  const timeEnd = body.time_end;
  const force = body.force === true;

  if (!room || !date || !timeStart || !timeEnd) {
    return NextResponse.json(
      { error: "Missing reservation details." },
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
      { error: "This timeslot is no longer available for reservation." },
      { status: 409 }
    );
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const auth = await getInstructorFromGoogleSession(supabase);

  if (!auth.staff) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  const staffId = auth.staff.id;
  const instructorName = formatNameFromEmail(auth.email ?? auth.staff.email ?? "instructor");
  const instructorEmailName = formatFirstGivenAndLastNameFromEmail(
    auth.email ?? auth.staff.email ?? "instructor"
  );

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
          : "This slot is occupied by a class schedule.",
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
        error:
          blockConflict.label ??
          "This slot is already occupied by a room block or instructor reservation.",
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
    .eq("status", "approved");

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
            ? "This instructor reservation conflicts with 1 student booking. Creating this reservation will cancel that booking and notify the student by email. Continue?"
            : `This instructor reservation conflicts with ${conflicts.length} student bookings. Creating this reservation will cancel those bookings and notify the students by email. Continue?`,
      },
      { status: 409 }
    );
  }

  const { data: instructorReservation, error: insertError } = await supabase
    .from("room_schedule_blocks")
    .insert({
      room_name: room,
      block_date: date,
      time_start: timeStart,
      time_end: timeEnd,
      block_type: "instructor_reservation",
      label: `Reserved by ${instructorName}`,
      created_by_staff_id: staffId,
      created_by_role: "instructor",
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const conflictIds = conflicts.map(r => r.id);

  if (conflictIds.length > 0) {
    const { error: cancelError } = await supabase
      .from("reservations")
      .update({
        status: "cancelled_by_instructor",
        cancelled_by_staff_id: staffId,
        cancellation_reason: "Overridden by instructor reservation.",
        cancelled_at: new Date().toISOString(),
      })
      .in("id", conflictIds);

    if (cancelError) {
      await supabase
        .from("room_schedule_blocks")
        .delete()
        .eq("id", instructorReservation.id);

      return NextResponse.json({ error: cancelError.message }, { status: 500 });
    }
  }

  await supabase.from("reservation_activity_log").insert({
    action_type: "instructor_reserved",
    room_name: room,
    action_date: date,
    time_start: timeStart,
    time_end: timeEnd,
    staff_id: staffId,
    details: `Reserved by ${instructorName}`,
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
          instructorName: instructorEmailName,
        })
      )
  );

  return NextResponse.json({
    ok: true,
    reservation: instructorReservation,
    cancelledStudentReservations: conflicts.length,
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "Missing reservation id." },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const auth = await getInstructorFromGoogleSession(supabase);

  if (!auth.staff) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  const staffId = auth.staff.id;

  const { data: existingBlock, error: readError } = await supabase
    .from("room_schedule_blocks")
    .select(
      "id, room_name, block_date, time_start, time_end, block_type, label, created_by_staff_id"
    )
    .eq("id", Number(id))
    .eq("block_type", "instructor_reservation")
    .eq("created_by_staff_id", staffId)
    .single();

  if (readError || !existingBlock) {
    return NextResponse.json(
      { error: "Instructor reservation not found." },
      { status: 404 }
    );
  }

  if (isPastOrTooSoon(existingBlock.block_date, existingBlock.time_start)) {
    return NextResponse.json(
      { error: "This instructor reservation can no longer be cancelled." },
      { status: 409 }
    );
  }

  const { error: deleteError } = await supabase
    .from("room_schedule_blocks")
    .delete()
    .eq("id", Number(id))
    .eq("block_type", "instructor_reservation")
    .eq("created_by_staff_id", staffId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  await supabase.from("reservation_activity_log").insert({
    action_type: "instructor_cancelled_reservation",
    room_name: existingBlock.room_name,
    action_date: existingBlock.block_date,
    time_start: existingBlock.time_start,
    time_end: existingBlock.time_end,
    staff_id: staffId,
    details: `Cancelled ${existingBlock.label ?? "instructor reservation"}.`,
  });

  return NextResponse.json({ ok: true });
}
