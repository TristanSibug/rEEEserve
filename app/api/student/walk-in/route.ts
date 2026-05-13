import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "../../../../utils/supabase/server";

const ROOMS = ["EEEI 301", "EEEI 305", "EEEI 308"] as const;

const ROOM_CAPACITY: Record<string, number> = {
  "EEEI 301": 10,
  "EEEI 305": 10,
  "EEEI 308": 16,
};

const MAX_DAILY_MINUTES = 180;
const MAX_WALK_IN_SLOTS = 6;
const LAB_START_MINUTES = 8 * 60;
const LAB_END_MINUTES = 16 * 60;

type Slot = {
  time_start: string;
  time_end: string;
};

type RoomAvailability = {
  room_name: string;
  continuous_slots: number;
  continuous_minutes: number;
};

function timeToMinutes(t: string) {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
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
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    nowMinutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function roundUpToNextHalfHour(minutes: number) {
  if (minutes % 30 === 0) return minutes;
  return Math.ceil(minutes / 30) * 30;
}

function getDurationLabel(minutes: number) {
  if (minutes === 30) return "30 mins";
  if (minutes === 60) return "1 hour";
  if (minutes === 90) return "1 hr 30 mins";
  if (minutes === 120) return "2 hours";
  if (minutes === 150) return "2 hrs 30 mins";
  if (minutes === 180) return "3 hours";
  return `${minutes} mins`;
}

function buildSlots(startMinutes: number, slotCount: number): Slot[] {
  const slots: Slot[] = [];

  for (let i = 0; i < slotCount; i++) {
    const slotStart = startMinutes + i * 30;
    const slotEnd = slotStart + 30;

    if (slotStart < LAB_START_MINUTES) continue;
    if (slotEnd > LAB_END_MINUTES) break;

    slots.push({
      time_start: minutesToTime(slotStart),
      time_end: minutesToTime(slotEnd),
    });
  }

  return slots;
}

async function getAvailabilityForRoom(params: {
  supabase: any;
  room: string;
  date: string;
  dayOfWeek: number;
  startMinutes: number;
}) {
  const { supabase, room, date, dayOfWeek, startMinutes } = params;

  const slots = buildSlots(startMinutes, MAX_WALK_IN_SLOTS);
  const capacity = ROOM_CAPACITY[room] ?? 10;

  const { data: weeklySchedules, error: weeklyError } = await supabase
    .from("weekly_lab_schedules")
    .select("id, time_start, time_end")
    .eq("room_name", room)
    .eq("day_of_week", dayOfWeek);

  if (weeklyError) throw new Error(weeklyError.message);

  const { data: roomBlocks, error: blockError } = await supabase
    .from("room_schedule_blocks")
    .select("id, time_start, time_end")
    .eq("room_name", room)
    .eq("block_date", date);

  if (blockError) throw new Error(blockError.message);

  const { data: reservations, error: reservationError } = await supabase
    .from("reservations")
    .select("id, student_email, time_start, time_end, status")
    .eq("room_name", room)
    .eq("reserved_date", date)
    .eq("status", "approved");

  if (reservationError) throw new Error(reservationError.message);

  let continuousSlots = 0;

  for (const slot of slots) {
    const blockedByWeekly = (weeklySchedules ?? []).some((schedule: any) =>
      overlaps(slot.time_start, slot.time_end, schedule.time_start, schedule.time_end)
    );

    const blockedByRoomBlock = (roomBlocks ?? []).some((block: any) =>
      overlaps(slot.time_start, slot.time_end, block.time_start, block.time_end)
    );

    if (blockedByWeekly || blockedByRoomBlock) break;

    const reservationCount = (reservations ?? []).filter((reservation: any) =>
      overlaps(
        slot.time_start,
        slot.time_end,
        reservation.time_start,
        reservation.time_end
      )
    ).length;

    if (reservationCount >= capacity) break;

    continuousSlots++;
  }

  return {
    room_name: room,
    continuous_slots: continuousSlots,
    continuous_minutes: continuousSlots * 30,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const requestedSlots = Number(body.slots);
    const requestedRoom = String(body.room_name ?? "").trim();

    if (!Number.isInteger(requestedSlots)) {
      return NextResponse.json(
        { error: "Invalid walk-in duration." },
        { status: 400 }
      );
    }

    if (requestedSlots < 1 || requestedSlots > MAX_WALK_IN_SLOTS) {
      return NextResponse.json(
        { error: "Walk-in duration must be between 30 minutes and 3 hours." },
        { status: 400 }
      );
    }

    if (!requestedRoom) {
      return NextResponse.json(
        { error: "Please choose a lab for your walk-in reservation." },
        { status: 400 }
      );
    }

    if (!ROOMS.includes(requestedRoom as any)) {
      return NextResponse.json(
        { error: "Invalid lab selected." },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.email) {
      return NextResponse.json({ error: "Not logged in." }, { status: 401 });
    }

    const { today, nowMinutes } = getManilaDateTime();

    const startMinutes = Math.max(
      LAB_START_MINUTES,
      roundUpToNextHalfHour(nowMinutes)
    );

    if (startMinutes >= LAB_END_MINUTES) {
      return NextResponse.json(
        { error: "Walk-ins are no longer available today." },
        { status: 409 }
      );
    }

    const [year, month, day] = today.split("-").map(Number);
    const selectedDate = new Date(year, month - 1, day);
    const dayOfWeek = selectedDate.getDay();

    const { data: todayReservations, error: todayReservationError } = await supabase
      .from("reservations")
      .select("id, time_start, time_end, status")
      .eq("student_email", user.email)
      .eq("reserved_date", today)
      .eq("status", "approved");

    if (todayReservationError) {
      return NextResponse.json(
        { error: todayReservationError.message },
        { status: 500 }
      );
    }

    const usedMinutes = (todayReservations ?? []).reduce(
      (sum: number, reservation: any) => {
        return (
          sum +
          Math.max(
            0,
            timeToMinutes(reservation.time_end) -
            timeToMinutes(reservation.time_start)
          )
        );
      },
      0
    );

    const requestedMinutes = requestedSlots * 30;
    const remainingDailyMinutes = MAX_DAILY_MINUTES - usedMinutes;

    if (remainingDailyMinutes < requestedMinutes) {
      return NextResponse.json(
        {
          error:
            "This walk-in would exceed your 3-hour reservation limit for today.",
        },
        { status: 409 }
      );
    }

    const roomAvailability: RoomAvailability[] = [];

    for (const room of ROOMS) {
      const availability = await getAvailabilityForRoom({
        supabase,
        room,
        date: today,
        dayOfWeek,
        startMinutes,
      });

      roomAvailability.push(availability);
    }

    const selectedRoom = roomAvailability.find(
      room =>
        room.room_name === requestedRoom &&
        room.continuous_slots >= requestedSlots
    );

    if (!selectedRoom) {
      return NextResponse.json(
        {
          error:
            "That lab is no longer available for the selected walk-in duration.",
        },
        { status: 409 }
      );
    }

    const slots = buildSlots(startMinutes, requestedSlots);

    if (slots.length !== requestedSlots) {
      return NextResponse.json(
        { error: "Selected walk-in duration exceeds today's lab hours." },
        { status: 409 }
      );
    }

    const rows = slots.map(slot => ({
      student_id: null,
      student_email: user.email,
      room_name: selectedRoom.room_name,
      reserved_date: today,
      time_start: slot.time_start,
      time_end: slot.time_end,
      status: "approved",
      created_by_type: "student",
      reservation_type: "walk_in",
    }));

    const { data: insertedReservations, error: insertError } = await supabase
      .from("reservations")
      .insert(rows)
      .select();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    await supabase.from("reservation_activity_log").insert(
      rows.map(row => ({
        action_type: "walk_in_reserved",
        room_name: row.room_name,
        action_date: row.reserved_date,
        time_start: row.time_start,
        time_end: row.time_end,
        student_email: row.student_email,
        reservation_type: "walk_in",
        details: `Student created a walk-in reservation for ${getDurationLabel(
          requestedMinutes
        )}.`,
      }))
    );

    return NextResponse.json({
      ok: true,
      message: "Walk-in reservation created.",
      room_name: selectedRoom.room_name,
      reserved_date: today,
      time_start: slots[0].time_start,
      time_end: slots[slots.length - 1].time_end,
      duration_minutes: requestedMinutes,
      duration_label: getDurationLabel(requestedMinutes),
      reservations: insertedReservations,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create walk-in reservation." },
      { status: 500 }
    );
  }
}
