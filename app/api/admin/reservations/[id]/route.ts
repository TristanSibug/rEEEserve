import { NextResponse } from "next/server";
import { createClient } from "../../../../../utils/supabase/server";
import { cookies } from "next/headers";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

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

function isPastReservation(date: string, timeEnd: string) {
  const { today, nowMinutes } = getManilaDateTime();

  if (date < today) return true;
  if (date > today) return false;

  return timeToMinutes(timeEnd) <= nowMinutes;
}

function overlaps(startA: string, endA: string, startB: string, endB: string) {
  return (
    timeToMinutes(startA) < timeToMinutes(endB) &&
    timeToMinutes(endA) > timeToMinutes(startB)
  );
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const staffRole = cookieStore.get("staff_role")?.value;
  const staffId = cookieStore.get("staff_id")?.value;

  if (staffRole !== "admin") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const reservationId = Number(id);

  if (!Number.isFinite(reservationId)) {
    return NextResponse.json(
      { error: "Invalid reservation ID." },
      { status: 400 }
    );
  }

  const body = await request.json();

  const roomName = String(body.room_name ?? "").trim();
  const reservedDate = String(body.reserved_date ?? "").trim();
  const timeStart = String(body.time_start ?? "").trim();
  const timeEnd = String(body.time_end ?? "").trim();
  const status = String(body.status ?? "approved").trim();

  if (!roomName || !reservedDate || !timeStart || !timeEnd) {
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

  const { data: existingReservation, error: existingError } = await supabase
    .from("reservations")
    .select("id, room_name, reserved_date, time_start, time_end, status")
    .eq("id", reservationId)
    .single();

  if (existingError || !existingReservation) {
    return NextResponse.json(
      { error: "Reservation not found." },
      { status: 404 }
    );
  }

  if (
    isPastReservation(
      existingReservation.reserved_date,
      existingReservation.time_end
    )
  ) {
    return NextResponse.json(
      { error: "Past reservations can no longer be edited." },
      { status: 409 }
    );
  }

  if (isPastOrTooSoon(reservedDate, timeStart)) {
    return NextResponse.json(
      { error: "This timeslot is no longer available." },
      { status: 409 }
    );
  }

  const [year, month, day] = reservedDate.split("-").map(Number);
  const selectedDate = new Date(year, month - 1, day);
  const dayOfWeek = selectedDate.getDay();

  const { data: weeklySchedules, error: weeklyError } = await supabase
    .from("weekly_lab_schedules")
    .select("id, time_start, time_end, course_name")
    .eq("room_name", roomName)
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
    .eq("room_name", roomName)
    .eq("block_date", reservedDate);

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

  const { data: sameSlotReservations, error: reservationError } = await supabase
    .from("reservations")
    .select("id, time_start, time_end, status")
    .eq("room_name", roomName)
    .eq("reserved_date", reservedDate)
    .in("status", ["pending", "approved"]);

  if (reservationError) {
    return NextResponse.json(
      { error: reservationError.message },
      { status: 500 }
    );
  }

  const overlappingReservations = (sameSlotReservations ?? []).filter(r => {
    if (Number(r.id) === reservationId) return false;
    return overlaps(timeStart, timeEnd, r.time_start, r.time_end);
  });

  const roomCapacity =
    roomName === "EEEI 308"
      ? 16
      : roomName === "EEEI 301" || roomName === "EEEI 305"
        ? 10
        : 10;

  if (overlappingReservations.length >= roomCapacity) {
    return NextResponse.json(
      { error: "This timeslot is already full." },
      { status: 409 }
    );
  }

  const { data: updatedReservation, error: updateError } = await supabase
    .from("reservations")
    .update({
      room_name: roomName,
      reserved_date: reservedDate,
      time_start: timeStart,
      time_end: timeEnd,
      status,
    })
    .eq("id", reservationId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await supabase.from("reservation_activity_log").insert({
    reservation_id: reservationId,
    action_type: "admin_updated_reservation",
    room_name: roomName,
    action_date: reservedDate,
    time_start: timeStart,
    time_end: timeEnd,
    staff_id: staffId ? Number(staffId) : null,
    details: `Admin updated reservation #${reservationId}.`,
  });

  return NextResponse.json({
    ok: true,
    reservation: updatedReservation,
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const staffRole = cookieStore.get("staff_role")?.value;
  const staffId = cookieStore.get("staff_id")?.value;

  if (staffRole !== "admin") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const reservationId = Number(id);

  if (!Number.isFinite(reservationId)) {
    return NextResponse.json(
      { error: "Invalid reservation ID." },
      { status: 400 }
    );
  }

  const { data: existingReservation, error: existingError } = await supabase
    .from("reservations")
    .select("id, room_name, reserved_date, time_start, time_end, status")
    .eq("id", reservationId)
    .single();

  if (existingError || !existingReservation) {
    return NextResponse.json(
      { error: "Reservation not found." },
      { status: 404 }
    );
  }

  if (
    isPastReservation(
      existingReservation.reserved_date,
      existingReservation.time_end
    )
  ) {
    return NextResponse.json(
      { error: "Past reservations can no longer be removed." },
      { status: 409 }
    );
  }

  const { data: cancelledReservation, error: cancelError } = await supabase
    .from("reservations")
    .update({
      status: "cancelled_by_admin",
      cancelled_by_staff_id: staffId ? Number(staffId) : null,
      cancellation_reason: "Cancelled by admin.",
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", reservationId)
    .select()
    .single();

  if (cancelError) {
    return NextResponse.json({ error: cancelError.message }, { status: 500 });
  }

  await supabase.from("reservation_activity_log").insert({
    reservation_id: reservationId,
    action_type: "admin_cancelled_reservation",
    room_name: existingReservation.room_name,
    action_date: existingReservation.reserved_date,
    time_start: existingReservation.time_start,
    time_end: existingReservation.time_end,
    staff_id: staffId ? Number(staffId) : null,
    details: `Admin cancelled reservation #${reservationId}.`,
  });

  return NextResponse.json({
    ok: true,
    reservation: cancelledReservation,
  });
}
