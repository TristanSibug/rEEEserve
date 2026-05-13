import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "../../../../../utils/supabase/server";

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

function buildSlots(startMinutes: number, maxSlots: number) {
  const slots: { time_start: string; time_end: string }[] = [];

  for (let i = 0; i < maxSlots; i++) {
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
  const baseCapacity = ROOM_CAPACITY[room] ?? 10;

  const { data: weeklySchedules, error: weeklyError } = await supabase
    .from("weekly_lab_schedules")
    .select("id, time_start, time_end")
    .eq("room_name", room)
    .eq("day_of_week", dayOfWeek);

  if (weeklyError) throw new Error(weeklyError.message);

  const weeklyScheduleIds = (weeklySchedules ?? []).map((schedule: any) =>
    Number(schedule.id)
  );

  let classAssignments: any[] = [];
  let noClassDates: any[] = [];

  if (weeklyScheduleIds.length > 0) {
    const { data: assignmentData, error: assignmentError } = await supabase
      .from("instructor_class_assignments")
      .select("weekly_lab_schedule_id, class_share_enabled, shared_walkin_slots")
      .in("weekly_lab_schedule_id", weeklyScheduleIds);

    if (assignmentError) throw new Error(assignmentError.message);

    classAssignments = assignmentData ?? [];

    const { data: noClassData, error: noClassError } = await supabase
      .from("instructor_class_no_class_dates")
      .select("weekly_lab_schedule_id, no_class_date")
      .in("weekly_lab_schedule_id", weeklyScheduleIds)
      .eq("no_class_date", date);

    if (noClassError) throw new Error(noClassError.message);

    noClassDates = noClassData ?? [];
  }

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
    const blockedByRoomBlock = (roomBlocks ?? []).some((block: any) =>
      overlaps(slot.time_start, slot.time_end, block.time_start, block.time_end)
    );

    if (blockedByRoomBlock) break;

    let slotCapacity = baseCapacity;
    let blockedByWeeklyClass = false;

    const overlappingWeeklySchedules = (weeklySchedules ?? []).filter(
      (schedule: any) =>
        overlaps(
          slot.time_start,
          slot.time_end,
          schedule.time_start,
          schedule.time_end
        )
    );

    for (const schedule of overlappingWeeklySchedules) {
      const scheduleId = Number(schedule.id);

      const isNoClass = noClassDates.some(
        item => Number(item.weekly_lab_schedule_id) === scheduleId
      );

      if (isNoClass) {
        continue;
      }

      const enabledShares = classAssignments.filter(
        assignment =>
          Number(assignment.weekly_lab_schedule_id) === scheduleId &&
          assignment.class_share_enabled === true &&
          Number(assignment.shared_walkin_slots) > 0
      );

      if (enabledShares.length === 0) {
        blockedByWeeklyClass = true;
        break;
      }

      const sharedSlots = Math.max(
        ...enabledShares.map(assignment =>
          Number(assignment.shared_walkin_slots)
        )
      );

      slotCapacity = Math.min(slotCapacity, sharedSlots);
    }

    if (blockedByWeeklyClass) break;

    const reservationCount = (reservations ?? []).filter((reservation: any) =>
      overlaps(
        slot.time_start,
        slot.time_end,
        reservation.time_start,
        reservation.time_end
      )
    ).length;

    if (reservationCount >= slotCapacity) break;

    continuousSlots++;
  }

  return {
    room_name: room,
    continuous_slots: continuousSlots,
    continuous_minutes: continuousSlots * 30,
  };
}

export async function GET() {
  try {
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
      return NextResponse.json({
        ok: true,
        available: false,
        message: "Walk-ins are no longer available today.",
        date: today,
        start_time: null,
        max_slots: 0,
        max_minutes: 0,
        max_label: "0 mins",
        options: [],
        rooms: [],
      });
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

    const remainingDailyMinutes = Math.max(0, MAX_DAILY_MINUTES - usedMinutes);
    const remainingDailySlots = Math.floor(remainingDailyMinutes / 30);

    if (remainingDailySlots <= 0) {
      return NextResponse.json({
        ok: true,
        available: false,
        message: "You already reached the 3-hour reservation limit for today.",
        date: today,
        start_time: minutesToTime(startMinutes),
        max_slots: 0,
        max_minutes: 0,
        max_label: "0 mins",
        options: [],
        rooms: [],
      });
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

    const maxRoomSlots = Math.max(
      0,
      ...roomAvailability.map(room => room.continuous_slots)
    );

    const maxRoomMinutes = maxRoomSlots * 30;

    const selectableSlots = Math.min(
      MAX_WALK_IN_SLOTS,
      remainingDailySlots,
      maxRoomSlots
    );

    const selectableMinutes = selectableSlots * 30;

    const options = Array.from({ length: selectableSlots }, (_, index) => {
      const slots = index + 1;
      const minutes = slots * 30;

      return {
        slots,
        minutes,
        label: getDurationLabel(minutes),
      };
    });

    return NextResponse.json({
      ok: true,
      available: selectableSlots > 0,
      message:
        selectableSlots > 0
          ? "Walk-in slots are available."
          : "No lab can accommodate a walk-in starting now.",
      date: today,
      start_time: minutesToTime(startMinutes),

      // This is the real lab availability maximum.
      max_slots: maxRoomSlots,
      max_minutes: maxRoomMinutes,
      max_label: getDurationLabel(maxRoomMinutes),

      // This is what the student can actually choose after daily-limit rules.
      selectable_slots: selectableSlots,
      selectable_minutes: selectableMinutes,
      selectable_label: getDurationLabel(selectableMinutes),

      options,
      rooms: roomAvailability,
      remaining_daily_minutes: remainingDailyMinutes,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to check walk-in availability." },
      { status: 500 }
    );
  }
}
