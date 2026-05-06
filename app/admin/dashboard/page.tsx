"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../utils/supabase/client";

type StudentReservation = {
  id: number;
  student_num?: string | null;
  student_email?: string | null;
  room_name: string;
  reserved_date: string;
  time_start: string;
  time_end: string;
  status: string;
};

type InstructorReservation = {
  id: number | string;
  instructor_name: string;
  room_name: string;
  reserved_date: string;
  time_start: string;
  time_end: string;
  status: "instructor_reservation";
};

type ActivityItem = {
  id: number | string;
  kind: "student" | "instructor";
  person: string;
  room_name: string;
  reserved_date: string;
  time_start: string;
  time_end: string;
  status: string;
};

type VisualRange = {
  id: number | string;
  schedule_id?: number | null;
  room_name: string;
  schedule_date: string;
  time_start: string;
  time_end: string;
  status: string;
  course_name?: string | null;
  source?: string;
  capacity?: number | null;
};

type DisplaySlot = {
  time_start: string;
  time_end: string;
  status: "available" | "reserved" | "full" | "occupied";
  course_name?: string | null;
  capacity: number;
  reserved_count: number;
  slots_left: number;

  blocking_id?: number | string | null;
  blocking_schedule_id?: number | null;
  blocking_source?: string | null;
  blocking_status?: string | null;
};

type ReserveFor = "student" | "instructor";
type FilterType = "student" | "instructor";
type ActivityView = "ongoing" | "pending" | "past" | "cancelled";

type ResForm = {
  reserve_for: ReserveFor;
  student_num: string;
  instructor_name: string;
  room_name: string;
  reserved_date: string;
  time_start: string;
  time_end: string;
  status: string;
};

