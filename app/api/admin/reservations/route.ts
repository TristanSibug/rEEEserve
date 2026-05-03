import { NextResponse } from "next/server";
import { createClient } from "../../../../utils/supabase/server";
import { cookies } from "next/headers";

const ROOM_CAPACITY: Record<string, number> = {
  "EEEI 301": 10,
  "EEEI 305": 10,
  "EEEI 308": 16,
};

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
  };
}

function isPastOrTooSoon(date: string, timeStart: string) {
  const { today, nowMinutes } = getManilaDateTime();

  if (date < today) return true;
  if (date > today) return false;

  return timeToMinutes(timeStart) < nowMinutes + 30;
}

// GET — fetch all student reservations
export async function GET() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const staffRole = cookieStore.get("staff_role")?.value;

  if (staffRole !== "admin") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .order("reserved_date", { ascending: true })
    .order("time_start", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// POST — admin creates reservation for a student
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const body = await request.json();

  const staffRole = cookieStore.get("staff_role")?.value;

  if (staffRole !== "admin") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const studentNum = String(body.student_num ?? "").trim();
  const room = String(body.room_name ?? "").trim();
  const date = String(body.reserved_date ?? "").trim();
  const timeStart = String(body.time_start ?? "").trim();
  const timeEnd = String(body.time_end ?? "").trim();
  const status = body.status ?? "approved";

  if (!studentNum || !room || !date || !timeStart || !timeEnd) {
    return NextResponse.json(
      { error: "Missing reservation details." },
      { status: 400 }
    );
  }

  const capacity = ROOM_CAPACITY[room];

  if (!capacity) {
    return NextResponse.json(
      { error: "Invalid room selected." },
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

  const [year, month, day] = date.split("-").map(Number);
  const selectedDate = new Date(year, month - 1, day);
  const dayOfWeek = selectedDate.getDay();

  // 1. Block weekly class conflicts
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

  // 2. Block one-time admin/instructor conflicts
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
          "This slot is already blocked or reserved by staff.",
      },
      { status: 409 }
    );
  }

  // 3. Find student
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, email")
    .eq("student_num", studentNum)
    .single();

  if (studentError || !student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  // 4. Check existing approved reservations for this room/date
  const { data: activeReservations, error: reservationError } = await supabase
    .from("reservations")
    .select("id, student_email, time_start, time_end, status")
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

  // 5. Prevent duplicate reservation for same student in same overlapping slot
  const duplicate = conflicts.some(r => r.student_email === student.email);

  if (duplicate) {
    return NextResponse.json(
      { error: "This student already has a reservation in this timeslot." },
      { status: 409 }
    );
  }

  // 6. Check capacity
  if (conflicts.length >= capacity) {
    return NextResponse.json(
      { error: "This timeslot is already full." },
      { status: 409 }
    );
  }

  // 7. Insert student reservation
  const { data, error } = await supabase
    .from("reservations")
    .insert({
      student_id: student.id,
      student_email: student.email,
      room_name: room,
      reserved_date: date,
      time_start: timeStart,
      time_end: timeEnd,
      status,
      created_by_type: "admin",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
