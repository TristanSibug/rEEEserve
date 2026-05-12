import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "../../../../utils/supabase/server";

function formatDay(day: number) {
  const days: Record<number, string> = {
    0: "Sunday",
    1: "Monday",
    2: "Tuesday",
    3: "Wednesday",
    4: "Thursday",
    5: "Friday",
    6: "Saturday",
  };

  return days[day] ?? `Day ${day}`;
}

async function getInstructorFromGoogleSession(supabase: any) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    return {
      email: null,
      error: "You must be logged in with Google to view instructor classes.",
      status: 401,
    };
  }

  const email = user.email.toLowerCase();

  const { data: staff, error: staffError } = await supabase
    .from("staff_credentials")
    .select("id, role, email")
    .eq("role", "instructor")
    .ilike("email", email)
    .maybeSingle();

  if (staffError) {
    return {
      email: null,
      error: staffError.message,
      status: 500,
    };
  }

  if (!staff) {
    return {
      email,
      error: "Only instructors can view instructor classes.",
      status: 403,
    };
  }

  return {
    email,
    error: null,
    status: 200,
  };
}

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const auth = await getInstructorFromGoogleSession(supabase);

  if (!auth.email) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  const { data: assignments, error: assignmentError } = await supabase
    .from("instructor_class_assignments")
    .select(
      `
      id,
      class_share_enabled,
      shared_walkin_slots,
      weekly_lab_schedule_id,
      weekly_lab_schedules (
        id,
        room_name,
        day_of_week,
        course_name,
        time_start,
        time_end,
        status
      )
    `
    )
    .ilike("instructor_email", auth.email)
    .order("id", { ascending: true });

  if (assignmentError) {
    return NextResponse.json(
      { error: assignmentError.message },
      { status: 500 }
    );
  }

  const classes = (assignments ?? [])
    .map((assignment: any) => {
      const schedule = Array.isArray(assignment.weekly_lab_schedules)
        ? assignment.weekly_lab_schedules[0]
        : assignment.weekly_lab_schedules;

      if (!schedule) return null;

      return {
        assignment_id: assignment.id,
        schedule_id: schedule.id,
        course_name: schedule.course_name,
        room_name: schedule.room_name,
        day_of_week: schedule.day_of_week,
        day_label: formatDay(schedule.day_of_week),
        time_start: schedule.time_start,
        time_end: schedule.time_end,
        status: schedule.status,
        class_share_enabled: assignment.class_share_enabled,
        shared_walkin_slots: assignment.shared_walkin_slots,
      };
    })
    .filter(Boolean);

  return NextResponse.json(classes);
}