export default function AdminDashboard() {
  const router = useRouter();
  const supabase = createClient();

  const rooms = ["EEEI 301", "EEEI 305", "EEEI 308"];

  const [studentReservations, setStudentReservations] = useState<
    StudentReservation[]
  >([]);
  const [instructorReservations, setInstructorReservations] = useState<
    InstructorReservation[]
  >([]);

  const [filterLab, setFilterLab] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("student");
  const [activityView, setActivityView] = useState<ActivityView>("ongoing");

  const [showResModal, setShowResModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ActivityItem | null>(null);

  const [resForm, setResForm] = useState<ResForm>({
    reserve_for: "student",
    student_num: "",
    instructor_name: "",
    room_name: "EEEI 308",
    reserved_date: getDefaultScheduleDate(),
    time_start: "",
    time_end: "",
    status: "approved",
  });

  const [visualRanges, setVisualRanges] = useState<VisualRange[]>([]);
  const [availableSlotsToday, setAvailableSlotsToday] = useState(0);
  const [loadingVisualSchedule, setLoadingVisualSchedule] = useState(false);

  const [scheduleDate, setScheduleDate] = useState(getDefaultScheduleDate());
  const [scheduleRoom, setScheduleRoom] = useState("EEEI 301");

  const [showSlotModal, setShowSlotModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<DisplaySlot | null>(null);

  useEffect(() => {
    fetchAllActivity();
  }, []);

  useEffect(() => {
    if (!scheduleDate || !scheduleRoom) return;
    fetchSchedule();
  }, [scheduleDate, scheduleRoom]);

  async function fetchAllActivity() {
    await Promise.all([
      fetchStudentReservations(),
      fetchInstructorReservations(),
      fetchAvailableSlotsToday(),
    ]);
  }

  async function fetchStudentReservations() {
    const res = await fetch("/api/admin/reservations");
    const data = await res.json();

    setStudentReservations(Array.isArray(data) ? data : []);
  }

  async function fetchInstructorReservations() {
    const { data, error } = await supabase
      .from("room_schedule_blocks")
      .select("id, room_name, block_date, time_start, time_end, block_type, label")
      .eq("block_type", "instructor_reservation")
      .order("block_date", { ascending: false })
      .order("time_start", { ascending: false });

    if (error) {
      console.error("Failed to fetch instructor reservations:", error);
      setInstructorReservations([]);
      return;
    }

    const mapped: InstructorReservation[] = (data ?? []).map((item: any) => ({
      id: item.id,
      instructor_name: extractInstructorName(item.label),
      room_name: item.room_name,
      reserved_date: item.block_date,
      time_start: item.time_start,
      time_end: item.time_end,
      status: "instructor_reservation",
    }));

    setInstructorReservations(mapped);
  }

  async function fetchSchedule() {
    setLoadingVisualSchedule(true);

    try {
      const visualRes = await fetch(
        `/api/schedules?date=${scheduleDate}&room=${encodeURIComponent(
          scheduleRoom
        )}`
      );

      const visualData = await visualRes.json();

      if (!visualRes.ok) {
        console.error("Failed to fetch schedule:", visualData);
        setVisualRanges([]);
        return;
      }

      setVisualRanges(Array.isArray(visualData) ? visualData : []);
    } finally {
      setLoadingVisualSchedule(false);
    }
  }

  async function fetchAvailableSlotsToday() {
    const today = getManilaNow().date;

    try {
      const results = await Promise.all(
        rooms.map(async (room) => {
          const res = await fetch(
            `/api/schedules?date=${today}&room=${encodeURIComponent(room)}`
          );

          const data = await res.json();

          if (!res.ok || !Array.isArray(data)) {
            return 0;
          }

          return countAvailableSlotsForRanges(room, today, data);
        })
      );

      setAvailableSlotsToday(results.reduce((sum, count) => sum + count, 0));
    } catch (error) {
      console.error("Failed to fetch available slots today:", error);
      setAvailableSlotsToday(0);
    }
  }

  async function handleResSave() {
    if (!resForm.room_name || !resForm.reserved_date || !resForm.time_start) {
      alert("Please complete the room, date, and start time.");
      return;
    }

    const autoTimeEnd = addMinutesToTime(resForm.time_start, 30);

    if (!autoTimeEnd) {
      alert("Invalid start time.");
      return;
    }

    if (!isSlotAllowedForDate(resForm.reserved_date, resForm.time_start)) {
      alert("You cannot create or edit a reservation for a past/cutoff timeslot.");
      return;
    }

    if (editingItem) {
      if (editingItem.kind === "student") {
        const res = await fetch(`/api/admin/reservations/${editingItem.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room_name: resForm.room_name,
            reserved_date: resForm.reserved_date,
            time_start: resForm.time_start,
            time_end: autoTimeEnd,
            status: resForm.status,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          alert(data.error ?? "Failed to update student reservation.");
          return;
        }

        setShowResModal(false);
        setEditingItem(null);
        fetchAllActivity();
        fetchSchedule();
        return;
      }

      if (editingItem.kind === "instructor") {
        const firstRes = await fetch(`/api/admin/schedules/${editingItem.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            booking_for: "instructor",
            room_name: resForm.room_name,
            block_date: resForm.reserved_date,
            time_start: resForm.time_start,
            time_end: autoTimeEnd,
            instructor_name: resForm.instructor_name,
            force: false,
          }),
        });

        const firstData = await firstRes.json();

        if (firstRes.status === 409 && firstData.needsConfirmation) {
          const confirmed = window.confirm(firstData.message);
          if (!confirmed) return;

          const secondRes = await fetch(`/api/admin/schedules/${editingItem.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              booking_for: "instructor",
              room_name: resForm.room_name,
              block_date: resForm.reserved_date,
              time_start: resForm.time_start,
              time_end: autoTimeEnd,
              instructor_name: resForm.instructor_name,
              force: true,
            }),
          });

          const secondData = await secondRes.json();

          if (!secondRes.ok) {
            alert(secondData.error ?? "Failed to update instructor reservation.");
            return;
          }
        } else if (!firstRes.ok) {
          alert(firstData.error ?? "Failed to update instructor reservation.");
          return;
        }

        setShowResModal(false);
        setEditingItem(null);
        fetchAllActivity();
        fetchSchedule();
        return;
      }
    }

    if (resForm.reserve_for === "student") {
      if (!resForm.student_num.trim()) {
        alert("Please enter the student number.");
        return;
      }

      const res = await fetch("/api/admin/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_num: resForm.student_num,
          room_name: resForm.room_name,
          reserved_date: resForm.reserved_date,
          time_start: resForm.time_start,
          time_end: autoTimeEnd,
          status: "approved",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error ?? "Failed to create student reservation.");
        return;
      }

      setShowResModal(false);
      setEditingItem(null);
      fetchAllActivity();
      fetchSchedule();
      return;
    }

    if (resForm.reserve_for === "instructor") {
      if (!resForm.instructor_name.trim()) {
        alert("Please enter the instructor name.");
        return;
      }

      const firstRes = await fetch("/api/admin/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_for: "instructor",
          room_name: resForm.room_name,
          block_date: resForm.reserved_date,
          time_start: resForm.time_start,
          time_end: autoTimeEnd,
          instructor_name: resForm.instructor_name,
          force: false,
        }),
      });

      const firstData = await firstRes.json();

      if (firstRes.status === 409 && firstData.needsConfirmation) {
        const confirmed = window.confirm(firstData.message);

        if (!confirmed) return;

        const secondRes = await fetch("/api/admin/schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            booking_for: "instructor",
            room_name: resForm.room_name,
            block_date: resForm.reserved_date,
            time_start: resForm.time_start,
            time_end: autoTimeEnd,
            instructor_name: resForm.instructor_name,
            force: true,
          }),
        });

        const secondData = await secondRes.json();

        if (!secondRes.ok) {
          alert(secondData.error ?? "Failed to create instructor reservation.");
          return;
        }

        alert(
          `Instructor reservation created. ${secondData.cancelledStudentReservations ?? 0
          } student booking(s) were cancelled.`
        );

        setShowResModal(false);
        setEditingItem(null);
        fetchAllActivity();
        fetchSchedule();
        return;
      }

      if (!firstRes.ok) {
        alert(firstData.error ?? "Failed to create instructor reservation.");
        return;
      }

      setShowResModal(false);
      setEditingItem(null);
      fetchAllActivity();
      fetchSchedule();
    }
  }

  async function handleApprove(id: number) {
    const res = await fetch(`/api/admin/reservations/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error ?? "Failed to approve reservation.");
      return;
    }

    fetchAllActivity();
    fetchSchedule();
  }

  async function handleRemoveStudentReservation(id: number | string) {
    const confirmed = window.confirm("Remove this student reservation?");
    if (!confirmed) return;

    const res = await fetch(`/api/admin/reservations/${id}`, {
      method: "DELETE",
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error ?? "Failed to remove student reservation.");
      return;
    }

    fetchAllActivity();
    fetchSchedule();
  }

  async function handleRemoveInstructorReservation(id: number | string) {
    const confirmed = window.confirm("Remove this instructor reservation?");
    if (!confirmed) return;

    const res = await fetch(`/api/admin/schedules/${id}`, {
      method: "DELETE",
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error ?? "Failed to remove instructor reservation.");
      return;
    }

    fetchAllActivity();
    fetchSchedule();
  }

  function openAddRes() {
    const defaultDate = getDefaultScheduleDate();

    setEditingItem(null);
    setResForm({
      reserve_for: "student",
      student_num: "",
      instructor_name: "",
      room_name: "EEEI 308",
      reserved_date: defaultDate,
      time_start: "",
      time_end: "",
      status: "approved",
    });
    setShowResModal(true);
  }

  function openEditItem(item: ActivityItem) {
    setEditingItem(item);
    setResForm({
      reserve_for: item.kind,
      student_num: "",
      instructor_name: item.kind === "instructor" ? item.person : "",
      room_name: item.room_name,
      reserved_date: item.reserved_date,
      time_start: normalizeTime(item.time_start),
      time_end: addMinutesToTime(normalizeTime(item.time_start), 30),
      status: item.status,
    });
    setShowResModal(true);
  }

  function openSlotAction(slot: DisplaySlot) {
    setSelectedSlot(slot);
    setShowSlotModal(true);
  }

  async function createAdminBlock(
    payload: {
      room_name: string;
      schedule_date: string;
      time_start: string;
      time_end: string;
      status: string;
      course_name: string;
    },
    force: boolean
  ) {
    return fetch("/api/admin/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        booking_for: "block",
        room_name: payload.room_name,
        block_date: payload.schedule_date,
        time_start: payload.time_start,
        time_end: payload.time_end,
        block_type: payload.status,
        label: payload.course_name,
        force,
      }),
    });
  }

  async function handleCreateBlock(payload: {
    room_name: string;
    schedule_date: string;
    time_start: string;
    time_end: string;
    status: string;
    course_name: string;
  }) {
    if (!isSlotAllowedForDate(payload.schedule_date, payload.time_start)) {
      alert("You cannot block a past/cutoff timeslot.");
      return false;
    }

    const firstRes = await createAdminBlock(payload, false);
    const firstData = await firstRes.json();

    if (firstRes.status === 409 && firstData.needsConfirmation) {
      const confirmed = window.confirm(firstData.message);
      if (!confirmed) return false;

      const secondRes = await createAdminBlock(payload, true);
      const secondData = await secondRes.json();

      if (!secondRes.ok) {
        alert(secondData.error ?? "Failed to create block.");
        return false;
      }

      alert(
        `Block created. ${secondData.cancelledStudentReservations ?? 0
        } student booking(s) were cancelled.`
      );

      return true;
    }

    if (!firstRes.ok) {
      alert(firstData.error ?? "Failed to create block.");
      return false;
    }

    return true;
  }

  async function adminBlockSlot(slot: DisplaySlot) {
    const payload = {
      room_name: scheduleRoom,
      schedule_date: scheduleDate,
      time_start: slot.time_start,
      time_end: slot.time_end,
      status: "admin_block",
      course_name: "Blocked by admin",
    };

    const ok = await handleCreateBlock(payload);

    if (!ok) return;

    setShowSlotModal(false);
    fetchAllActivity();
    fetchSchedule();
  }

  async function adminRemoveBlock(slot: DisplaySlot) {
    if (!slot.blocking_schedule_id) return;

    const confirmed = window.confirm("Remove this schedule block?");
    if (!confirmed) return;

    const res = await fetch(`/api/admin/schedules/${slot.blocking_schedule_id}`, {
      method: "DELETE",
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error ?? "Failed to remove block.");
      return;
    }

    setShowSlotModal(false);
    fetchSchedule();
  }

  const studentActivity: ActivityItem[] = studentReservations.map(r => ({
    id: r.id,
    kind: "student",
    person: r.student_num || r.student_email || "—",
    room_name: r.room_name,
    reserved_date: r.reserved_date,
    time_start: r.time_start,
    time_end: r.time_end,
    status: r.status,
  }));

  const instructorActivity: ActivityItem[] = instructorReservations.map(r => ({
    id: r.id,
    kind: "instructor",
    person: r.instructor_name || "—",
    room_name: r.room_name,
    reserved_date: r.reserved_date,
    time_start: r.time_start,
    time_end: r.time_end,
    status: r.status,
  }));

  const sourceActivity =
    filterType === "student" ? studentActivity : instructorActivity;

  const labFilteredActivity = sourceActivity.filter(
    item => !filterLab || item.room_name === filterLab
  );

  const ongoingActivity = labFilteredActivity
    .filter(item => {
      if (item.kind === "student") {
        return item.status === "approved" && !isPastReservation(item);
      }
      return !isPastReservation(item);
    })
    .sort((a, b) => {
      const aDateTime = `${a.reserved_date} ${normalizeTime(a.time_start)}`;
      const bDateTime = `${b.reserved_date} ${normalizeTime(b.time_start)}`;
      return aDateTime.localeCompare(bDateTime);
    });

  const pendingActivity = labFilteredActivity
    .filter(item => item.kind === "student" && item.status === "pending")
    .sort((a, b) => {
      const aDateTime = `${a.reserved_date} ${normalizeTime(a.time_start)}`;
      const bDateTime = `${b.reserved_date} ${normalizeTime(b.time_start)}`;
      return aDateTime.localeCompare(bDateTime);
    });

  const pastActivity = labFilteredActivity
    .filter(item => {
      if (item.kind === "student") {
        if (isCancelledReservation(item.status)) return false;
        if (item.status === "pending") return false;
        return isPastReservation(item);
      }

      return isPastReservation(item);
    })
    .sort((a, b) => {
      const aDateTime = `${a.reserved_date} ${normalizeTime(a.time_start)}`;
      const bDateTime = `${b.reserved_date} ${normalizeTime(b.time_start)}`;
      return bDateTime.localeCompare(aDateTime);
    });

  const cancelledActivity = labFilteredActivity
    .filter(item => {
      if (item.kind === "student") {
        return isCancelledReservation(item.status);
      }
      return false;
    })
    .sort((a, b) => {
      const aDateTime = `${a.reserved_date} ${normalizeTime(a.time_start)}`;
      const bDateTime = `${b.reserved_date} ${normalizeTime(b.time_start)}`;
      return bDateTime.localeCompare(aDateTime);
    });

  const displayedActivity =
    activityView === "ongoing"
      ? ongoingActivity
      : activityView === "pending"
        ? pendingActivity
        : activityView === "past"
          ? pastActivity
          : cancelledActivity;

  const reservationsTodayCount = studentActivity.filter(
    (item) =>
      item.reserved_date === getManilaNow().date &&
      item.status === "approved"
  ).length;

  const activeNowCount = [...studentActivity, ...instructorActivity].filter(
    (item) => {
      if (item.kind === "student") {
        return item.status === "approved" && isActiveNow(item);
      }

      return isActiveNow(item);
    }
  ).length;

  const displaySlots = generateDisplaySlots();

  function extractInstructorName(label?: string | null) {
    if (!label) return "";
    return label.replace(/^Reserved by\s*/i, "").trim();
  }

  function getManilaNow() {
    const now = new Date();

    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);

    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

    return {
      date: `${get("year")}-${get("month")}-${get("day")}`,
      time: `${get("hour")}:${get("minute")}`,
    };
  }

  function normalizeTime(time?: string | null) {
    if (!time) return "00:00";
    return time.slice(0, 5);
  }

  function isPastReservation(item: {
    reserved_date: string;
    time_end: string;
  }) {
    const now = getManilaNow();

    const reservationDate = item.reserved_date;
    const reservationEnd = normalizeTime(item.time_end);

    if (!reservationDate) return false;
    if (reservationDate < now.date) return true;
    if (reservationDate > now.date) return false;

    return reservationEnd <= now.time;
  }

  function isCancelledReservation(status: string) {
    return (
      status === "cancelled_by_admin" ||
      status === "cancelled_by_instructor"
    );
  }

  function statusLabel(status: string) {
    const labels: Record<string, string> = {
      approved: "Approved",
      pending: "Pending",
      cancelled: "Cancelled",
      cancelled_by_admin: "Cancelled by admin",
      cancelled_by_instructor: "Cancelled by instructor",
      instructor_reservation: "Instructor reservation",
    };

    return labels[status] ?? status;
  }

  function fmt(t: string) {
    const clean = normalizeTime(t);
    const [h, m] = clean.split(":").map(Number);
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;

    return `${hour}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
  }

  function formatDateWords(dateString: string) {
    if (!dateString) return "";

    const [year, month, day] = dateString.split("-").map(Number);
    const d = new Date(year, month - 1, day);

    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  function timeToMinutes(t: string) {
    const clean = normalizeTime(t);
    const [h, m] = clean.split(":").map(Number);
    return h * 60 + m;
  }

  function minutesToTime(totalMinutes: number) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;

    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
  }

  function addMinutesToTime(time: string, minutes: number) {
    if (!time) return "";

    const total = timeToMinutes(time) + minutes;
    return minutesToTime(total);
  }

  function getManilaDateTime() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());

    const get = (type: string) =>
      parts.find(part => part.type === type)?.value ?? "00";

    return {
      today: `${get("year")}-${get("month")}-${get("day")}`,
      nowMinutes: Number(get("hour")) * 60 + Number(get("minute")),
    };
  }

  function addDaysToDateString(dateString: string, days: number) {
    const [year, month, day] = dateString.split("-").map(Number);
    const d = new Date(year, month - 1, day);

    d.setDate(d.getDate() + days);

    const nextYear = d.getFullYear();
    const nextMonth = String(d.getMonth() + 1).padStart(2, "0");
    const nextDay = String(d.getDate()).padStart(2, "0");

    return `${nextYear}-${nextMonth}-${nextDay}`;
  }

  function hasAllowedSlotsForDate(selectedDate: string) {
    const labStart = 8 * 60 + 30;
    const labEnd = 16 * 60;
    const interval = 30;

    for (let current = labStart; current < labEnd; current += interval) {
      const slotStart = minutesToTime(current);

      if (isSlotAllowedForDate(selectedDate, slotStart)) {
        return true;
      }
    }

    return false;
  }

  function getDefaultScheduleDate() {
    const { today } = getManilaDateTime();

    if (hasAllowedSlotsForDate(today)) {
      return today;
    }

    return addDaysToDateString(today, 1);
  }

  function isSlotAllowedForDate(selectedDate: string, slotStart: string) {
    const { today, nowMinutes } = getManilaDateTime();

    if (selectedDate < today) return false;
    if (selectedDate > today) return true;

    const minimumAllowedStart = nowMinutes + 30;

    return timeToMinutes(slotStart) >= minimumAllowedStart;
  }

  function canManageReservation(item: {
    reserved_date: string;
    time_start: string;
  }) {
    return isSlotAllowedForDate(item.reserved_date, item.time_start);
  }

  function getTimeBoundaryOptions() {
    const options: string[] = [];

    const labStart = 8 * 60 + 30;
    const labEnd = 16 * 60;
    const interval = 30;

    for (let current = labStart; current <= labEnd; current += interval) {
      options.push(minutesToTime(current));
    }

    return options;
  }

  function getEndTimeOptions(startTime: string) {
    const options = getTimeBoundaryOptions();

    if (!startTime) return options;

    return options.filter(time => timeToMinutes(time) > timeToMinutes(startTime));
  }

  function getStartTimeOptionsForDate(selectedDate: string) {
    return getTimeBoundaryOptions()
      .slice(0, -1)
      .filter(time => isSlotAllowedForDate(selectedDate, time));
  }

  function overlaps(
    startA: string,
    endA: string,
    startB: string,
    endB: string
  ) {
    return (
      timeToMinutes(startA) < timeToMinutes(endB) &&
      timeToMinutes(endA) > timeToMinutes(startB)
    );
  }

  function generateDisplaySlots(): DisplaySlot[] {
    const displaySlots: DisplaySlot[] = [];

    const labStart = 8 * 60 + 30;
    const labEnd = 16 * 60;
    const interval = 30;

    const defaultCapacity = scheduleRoom === "EEEI 308" ? 16 : 10;

    const capacity =
      visualRanges.find(range => typeof range.capacity === "number")?.capacity ??
      defaultCapacity;

    for (let current = labStart; current < labEnd; current += interval) {
      const time_start = minutesToTime(current);
      const time_end = minutesToTime(current + interval);

      if (!isSlotAllowedForDate(scheduleDate, time_start)) {
        continue;
      }

      const blockingSlot = visualRanges.find(
        range =>
          range.source !== "reservation" &&
          overlaps(time_start, time_end, range.time_start, range.time_end)
      );

      const reservationCount = visualRanges.filter(
        range =>
          range.source === "reservation" &&
          overlaps(time_start, time_end, range.time_start, range.time_end)
      ).length;

      const slotsLeft = capacity - reservationCount;

      displaySlots.push({
        time_start,
        time_end,
        status: blockingSlot
          ? "occupied"
          : slotsLeft <= 0
            ? "full"
            : reservationCount > 0
              ? "reserved"
              : "available",

        course_name: blockingSlot?.course_name ?? null,
        capacity,
        reserved_count: reservationCount,
        slots_left: Math.max(slotsLeft, 0),

        blocking_id: blockingSlot?.id ?? null,
        blocking_schedule_id: blockingSlot?.schedule_id ?? null,
        blocking_source: blockingSlot?.source ?? null,
        blocking_status: blockingSlot?.status ?? null,
      });
    }

    return displaySlots;
  }

  function isActiveNow(item: {
    reserved_date: string;
    time_start: string;
    time_end: string;
  }) {
    const now = getManilaNow();

    if (item.reserved_date !== now.date) return false;

    const start = normalizeTime(item.time_start);
    const end = normalizeTime(item.time_end);

    return start <= now.time && end > now.time;
  }

  function countAvailableSlotsForRanges(
    room: string,
    date: string,
    ranges: VisualRange[]
  ) {
    let count = 0;

    const labStart = 8 * 60 + 30;
    const labEnd = 16 * 60;
    const interval = 30;

    const defaultCapacity = room === "EEEI 308" ? 16 : 10;
    const capacity =
      ranges.find((range) => typeof range.capacity === "number")?.capacity ??
      defaultCapacity;

    for (let current = labStart; current < labEnd; current += interval) {
      const time_start = minutesToTime(current);
      const time_end = minutesToTime(current + interval);

      if (!isSlotAllowedForDate(date, time_start)) {
        continue;
      }

      const blockingSlot = ranges.find(
        (range) =>
          range.source !== "reservation" &&
          overlaps(time_start, time_end, range.time_start, range.time_end)
      );

      const reservationCount = ranges.filter(
        (range) =>
          range.source === "reservation" &&
          overlaps(time_start, time_end, range.time_start, range.time_end)
      ).length;

      const slotsLeft = capacity - reservationCount;

      if (!blockingSlot && slotsLeft > 0) {
        count += 1;
      }
    }

    return count;
  }

  return (
    <div style={s.page}>
      <nav style={s.nav}>
        <a href="/" style={s.logo}>
          rEEE<span style={s.logoBlue}>serve</span>
        </a>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={s.badge}>Admin</span>
          <button style={s.logout} onClick={() => router.push("/")}>
            Log out
          </button>
        </div>
      </nav>

      <div style={s.body}>
        <div style={s.stats}>
          {[
            ["Reservations Today", reservationsTodayCount],
            ["Active Now", activeNowCount],
            ["Available Time Slots Today", availableSlotsToday],
          ].map(([label, val]) => (
            <div key={String(label)} style={s.stat}>
              <p style={s.statLabel}>{label}</p>
              <p style={s.statVal}>{val}</p>
            </div>
          ))}
        </div>

        <div style={s.card}>
          <div style={s.cardHeader}>
            <div>
              <p style={s.cardTitle}>Reservations Activity Log</p>
            </div>

            <button style={s.btn} onClick={openAddRes}>
              + Add reservation
            </button>
          </div>

          <div style={s.filters}>
            <select
              style={s.select}
              value={filterLab}
              onChange={e => setFilterLab(e.target.value)}
            >
              <option value="">All labs</option>
              {rooms.map(r => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            <select
              style={s.select}
              value={filterType}
              onChange={e => setFilterType(e.target.value as FilterType)}
            >
              <option value="student">Students</option>
              <option value="instructor">Instructors</option>
            </select>

            <div style={s.activityTabs}>
              <button
                type="button"
                style={{
                  ...s.activityTab,
                  ...(activityView === "ongoing" ? s.activityTabActive : {}),
                }}
                onClick={() => setActivityView("ongoing")}
              >
                Ongoing
                <span style={s.activityCount}>{ongoingActivity.length}</span>
              </button>

              <button
                type="button"
                style={{
                  ...s.activityTab,
                  ...(activityView === "pending" ? s.activityTabActive : {}),
                }}
                onClick={() => setActivityView("pending")}
              >
                Pending
                <span style={s.activityCount}>{pendingActivity.length}</span>
              </button>

              <button
                type="button"
                style={{
                  ...s.activityTab,
                  ...(activityView === "past" ? s.activityTabActive : {}),
                }}
                onClick={() => setActivityView("past")}
              >
                Past
                <span style={s.activityCount}>{pastActivity.length}</span>
              </button>

              <button
                type="button"
                style={{
                  ...s.activityTab,
                  ...(activityView === "cancelled" ? s.activityTabActive : {}),
                }}
                onClick={() => setActivityView("cancelled")}
              >
                Cancelled
                <span style={s.activityCount}>{cancelledActivity.length}</span>
              </button>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={s.table}>
              <thead>
                <tr>
                  {[
                    filterType === "student" ? "Student" : "Instructor",
                    "Lab",
                    "Date",
                    "Time",
                    "Status",
                    "Actions",
                  ].map(h => (
                    <th key={h} style={s.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {displayedActivity.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={s.empty}>
                      {activityView === "ongoing"
                        ? "No ongoing reservations found"
                        : activityView === "pending"
                          ? "No pending reservations found"
                          : activityView === "past"
                            ? "No past reservations found"
                            : "No cancelled reservations found"}
                    </td>
                  </tr>
                ) : (
                  displayedActivity.map(item => (
                    <tr key={`${item.kind}-${item.id}`}>
                      <td style={s.td}>{item.person}</td>
                      <td style={s.td}>{item.room_name}</td>
                      <td style={s.td}>{formatDateWords(item.reserved_date)}</td>
                      <td style={s.td}>
                        {fmt(item.time_start)} – {fmt(item.time_end)}
                      </td>
                      <td style={s.td}>
                        <span style={pillStyle(item.status)}>
                          {statusLabel(item.status)}
                        </span>
                      </td>
                      <td style={s.td}>
                        {activityView === "ongoing" && canManageReservation(item) && (
                          <>
                            <button
                              style={s.actionBtn}
                              onClick={() => openEditItem(item)}
                            >
                              Edit
                            </button>

                            <button
                              style={{ ...s.actionBtn, color: "#A32D2D" }}
                              onClick={() =>
                                item.kind === "student"
                                  ? handleRemoveStudentReservation(item.id)
                                  : handleRemoveInstructorReservation(item.id)
                              }
                            >
                              Remove
                            </button>
                          </>
                        )}

                        {activityView === "pending" &&
                          item.kind === "student" &&
                          canManageReservation(item) && (
                            <>
                              <button
                                style={{ ...s.actionBtn, color: "#3B6D11" }}
                                onClick={() => handleApprove(Number(item.id))}
                              >
                                Approve
                              </button>

                              <button
                                style={s.actionBtn}
                                onClick={() => openEditItem(item)}
                              >
                                Edit
                              </button>

                              <button
                                style={{ ...s.actionBtn, color: "#A32D2D" }}
                                onClick={() =>
                                  handleRemoveStudentReservation(item.id)
                                }
                              >
                                Remove
                              </button>
                            </>
                          )}

                        {activityView === "past" && (
                          <span style={s.pastText}>Finished</span>
                        )}

                        {activityView === "cancelled" && (
                          <span style={s.pastText}>Cancelled</span>
                        )}

                        {(activityView === "ongoing" ||
                          activityView === "pending") &&
                          !canManageReservation(item) && (
                            <span style={s.pastText}>Locked</span>
                          )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={s.card}>
          <div style={s.cardHeader}>
            <div>
              <p style={s.cardTitle}>Room schedule manager</p>
              <p style={s.cardSubTitle}>
                Click a timeslot to block or manage it.
              </p>
            </div>
          </div>

          <div style={s.filters}>
            <select
              style={s.select}
              value={scheduleRoom}
              onChange={e => setScheduleRoom(e.target.value)}
            >
              {rooms.map(r => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            <input
              type="date"
              style={s.select}
              value={scheduleDate}
              onChange={e => setScheduleDate(e.target.value)}
            />
          </div>

          <div style={s.visualBox}>

            {loadingVisualSchedule ? (
              <div style={s.emptyBox}>Loading schedule...</div>
            ) : displaySlots.length === 0 ? (
              <div style={s.emptyBox}>
                No available timeslots left for this date.
              </div>
            ) : (
              <div style={s.slotGrid}>
                {displaySlots.map((slot, index) => {
                  const key = `${slot.time_start}-${slot.time_end}`;

                  const isAvailable = slot.status === "available";
                  const isReserved = slot.status === "reserved";
                  const isFull = slot.status === "full";

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => openSlotAction(slot)}
                      style={{
                        ...s.slotPill,
                        ...(index === 0 ? { gridColumn: "2 / 3" } : {}),
                        ...(isAvailable
                          ? s.availablePill
                          : isReserved || isFull
                            ? s.reservedPill
                            : s.occupiedPill),
                      }}
                    >
                      <span style={s.slotTimeText}>
                        {fmt(slot.time_start)} – {fmt(slot.time_end)}
                      </span>

                      <span style={s.slotInfoText}>
                        {slot.status === "occupied"
                          ? slot.course_name ?? "Class / blocked"
                          : isFull
                            ? "Full"
                            : `${slot.slots_left}/${slot.capacity} slots left`}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div style={s.legend}>
            {[
              ["var(--success-border)", "Available"],
              ["var(--warning-border)", "Student reserved / full"],
              ["var(--danger-border)", "Class / blocked / instructor-reserved"],
            ].map(([color, label]) => (
              <div key={label} style={s.legendItem}>
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 99,
                    background: color,
                  }}
                />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {showResModal && (
        <div style={s.modalBg}>
          <div style={s.modal}>
            <h3 style={s.modalTitle}>
              {editingItem
                ? editingItem.kind === "student"
                  ? "Edit student reservation"
                  : "Edit instructor reservation"
                : "Add reservation"}
            </h3>

            {!editingItem && (
              <>
                <label style={s.modalLabel}>Reserve for</label>
                <select
                  style={s.modalInput}
                  value={resForm.reserve_for}
                  onChange={e =>
                    setResForm({
                      ...resForm,
                      reserve_for: e.target.value as ReserveFor,
                      student_num: "",
                      instructor_name: "",
                    })
                  }
                >
                  <option value="student">Student</option>
                  <option value="instructor">Instructor</option>
                </select>
              </>
            )}

            {!editingItem && resForm.reserve_for === "student" && (
              <>
                <label style={s.modalLabel}>Student number</label>
                <input
                  style={s.modalInput}
                  type="text"
                  placeholder="2026-12345"
                  value={resForm.student_num}
                  onChange={e =>
                    setResForm({ ...resForm, student_num: e.target.value })
                  }
                />
              </>
            )}

            {((!editingItem && resForm.reserve_for === "instructor") ||
              editingItem?.kind === "instructor") && (
                <>
                  <label style={s.modalLabel}>Instructor name</label>
                  <input
                    style={s.modalInput}
                    type="text"
                    placeholder=""
                    value={resForm.instructor_name}
                    onChange={e =>
                      setResForm({ ...resForm, instructor_name: e.target.value })
                    }
                  />
                </>
              )}

            <label style={s.modalLabel}>Lab</label>
            <select
              style={s.modalInput}
              value={resForm.room_name}
              onChange={e =>
                setResForm({ ...resForm, room_name: e.target.value })
              }
            >
              {rooms.map(r => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            <label style={s.modalLabel}>Date</label>
            <input
              style={s.modalInput}
              type="date"
              value={resForm.reserved_date}
              onChange={e =>
                setResForm({
                  ...resForm,
                  reserved_date: e.target.value,
                  time_start: "",
                  time_end: "",
                })
              }
            />

            <label style={s.modalLabel}>Timeslot</label>
            <select
              style={s.modalInput}
              value={resForm.time_start}
              onChange={e => {
                const selectedStart = e.target.value;

                setResForm({
                  ...resForm,
                  time_start: selectedStart,
                  time_end: selectedStart ? addMinutesToTime(selectedStart, 30) : "",
                });
              }}
            >
              <option value="">Select timeslot</option>
              {getStartTimeOptionsForDate(resForm.reserved_date).map(time => (
                <option key={time} value={time}>
                  {fmt(time)} – {fmt(addMinutesToTime(time, 30))}
                </option>
              ))}
            </select>

            {((!editingItem && resForm.reserve_for === "student") ||
              editingItem?.kind === "student") && (
                <>
                  <label style={s.modalLabel}>Status</label>
                  <select
                    style={s.modalInput}
                    value={resForm.status}
                    onChange={e =>
                      setResForm({ ...resForm, status: e.target.value })
                    }
                  >
                    <option value="approved">Approved</option>
                    <option value="pending">Pending</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="cancelled_by_admin">Cancelled by admin</option>
                    <option value="cancelled_by_instructor">
                      Cancelled by instructor
                    </option>
                  </select>
                </>
              )}

            <div style={s.modalActions}>
              <button
                style={s.btnOutline}
                onClick={() => {
                  setShowResModal(false);
                  setEditingItem(null);
                }}
              >
                Cancel
              </button>

              <button style={s.btn} onClick={handleResSave}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showSlotModal && selectedSlot && (
        <div style={s.modalBg}>
          <div style={s.modal}>
            <h3 style={s.modalTitle}>Manage timeslot</h3>

            <p style={s.modalSubText}>
              {scheduleRoom} — {formatDateWords(scheduleDate)}
            </p>

            <p style={s.slotModalTime}>
              <strong>
                {fmt(selectedSlot.time_start)} – {fmt(selectedSlot.time_end)}
              </strong>
            </p>

            <p style={s.slotModalDesc}>
              {selectedSlot.status === "available" &&
                `This slot is available. ${selectedSlot.slots_left}/${selectedSlot.capacity} slots left.`}

              {selectedSlot.status === "reserved" &&
                `This slot has student reservations. ${selectedSlot.slots_left}/${selectedSlot.capacity} slots left.`}

              {selectedSlot.status === "full" &&
                `This slot is full. ${selectedSlot.capacity}/${selectedSlot.capacity} slots are reserved.`}

              {selectedSlot.status === "occupied" &&
                (selectedSlot.course_name ?? "This slot is blocked or occupied.")}
            </p>

            <div style={{ display: "grid", gap: 8 }}>
              {(selectedSlot.status === "available" ||
                selectedSlot.status === "reserved" ||
                selectedSlot.status === "full") && (
                  <button
                    style={s.btn}
                    onClick={() => adminBlockSlot(selectedSlot)}
                  >
                    {selectedSlot.status === "available"
                      ? "Block this slot"
                      : "Block this slot and cancel student bookings"}
                  </button>
                )}

              {selectedSlot.status === "occupied" &&
                selectedSlot.blocking_source === "one-time" && (
                  <button
                    style={{ ...s.btn, background: "#A32D2D" }}
                    onClick={() => adminRemoveBlock(selectedSlot)}
                  >
                    Remove this block
                  </button>
                )}

              {selectedSlot.status === "occupied" &&
                selectedSlot.blocking_source === "weekly" && (
                  <p style={s.helperText}>This is a weekly class schedule.</p>
                )}
            </div>

            <div style={s.modalActions}>
              <button
                style={s.btnOutline}
                onClick={() => setShowSlotModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function pillStyle(status: string): CSSProperties {
  const map: Record<string, CSSProperties> = {
    approved: {
      background: "var(--success-bg)",
      color: "var(--success-text)",
      border: "1px solid var(--success-border)",
    },
    pending: {
      background: "var(--warning-bg)",
      color: "var(--warning-text)",
      border: "1px solid var(--warning-border)",
    },
    cancelled: {
      background: "var(--danger-bg)",
      color: "var(--danger-text)",
      border: "1px solid var(--danger-border)",
    },
    cancelled_by_admin: {
      background: "var(--danger-bg)",
      color: "var(--danger-text)",
      border: "1px solid var(--danger-border)",
    },
    cancelled_by_instructor: {
      background: "var(--danger-bg)",
      color: "var(--danger-text)",
      border: "1px solid var(--danger-border)",
    },
    instructor_reservation: {
      background: "var(--danger-bg)",
      color: "var(--danger-text)",
      border: "1px solid var(--danger-border)",
    },
  };

  return {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 99,
    fontSize: 11,
    fontWeight: 500,
    ...(map[status] ?? {
      background: "var(--surface-3)",
      color: "var(--muted)",
      border: "1px solid var(--border)",
    }),
  };
}

const s: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "var(--page-bg)",
    color: "var(--text)",
    fontFamily: "sans-serif",
  },

  nav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 28px",
    borderBottom: "1px solid var(--border)",
    background: "var(--surface)",
  },

  logo: {
    fontSize: 22,
    fontWeight: 700,
    textDecoration: "none",
    color: "var(--text)",
  },

  logoBlue: {
    color: "var(--primary)",
  },

  badge: {
    background: "var(--primary-soft)",
    color: "var(--primary)",
    fontSize: 11,
    fontWeight: 500,
    padding: "3px 8px",
    borderRadius: 99,
  },

  logout: {
    fontSize: 12,
    color: "var(--muted)",
    background: "none",
    border: "1px solid var(--border-strong)",
    padding: "4px 10px",
    borderRadius: 6,
    cursor: "pointer",
  },

  body: {
    flex: 1,
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },

  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 12,
  },

  stat: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 14,
  },

  statLabel: {
    fontSize: 12,
    color: "var(--muted)",
    margin: "0 0 4px",
  },

  statVal: {
    fontSize: 22,
    fontWeight: 500,
    margin: 0,
    color: "var(--text)",
  },

  card: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    overflow: "hidden",
  },

  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 18px",
    borderBottom: "1px solid var(--border)",
    flexWrap: "wrap",
    gap: 10,
  },

  cardTitle: {
    fontSize: 13,
    fontWeight: 500,
    margin: 0,
    color: "var(--text)",
  },

  cardSubTitle: {
    fontSize: 12,
    color: "var(--muted)",
    margin: "4px 0 0",
  },

  btn: {
    padding: "7px 14px",
    background: "var(--primary)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  },

  btnOutline: {
    padding: "7px 14px",
    background: "none",
    color: "var(--muted)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    fontSize: 12,
    cursor: "pointer",
  },

  filters: {
    display: "flex",
    gap: 8,
    padding: "12px 18px",
    borderBottom: "1px solid var(--border)",
    flexWrap: "wrap",
    alignItems: "center",
  },

  select: {
    padding: "6px 10px",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    fontSize: 12,
    background: "var(--surface-2)",
    color: "var(--text)",
  },

  activityTabs: {
    display: "flex",
    gap: 4,
    padding: 3,
    border: "1px solid var(--border-strong)",
    background: "var(--tab-bg)",
    borderRadius: 10,
    marginLeft: "auto",
    flexWrap: "wrap",
  },

  activityTab: {
    border: "none",
    background: "transparent",
    color: "var(--muted)",
    borderRadius: 8,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },

  activityTabActive: {
    background: "var(--surface)",
    color: "var(--primary)",
    boxShadow: "var(--shadow-sm)",
  },

  activityCount: {
    background: "var(--primary-soft)",
    color: "var(--primary)",
    borderRadius: 99,
    padding: "1px 6px",
    fontSize: 10,
    fontWeight: 700,
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },

  th: {
    background: "var(--surface-2)",
    padding: "9px 16px",
    textAlign: "left",
    fontWeight: 500,
    color: "var(--muted)",
    fontSize: 12,
    borderBottom: "1px solid var(--border)",
  },

  td: {
    padding: "10px 16px",
    borderBottom: "1px solid var(--border)",
    color: "var(--text-soft)",
  },

  empty: {
    textAlign: "center",
    padding: 24,
    color: "var(--muted-3)",
    fontSize: 13,
  },

  emptyBox: {
    padding: 24,
    color: "var(--muted-3)",
    fontSize: 13,
    textAlign: "center",
  },

  actionBtn: {
    fontSize: 11,
    padding: "3px 8px",
    borderRadius: 6,
    cursor: "pointer",
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text-soft)",
    marginRight: 4,
  },

  pastText: {
    fontSize: 11,
    color: "var(--muted-2)",
  },

  visualBox: {
    width: "100%",
  },

  visualTitle: {
    fontSize: 12,
    color: "var(--muted)",
    padding: "10px 16px 6px",
    margin: 0,
    fontWeight: 500,
  },

  slotGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 8,
    padding: 16,
  },

  slotPill: {
    borderRadius: 12,
    padding: "9px 10px",
    minHeight: 48,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    border: "1px solid transparent",
    cursor: "pointer",
  },

  availablePill: {
    background: "var(--success-bg)",
    borderColor: "var(--success-border)",
    color: "var(--success-text)",
  },

  occupiedPill: {
    background: "var(--danger-bg)",
    borderColor: "var(--danger-border)",
    color: "var(--danger-text)",
  },

  reservedPill: {
    background: "var(--warning-bg)",
    color: "var(--warning-text)",
    border: "1px solid var(--warning-border)",
  },

  slotTimeText: {
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.2,
  },

  slotInfoText: {
    fontSize: 11,
    fontWeight: 500,
    opacity: 0.9,
    marginTop: 3,
  },

  legend: {
    display: "flex",
    gap: 16,
    padding: "10px 16px",
    flexWrap: "wrap",
    borderTop: "1px solid var(--border)",
  },

  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    color: "var(--muted)",
  },

  modalBg: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },

  modal: {
    background: "var(--surface)",
    color: "var(--text)",
    borderRadius: 12,
    border: "1px solid var(--border)",
    padding: 24,
    width: "100%",
    maxWidth: 360,
    maxHeight: "90vh",
    overflowY: "auto",
  },

  modalTitle: {
    fontSize: 15,
    fontWeight: 500,
    margin: "0 0 16px",
    color: "var(--text)",
  },

  modalSubText: {
    fontSize: 12,
    color: "var(--muted)",
    margin: "0 0 12px",
  },

  modalLabel: {
    fontSize: 12,
    color: "var(--muted)",
    display: "block",
    marginBottom: 5,
    marginTop: 12,
  },

  modalInput: {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 10px",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    fontSize: 13,
    background: "var(--surface-2)",
    color: "var(--text)",
  },

  modalActions: {
    display: "flex",
    gap: 8,
    justifyContent: "flex-end",
    marginTop: 20,
  },

  slotModalTime: {
    fontSize: 14,
    margin: "0 0 8px",
    color: "var(--text)",
  },

  slotModalDesc: {
    fontSize: 13,
    color: "var(--text-soft)",
    margin: "0 0 16px",
  },

  helperText: {
    fontSize: 12,
    color: "var(--muted)",
    margin: 0,
  },
};
