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

const LOOKAHEAD_WEEKS = 5;

function normalizeDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getManilaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: string) =>
    parts.find(part => part.type === type)?.value ?? "00";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDaysToDateString(dateString: string, days: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  date.setDate(date.getDate() + days);

  return normalizeDate(date);
}

function getUpcomingClassDates(dayOfWeek: number) {
  const today = getManilaToday();
  const [year, month, day] = today.split("-").map(Number);
  const start = new Date(year, month - 1, day);

  const todayDay = start.getDay();
  const daysUntilClass = (dayOfWeek - todayDay + 7) % 7;

  const firstClassDate = addDaysToDateString(today, daysUntilClass);

  return Array.from({ length: LOOKAHEAD_WEEKS }, (_, index) =>
    addDaysToDateString(firstClassDate, index * 7)
  );
}

function dateMatchesDayOfWeek(dateString: string, dayOfWeek: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return date.getDay() === dayOfWeek;
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

  const scheduleIds = (assignments ?? []).map(
    assignment => assignment.weekly_lab_schedule_id
  );

  const allUpcomingDates = (assignments ?? []).flatMap((assignment: any) => {
    const schedule = Array.isArray(assignment.weekly_lab_schedules)
      ? assignment.weekly_lab_schedules[0]
      : assignment.weekly_lab_schedules;

    if (!schedule) return [];

    return getUpcomingClassDates(schedule.day_of_week);
  });

  const minDate = [...allUpcomingDates].sort((a, b) => a.localeCompare(b))[0];
  const maxDate = [...allUpcomingDates].sort((a, b) => b.localeCompare(a))[0];

  let noClassDates: any[] = [];

  if (scheduleIds.length > 0 && minDate && maxDate) {
    const { data: noClassData, error: noClassError } = await supabase
      .from("instructor_class_no_class_dates")
      .select("id, weekly_lab_schedule_id, no_class_date")
      .in("weekly_lab_schedule_id", scheduleIds)
      .gte("no_class_date", minDate)
      .lte("no_class_date", maxDate);

    if (noClassError) {
      return NextResponse.json(
        { error: noClassError.message },
        { status: 500 }
      );
    }

    noClassDates = noClassData ?? [];
  }

  const classes = (assignments ?? [])
    .map((assignment: any) => {
      const schedule = Array.isArray(assignment.weekly_lab_schedules)
        ? assignment.weekly_lab_schedules[0]
        : assignment.weekly_lab_schedules;

      if (!schedule) return null;

      const upcoming_dates = getUpcomingClassDates(schedule.day_of_week).map(
        date => {
          const exception = noClassDates.find(
            item =>
              Number(item.weekly_lab_schedule_id) === Number(schedule.id) &&
              item.no_class_date === date
          );

          return {
            date,
            no_class: Boolean(exception),
            no_class_id: exception?.id ?? null,
          };
        }
      );

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
        upcoming_dates,
      };
    })
    .filter(Boolean);

  return NextResponse.json(classes);
}

export async function PATCH(request: Request) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const auth = await getInstructorFromGoogleSession(supabase);

  if (!auth.email) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  const body = await request.json();

  const assignmentId = Number(body.assignment_id);
  const noClassDate = String(body.no_class_date ?? "").trim();
  const holdNoClass = body.hold_no_class === true;

  if (!assignmentId || !noClassDate) {
    return NextResponse.json(
      { error: "Missing class assignment or date." },
      { status: 400 }
    );
  }

  const today = getManilaToday();

  if (noClassDate < today) {
    return NextResponse.json(
      { error: "You cannot change past class dates." },
      { status: 409 }
    );
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from("instructor_class_assignments")
    .select(
      `
      id,
      instructor_email,
      weekly_lab_schedule_id,
      weekly_lab_schedules (
        id,
        room_name,
        day_of_week,
        course_name,
        time_start,
        time_end
      )
    `
    )
    .eq("id", assignmentId)
    .ilike("instructor_email", auth.email)
    .single();

  if (assignmentError || !assignment) {
    return NextResponse.json(
      { error: "Class assignment not found." },
      { status: 404 }
    );
  }

  const schedule = Array.isArray(assignment.weekly_lab_schedules)
    ? assignment.weekly_lab_schedules[0]
    : assignment.weekly_lab_schedules;

  if (!schedule) {
    return NextResponse.json(
      { error: "Class schedule not found." },
      { status: 404 }
    );
  }

  if (!dateMatchesDayOfWeek(noClassDate, schedule.day_of_week)) {
    return NextResponse.json(
      {
        error: `This date is not a ${formatDay(schedule.day_of_week)} class date.`,
      },
      { status: 400 }
    );
  }

  if (holdNoClass) {
    const { error: insertError } = await supabase
      .from("instructor_class_no_class_dates")
      .insert({
        instructor_class_assignment_id: assignment.id,
        weekly_lab_schedule_id: assignment.weekly_lab_schedule_id,
        no_class_date: noClassDate,
        instructor_email: auth.email,
      });

    if (insertError && insertError.code !== "23505") {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    await supabase.from("reservation_activity_log").insert({
      action_type: "instructor_no_class",
      room_name: schedule.room_name,
      action_date: noClassDate,
      time_start: schedule.time_start,
      time_end: schedule.time_end,
      staff_id: null,
      student_email: null,
      details: `${schedule.course_name} marked as no class by ${auth.email}.`,
    });

    return NextResponse.json({ ok: true, no_class: true });
  }

  const { error: deleteError } = await supabase
    .from("instructor_class_no_class_dates")
    .delete()
    .eq("instructor_class_assignment_id", assignment.id)
    .eq("weekly_lab_schedule_id", assignment.weekly_lab_schedule_id)
    .eq("no_class_date", noClassDate);

  if (deleteError) {
    return NextResponse.json(
      { error: deleteError.message },
      { status: 500 }
    );
  }

  await supabase.from("reservation_activity_log").insert({
    action_type: "instructor_resume_class",
    room_name: schedule.room_name,
    action_date: noClassDate,
    time_start: schedule.time_start,
    time_end: schedule.time_end,
    staff_id: null,
    student_email: null,
    details: `${schedule.course_name} restored as class day by ${auth.email}.`,
  });

  return NextResponse.json({ ok: true, no_class: false });
}
