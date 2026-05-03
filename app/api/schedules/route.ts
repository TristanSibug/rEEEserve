import { NextResponse } from "next/server";
import { createClient } from "../../../utils/supabase/server";
import { cookies } from "next/headers";

const ROOM_CAPACITY: Record<string, number> = {
  "EEEI 301": 10,
  "EEEI 305": 10,
  "EEEI 308": 16,
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const date = searchParams.get("date");
  const room = searchParams.get("room");

  if (!date || !room) {
    return NextResponse.json(
      { error: "Missing date or room" },
      { status: 400 }
    );
  }

  const [year, month, day] = date.split("-").map(Number);
  const selectedDate = new Date(year, month - 1, day);
  const dayOfWeek = selectedDate.getDay();

  const capacity = ROOM_CAPACITY[room] ?? 10;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: weeklySchedules, error: weeklyError } = await supabase
    .from("weekly_lab_schedules")
    .select("id, room_name, day_of_week, course_name, time_start, time_end, status")
    .eq("room_name", room)
    .eq("day_of_week", dayOfWeek);

  if (weeklyError) {
    return NextResponse.json({ error: weeklyError.message }, { status: 500 });
  }

  const { data: roomBlocks, error: blockError } = await supabase
    .from("room_schedule_blocks")
    .select("id, room_name, block_date, time_start, time_end, block_type, label, created_by_staff_id, created_by_role")
    .eq("room_name", room)
    .eq("block_date", date);

  if (blockError) {
    return NextResponse.json({ error: blockError.message }, { status: 500 });
  }

  const { data: reservations, error: reservationError } = await supabase
    .from("reservations")
    .select("id, room_name, reserved_date, time_start, time_end, status")
    .eq("room_name", room)
    .eq("reserved_date", date)
    .in("status", ["approved"]);

  if (reservationError) {
    return NextResponse.json({ error: reservationError.message }, { status: 500 });
  }

  const formattedWeekly = (weeklySchedules ?? []).map(item => ({
    id: `weekly-${item.id}`,
    room_name: item.room_name,
    schedule_date: date,
    course_name: item.course_name,
    status: item.status ?? "occupied",
    time_start: item.time_start,
    time_end: item.time_end,
    source: "weekly",
    capacity,
    reserved_count: null,
    slots_left: null,
  }));

  const formattedBlocks = (roomBlocks ?? []).map(item => ({
    id: `block-${item.id}`,
    schedule_id: item.id,
    room_name: item.room_name,
    schedule_date: item.block_date,
    course_name: item.label,
    status: item.block_type,
    time_start: item.time_start,
    time_end: item.time_end,
    source: "one-time",
    capacity,
    reserved_count: null,
    slots_left: null,
  }));

  const formattedReservations = (reservations ?? []).map(item => ({
    id: `reservation-${item.id}`,
    room_name: item.room_name,
    schedule_date: item.reserved_date,
    course_name: null,
    status: "student-reservation",
    time_start: item.time_start,
    time_end: item.time_end,
    source: "reservation",
    capacity,
    reserved_count: null,
    slots_left: null,
  }));

  return NextResponse.json([
    ...formattedWeekly,
    ...formattedBlocks,
    ...formattedReservations,
  ]);
}
