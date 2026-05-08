"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import Link from "next/link";

type Slot = {
  id: number | string;
  room_name: string;
  schedule_date: string;
  time_start: string;
  time_end: string;
  status: string;
  course_name?: string | null;
  source?: string;
};

type Reservation = {
  id: number;
  student_email: string | null;
  room_name: string;
  reserved_date: string;
  time_start: string;
  time_end: string;
  status: string;
};

type CartItem = {
  time_start: string;
  time_end: string;
};

type DisplaySlot = {
  time_start: string;
  time_end: string;
  status: "available" | "occupied" | "full" | "selected" | "reservedByMe";
  course_name?: string | null;
  capacity: number;
  reserved_count: number;
  slots_left: number;
};

type ReservationTab = "current" | "past";
type ScheduleMode = "none" | "dateFirst" | "roomFirst" | "both";

function getCookieValue(name: string) {
  if (typeof document === "undefined") return "";

  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);

  if (parts.length !== 2) return "";

  return decodeURIComponent(parts.pop()?.split(";").shift() ?? "");
}

export default function Dashboard() {
  const router = useRouter();
  const supabase = createClient();

  const rooms = ["EEEI 301", "EEEI 305", "EEEI 308"];

  const roomCapacity: Record<string, number> = {
    "EEEI 301": 10,
    "EEEI 305": 10,
    "EEEI 308": 16,
  };

  const [lab, setLab] = useState("");
  const [date, setDate] = useState("");

  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("none");

  const [previewAnchorDate, setPreviewAnchorDate] = useState("");
  const [previewAnchorLab, setPreviewAnchorLab] = useState("");

  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [submittingCart, setSubmittingCart] = useState(false);

  const [reservationTab, setReservationTab] =
    useState<ReservationTab>("current");

  const [expandedReservationDate, setExpandedReservationDate] =
    useState<string | null>(null);

  const [expandedReservationRoom, setExpandedReservationRoom] =
    useState<string | null>(null);

  const [previewSlots, setPreviewSlots] = useState<Record<string, Slot[]>>({});
  const [loadingPreviewSlots, setLoadingPreviewSlots] = useState(false);

  const [allReservations, setAllReservations] = useState<Reservation[]>([]);

  const [email, setEmail] = useState("");
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    async function fetchPreviews() {
      const nextPreviewSlots: Record<string, Slot[]> = {};

      if (scheduleMode === "none") {
        setPreviewSlots({});
        return;
      }

      setLoadingPreviewSlots(true);

      try {
        if (scheduleMode === "dateFirst" && previewAnchorDate) {
          await Promise.all(
            rooms.map(async room => {
              const result = await fetchScheduleFor(previewAnchorDate, room);
              nextPreviewSlots[previewKey(previewAnchorDate, room)] = result;
            })
          );
        }

        if (
          (scheduleMode === "roomFirst" || scheduleMode === "both") &&
          previewAnchorLab &&
          previewAnchorDate
        ) {
          const dates = getPreviewDates(previewAnchorDate);

          await Promise.all(
            dates.map(async previewDate => {
              const result = await fetchScheduleFor(
                previewDate,
                previewAnchorLab
              );

              nextPreviewSlots[
                previewKey(previewDate, previewAnchorLab)
              ] = result;
            })
          );
        }

        setPreviewSlots(nextPreviewSlots);
      } finally {
        setLoadingPreviewSlots(false);
      }
    }

    fetchPreviews();
  }, [scheduleMode, previewAnchorDate, previewAnchorLab]);

  useEffect(() => {
    setExpandedReservationDate(null);
    setExpandedReservationRoom(null);
  }, [reservationTab]);

  useEffect(() => {
    async function getUser() {
      const demoEmail =
        process.env.NEXT_PUBLIC_DEMO_LOGIN_ENABLED === "true"
          ? getCookieValue("demo_email")
          : "";

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const activeEmail = demoEmail || user?.email || "";

      if (!activeEmail) {
        router.push("/");
        return;
      }

      setEmail(activeEmail);
      setLoadingUser(false);
    }

    getUser();
  }, [router, supabase]);

  useEffect(() => {
    setCart([]);

    if (!lab || !date) {
      setSlots([]);
      return;
    }

    fetchSlots();
  }, [lab, date]);

  useEffect(() => {
    if (!email) return;
    fetchMyReservations();
  }, [email]);

  async function fetchSlots() {
    setLoadingSlots(true);

    try {
      const res = await fetch(
        `/api/schedules?date=${date}&room=${encodeURIComponent(lab)}`
      );

      const data = await res.json();

      if (!res.ok) {
        console.error("Failed to fetch schedules:", data);
        setSlots([]);
        return;
      }

      setSlots(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Schedule fetch error:", error);
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }

  async function fetchScheduleFor(selectedDate: string, selectedRoom: string) {
    try {
      const res = await fetch(
        `/api/schedules?date=${selectedDate}&room=${encodeURIComponent(
          selectedRoom
        )}`
      );

      const data = await res.json();

      if (!res.ok) {
        console.error("Failed to fetch schedule preview:", data);
        return [];
      }

      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error("Schedule preview fetch error:", error);
      return [];
    }
  }

  function previewKey(selectedDate: string, selectedRoom: string) {
    return `${selectedDate}__${selectedRoom}`;
  }

  function getPreviewDates(startDate: string) {
    return [0, 1, 2].map(days => addDaysToDateString(startDate, days));
  }

  async function fetchMyReservations() {
    const { data, error } = await supabase
      .from("reservations")
      .select("id, student_email, room_name, reserved_date, time_start, time_end, status")
      .eq("student_email", email)
      .order("reserved_date", { ascending: false })
      .order("time_start", { ascending: false });

    if (error) {
      console.error("Failed to fetch reservations directly:", error);

      const res = await fetch("/api/reservations");
      const apiData: {
        current?: Reservation[];
        past?: Reservation[];
        error?: string;
      } = await res.json();

      if (!res.ok) {
        setAllReservations([]);
        return;
      }

      setAllReservations([
        ...(apiData.current ?? []),
        ...(apiData.past ?? []),
      ]);

      return;
    }

    setAllReservations(Array.isArray(data) ? data : []);
  }

  async function cancelReservation(id: number) {
    const confirmed = window.confirm("Cancel this reservation?");
    if (!confirmed) return;

    const res = await fetch(`/api/reservations?id=${id}`, {
      method: "DELETE",
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error ?? "Failed to cancel reservation.");
      return;
    }

    fetchMyReservations();

    if (lab && date) {
      fetchSlots();
    }
  }

  function normalizeTime(t: string) {
    return t.slice(0, 5);
  }

  function fmt(t: string) {
    const clean = normalizeTime(t);
    const [h, m] = clean.split(":").map(Number);
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;

    return `${hour}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
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

  const RESERVATION_LEAD_TIME_MINUTES = 60;
  const MAX_DAILY_RESERVATION_MINUTES = 180;

  function isSlotAllowedForDate(selectedDate: string, slotStart: string) {
    const { today, nowMinutes } = getManilaDateTime();
    if (selectedDate < today) return false;
    if (selectedDate > today) return true;
    return timeToMinutes(slotStart) >= nowMinutes + RESERVATION_LEAD_TIME_MINUTES;
  }

  function isPastReservation(r: Reservation) {
    const { today, nowMinutes } = getManilaDateTime();

    if (r.reserved_date < today) return true;
    if (r.reserved_date > today) return false;

    return timeToMinutes(r.time_end) <= nowMinutes;
  }

  function isSelfCancelled(status: string) {
    return status === "cancelled" || status === "cancelled_by_student";
  }

  function isAdminOrInstructorCancelled(status: string) {
    return (
      status === "cancelled_by_admin" ||
      status === "cancelled_by_instructor"
    );
  }

  function getCurrentReservations() {
    return allReservations
      .filter(r => {
        if (isSelfCancelled(r.status)) return false;
        if (isAdminOrInstructorCancelled(r.status)) return false;

        return !isPastReservation(r);
      })
      .sort((a, b) => {
        const aDateTime = `${a.reserved_date} ${normalizeTime(a.time_start)}`;
        const bDateTime = `${b.reserved_date} ${normalizeTime(b.time_start)}`;
        return aDateTime.localeCompare(bDateTime);
      });
  }

  function getPastReservations() {
    return allReservations
      .filter(r => {
        if (isSelfCancelled(r.status)) return false;

        if (isAdminOrInstructorCancelled(r.status)) {
          return true;
        }

        return isPastReservation(r);
      })
      .sort((a, b) => {
        const aDateTime = `${a.reserved_date} ${normalizeTime(a.time_start)}`;
        const bDateTime = `${b.reserved_date} ${normalizeTime(b.time_start)}`;
        return bDateTime.localeCompare(aDateTime);
      });
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

  function getDateOptions() {
    const { today } = getManilaDateTime();
    const defaultDate = getDefaultScheduleDate();

    const options: { val: string; label: string }[] = [];

    for (let i = 0; i < 7; i++) {
      const val = addDaysToDateString(defaultDate, i);
      const [year, month, day] = val.split("-").map(Number);
      const d = new Date(year, month - 1, day);

      const label =
        val === today
          ? `Today, ${d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}`
          : val === addDaysToDateString(today, 1)
            ? `Tomorrow, ${d.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}`
            : d.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            });

      options.push({ val, label });
    }

    return options;
  }

  function canCancelReservation(r: Reservation) {
    return isSlotAllowedForDate(r.reserved_date, r.time_start);
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

  function durationMinutes(start: string, end: string) {
    return timeToMinutes(end) - timeToMinutes(start);
  }

  function getExistingApprovedMinutesForDate(selectedDate: string) {
    return allReservations
      .filter(r => r.reserved_date === selectedDate)
      .filter(r => r.status === "approved")
      .reduce((sum, r) => {
        return sum + durationMinutes(r.time_start, r.time_end);
      }, 0);
  }

  function getCartMinutes() {
    return cart.reduce((sum, item) => {
      return sum + durationMinutes(item.time_start, item.time_end);
    }, 0);
  }

  function getRemainingReservationMinutesForDate(selectedDate: string) {
    return Math.max(
      MAX_DAILY_RESERVATION_MINUTES -
      getExistingApprovedMinutesForDate(selectedDate) -
      getCartMinutes(),
      0
    );
  }

  function getDisplaySlotsFor(
    selectedLab: string,
    selectedDate: string,
    sourceSlots: Slot[]
  ): DisplaySlot[] {
    const displaySlots: DisplaySlot[] = [];

    const labStart = 8 * 60 + 30;
    const labEnd = 16 * 60;
    const interval = 30;
    const capacity = roomCapacity[selectedLab] ?? 10;

    for (let current = labStart; current < labEnd; current += interval) {
      const time_start = minutesToTime(current);
      const time_end = minutesToTime(current + interval);

      if (!isSlotAllowedForDate(selectedDate, time_start)) {
        continue;
      }

      const blockingSlot = sourceSlots.find(
        slot =>
          slot.source !== "reservation" &&
          overlaps(time_start, time_end, slot.time_start, slot.time_end)
      );

      const reservationCount = sourceSlots.filter(
        slot =>
          slot.source === "reservation" &&
          overlaps(time_start, time_end, slot.time_start, slot.time_end)
      ).length;

      const selectedCount =
        selectedLab === lab && selectedDate === date
          ? cart.filter(item =>
            overlaps(time_start, time_end, item.time_start, item.time_end)
          ).length
          : 0;

      const selected =
        selectedLab === lab &&
        selectedDate === date &&
        cart.some(
          item => item.time_start === time_start && item.time_end === time_end
        );

      const reservedByMe = allReservations.some(
        r =>
          r.student_email === email &&
          r.room_name === selectedLab &&
          r.reserved_date === selectedDate &&
          r.status === "approved" &&
          overlaps(time_start, time_end, r.time_start, r.time_end)
      );

      const slotsLeft = capacity - reservationCount - selectedCount;

      displaySlots.push({
        time_start,
        time_end,
        status: selected
          ? "selected"
          : reservedByMe
            ? "reservedByMe"
            : blockingSlot
              ? "occupied"
              : slotsLeft <= 0
                ? "full"
                : "available",
        course_name: blockingSlot?.course_name ?? null,
        capacity,
        reserved_count: reservationCount,
        slots_left: Math.max(slotsLeft, 0),
      });
    }

    return displaySlots;
  }

  function getDisplaySlots(): DisplaySlot[] {
    if (!lab || !date) return [];
    return getDisplaySlotsFor(lab, date, slots);
  }

  function getScheduleSummary(
    selectedLab: string,
    selectedDate: string,
    sourceSlots: Slot[]
  ) {
    const display = getDisplaySlotsFor(selectedLab, selectedDate, sourceSlots);

    const available = display.filter(slot => slot.status === "available").length;
    const full = display.filter(slot => slot.status === "full").length;
    const occupied = display.filter(slot => slot.status === "occupied").length;
    const reservedByMe = display.filter(
      slot => slot.status === "reservedByMe"
    ).length;

    if (display.length === 0) {
      return {
        label: "No timeslots left",
        detail: "All usable timeslots have passed",
        tone: "muted" as const,
        available,
        full,
        occupied,
        reservedByMe,
      };
    }

    if (available > 0) {
      return {
        label: "Available",
        detail: `${available} open slot${available === 1 ? "" : "s"}`,
        tone: "success" as const,
        available,
        full,
        occupied,
        reservedByMe,
      };
    }

    if (reservedByMe > 0) {
      return {
        label: "You have a reservation",
        detail: `${reservedByMe} reserved slot${reservedByMe === 1 ? "" : "s"
          } by you`,
        tone: "warning" as const,
        available,
        full,
        occupied,
        reservedByMe,
      };
    }

    if (full > 0) {
      return {
        label: "Full",
        detail: "No remaining student slots",
        tone: "danger" as const,
        available,
        full,
        occupied,
        reservedByMe,
      };
    }

    return {
      label: "Occupied",
      detail: "Blocked by class or schedule",
      tone: "danger" as const,
      available,
      full,
      occupied,
      reservedByMe,
    };
  }

  function toggleCartSlot(slot: DisplaySlot) {
    const alreadySelected = cart.some(
      item =>
        item.time_start === slot.time_start && item.time_end === slot.time_end
    );

    if (alreadySelected) {
      setCart(prev =>
        prev.filter(
          item =>
            !(
              item.time_start === slot.time_start &&
              item.time_end === slot.time_end
            )
        )
      );
      return;
    }

    if (slot.status !== "available") return;

    const slotMinutes = durationMinutes(slot.time_start, slot.time_end);
    const remainingMinutes = getRemainingReservationMinutesForDate(date);

    if (slotMinutes > remainingMinutes) {
      alert("You can reserve a maximum of 3 hours per day across all rooms.");
      return;
    }

    setCart(prev => [
      ...prev,
      {
        time_start: slot.time_start,
        time_end: slot.time_end,
      },
    ]);
  }

  async function submitCartReservations() {
    if (!lab || !date || cart.length === 0) return;

    setSubmittingCart(true);

    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room_name: lab,
        reserved_date: date,
        items: cart,
      }),
    });

    const data = await res.json();
    setSubmittingCart(false);

    if (!res.ok) {
      alert(data.error ?? "Failed to reserve selected slots.");
      return;
    }

    alert("Reservation confirmed.");
    setCart([]);
    fetchSlots();
    fetchMyReservations();
  }

  function formatNameFromEmail(email: string) {
    const namePart = email.split("@")[0];

    return namePart
      .split(".")
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  }

  function pastReservationLabel(status: string) {
    if (status === "cancelled_by_admin") {
      return "Cancelled by admin";
    }

    if (status === "cancelled_by_instructor") {
      return "Cancelled by instructor";
    }

    return null;
  }

  function pastReservationPillStyle(status: string): React.CSSProperties {
    if (
      status === "cancelled_by_admin" ||
      status === "cancelled_by_instructor"
    ) {
      return {
        background: "var(--danger-bg)",
        color: "var(--danger-text)",
        border: "1px solid var(--danger-border)",
        borderRadius: 999,
        padding: "5px 9px",
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: "nowrap",
      };
    }

    return {};
  }

  function formatReservationDate(dateString: string) {
    if (!dateString) return "";

    const [year, month, day] = dateString.split("-").map(Number);
    const d = new Date(year, month - 1, day);

    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatPanelDate(dateString: string) {
    const { today } = getManilaDateTime();
    const tomorrow = addDaysToDateString(today, 1);

    const [year, month, day] = dateString.split("-").map(Number);
    const d = new Date(year, month - 1, day);

    const fullDate = d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    if (dateString === today) {
      return `Today, ${fullDate}`;
    }

    if (dateString === tomorrow) {
      return `Tomorrow, ${fullDate}`;
    }

    return d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  function getEarliestStart(reservations: Reservation[]) {
    return reservations.reduce(
      (earliest, r) =>
        timeToMinutes(r.time_start) < timeToMinutes(earliest)
          ? r.time_start
          : earliest,
      reservations[0]?.time_start ?? "00:00:00"
    );
  }

  function getLatestEnd(reservations: Reservation[]) {
    return reservations.reduce(
      (latest, r) =>
        timeToMinutes(r.time_end) > timeToMinutes(latest) ? r.time_end : latest,
      reservations[0]?.time_end ?? "00:00:00"
    );
  }

  function getReservationDayGroups(reservations: Reservation[]) {
    const dateMap = new Map<string, Reservation[]>();

    reservations.forEach(r => {
      const existing = dateMap.get(r.reserved_date) ?? [];
      existing.push(r);
      dateMap.set(r.reserved_date, existing);
    });

    const sortedDates = Array.from(dateMap.entries()).sort(([dateA], [dateB]) => {
      return reservationTab === "current"
        ? dateA.localeCompare(dateB)
        : dateB.localeCompare(dateA);
    });

    return sortedDates.map(([reservedDate, dayReservations]) => {
      const sortedDayReservations = [...dayReservations].sort(
        (a, b) => timeToMinutes(a.time_start) - timeToMinutes(b.time_start)
      );

      const roomMap = new Map<string, Reservation[]>();

      sortedDayReservations.forEach(r => {
        const existing = roomMap.get(r.room_name) ?? [];
        existing.push(r);
        roomMap.set(r.room_name, existing);
      });

      const rooms = Array.from(roomMap.entries())
        .sort(([roomA], [roomB]) => roomA.localeCompare(roomB))
        .map(([roomName, roomReservations]) => {
          const sortedRoomReservations = [...roomReservations].sort(
            (a, b) => timeToMinutes(a.time_start) - timeToMinutes(b.time_start)
          );

          return {
            roomName,
            reservations: sortedRoomReservations,
            firstStart: getEarliestStart(sortedRoomReservations),
            lastEnd: getLatestEnd(sortedRoomReservations),
          };
        });

      return {
        reservedDate,
        reservations: sortedDayReservations,
        rooms,
        firstStart: getEarliestStart(sortedDayReservations),
        lastEnd: getLatestEnd(sortedDayReservations),
      };
    });
  }

  const currentReservations = getCurrentReservations();
  const pastReservations = getPastReservations();

  const visibleReservations =
    reservationTab === "current" ? currentReservations : pastReservations;

  const visibleReservationGroups = getReservationDayGroups(visibleReservations);

  const displaySlots = lab && date ? getDisplaySlots() : [];

  const dateFirstRoomPanels =
    scheduleMode === "dateFirst" && previewAnchorDate ? rooms : [];

  const roomFirstDatePanels =
    (scheduleMode === "roomFirst" || scheduleMode === "both") &&
      previewAnchorLab &&
      previewAnchorDate
      ? getPreviewDates(previewAnchorDate)
      : [];

  if (loadingUser) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--page-bg)",
        }}
      >
        <p style={{ color: "var(--muted-3)", fontSize: 14 }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <nav style={s.nav}>
        <Link href="/" style={s.logo}>
          rEEE<span style={{ color: "var(--primary)" }}>serve</span>
        </Link>
        <span style={s.sn}>{email}</span>
      </nav>

      <div style={s.body}>
        <p style={s.welcome}>
          Welcome,{" "}
          <span style={{ color: "var(--primary)" }}>
            {formatNameFromEmail(email)}
          </span>
          !
        </p>

        <div style={s.resShell}>
          <div style={s.resFloatingTitle}>
            Reservations
          </div>

          <div style={s.resHeaderRow}>
            <div />

            <div style={s.tabGroup}>
              <button
                type="button"
                onClick={() => setReservationTab("current")}
                style={{
                  ...s.tabButton,
                  ...(reservationTab === "current" ? s.activeTabButton : {}),
                }}
              >
                Current
              </button>

              <button
                type="button"
                onClick={() => setReservationTab("past")}
                style={{
                  ...s.tabButton,
                  ...(reservationTab === "past" ? s.activeTabButton : {}),
                }}
              >
                Past
              </button>
            </div>
          </div>

          <div style={s.resCard}>
            {visibleReservationGroups.length === 0 ? (
              <p style={{ margin: 0, fontSize: 15, color: "var(--muted)" }}>
                {reservationTab === "current"
                  ? "No current reservations"
                  : "No past reservations"}
              </p>
            ) : (
              <div style={s.resGroupList}>
                {visibleReservationGroups.map(dayGroup => {
                  const isDateOpen =
                    expandedReservationDate === dayGroup.reservedDate;

                  return (
                    <div key={dayGroup.reservedDate} style={s.dayGroupCard}>
                      <button
                        type="button"
                        style={s.dayGroupButton}
                        onClick={() => {
                          setExpandedReservationDate(
                            isDateOpen ? null : dayGroup.reservedDate
                          );
                          setExpandedReservationRoom(null);
                        }}
                      >
                        <div>
                          <strong>
                            {reservationTab === "current"
                              ? formatPanelDate(dayGroup.reservedDate)
                              : formatReservationDate(dayGroup.reservedDate)}
                          </strong>
                          <div style={s.groupSubtext}>
                            {fmt(dayGroup.firstStart)} – {fmt(dayGroup.lastEnd)}
                          </div>
                        </div>

                        <div style={s.groupRightText}>
                          {dayGroup.reservations.length}{" "}
                          {dayGroup.reservations.length === 1 ? "slot" : "slots"}
                          <span style={s.chevron}>{isDateOpen ? "−" : "+"}</span>
                        </div>
                      </button>

                      {isDateOpen && (
                        <div style={s.roomGroupList}>
                          {dayGroup.rooms.map(roomGroup => {
                            const roomKey = `${dayGroup.reservedDate}-${roomGroup.roomName}`;
                            const isRoomOpen = expandedReservationRoom === roomKey;

                            return (
                              <div key={roomKey} style={s.roomGroupCard}>
                                <button
                                  type="button"
                                  style={s.roomGroupButton}
                                  onClick={() =>
                                    setExpandedReservationRoom(
                                      isRoomOpen ? null : roomKey
                                    )
                                  }
                                >
                                  <div>
                                    <strong>{roomGroup.roomName}</strong>
                                    <div style={s.groupSubtext}>
                                      {fmt(roomGroup.firstStart)} –{" "}
                                      {fmt(roomGroup.lastEnd)}
                                    </div>
                                  </div>

                                  <div style={s.groupRightText}>
                                    {roomGroup.reservations.length}{" "}
                                    {roomGroup.reservations.length === 1
                                      ? "slot"
                                      : "slots"}
                                    <span style={s.chevron}>
                                      {isRoomOpen ? "−" : "+"}
                                    </span>
                                  </div>
                                </button>

                                {isRoomOpen && (
                                  <div style={s.timeslotList}>
                                    {roomGroup.reservations.map((r, index) => {
                                      const cancellationLabel =
                                        pastReservationLabel(r.status);

                                      return (
                                        <div
                                          key={r.id}
                                          style={{
                                            ...s.timeslotRow,
                                            ...(reservationTab === "past"
                                              ? s.pastResItem
                                              : {}),
                                          }}
                                        >
                                          <div>
                                            <strong>
                                              {fmt(r.time_start)} – {fmt(r.time_end)}
                                            </strong>
                                          </div>

                                          {reservationTab === "current" &&
                                            canCancelReservation(r) && (
                                              <button
                                                type="button"
                                                style={s.cancelBtn}
                                                onClick={() => cancelReservation(r.id)}
                                              >
                                                Cancel
                                              </button>
                                            )}

                                          {reservationTab === "past" &&
                                            cancellationLabel && (
                                              <span
                                                style={pastReservationPillStyle(r.status)}
                                              >
                                                {cancellationLabel}
                                              </span>
                                            )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div style={s.scheduleShell}>
          <div style={s.scheduleFloatingTitle}>
            Lab Schedules
          </div>

          <div style={s.scheduleCard}>

            <div style={s.filters}>
              <select
                style={s.select}
                value={date}
                onChange={e => {
                  const selectedDate = e.target.value;

                  setDate(selectedDate);
                  setCart([]);

                  if (!selectedDate && !lab) {
                    setScheduleMode("none");
                    setPreviewAnchorDate("");
                    setPreviewAnchorLab("");
                    return;
                  }

                  if (!selectedDate && lab) {
                    const defaultDate = getDefaultScheduleDate();

                    setDate(defaultDate);
                    setScheduleMode("roomFirst");
                    setPreviewAnchorLab(lab);
                    setPreviewAnchorDate(defaultDate);
                    return;
                  }

                  if (selectedDate && lab) {
                    setScheduleMode("both");
                    setPreviewAnchorDate(selectedDate);
                    setPreviewAnchorLab(lab);
                    return;
                  }

                  if (selectedDate && !lab) {
                    setScheduleMode("dateFirst");
                    setPreviewAnchorDate(selectedDate);
                    setPreviewAnchorLab("");
                  }
                }}
              >
                <option value="">Date: select one</option>
                {getDateOptions().map(({ val, label }) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>

              <select
                style={s.select}
                value={lab}
                onChange={e => {
                  const selectedLab = e.target.value;

                  setLab(selectedLab);
                  setCart([]);

                  if (!selectedLab && !date) {
                    setScheduleMode("none");
                    setPreviewAnchorDate("");
                    setPreviewAnchorLab("");
                    return;
                  }

                  if (!selectedLab && date) {
                    setScheduleMode("dateFirst");
                    setPreviewAnchorDate(date);
                    setPreviewAnchorLab("");
                    return;
                  }

                  if (selectedLab && date) {
                    setScheduleMode("both");
                    setPreviewAnchorDate(date);
                    setPreviewAnchorLab(selectedLab);
                    return;
                  }

                  if (selectedLab && !date) {
                    const defaultDate = getDefaultScheduleDate();

                    setDate(defaultDate);
                    setScheduleMode("roomFirst");
                    setPreviewAnchorLab(selectedLab);
                    setPreviewAnchorDate(defaultDate);
                  }
                }}
              >
                <option value="">Lab: select one</option>
                {rooms.map(r => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!lab && !date && (
            <div style={s.emptyBox}>
              Select a date or lab to view the schedule
            </div>
          )}

          {loadingPreviewSlots && (
            <div style={s.emptyBox}>Loading schedule preview...</div>
          )}

          {!loadingPreviewSlots && dateFirstRoomPanels.length > 0 && (
            <div style={s.previewGrid}>
              {dateFirstRoomPanels.map(room => {
                const key = previewKey(previewAnchorDate, room);
                const summary = getScheduleSummary(
                  room,
                  previewAnchorDate,
                  previewSlots[key] ?? []
                );

                const isSelectedRoom = room === lab;

                return (
                  <button
                    key={room}
                    type="button"
                    onClick={() => {
                      setLab(room);
                      setCart([]);
                    }}
                    style={{
                      ...s.previewCard,
                      ...(summary.tone === "success"
                        ? s.previewCardSuccess
                        : summary.tone === "warning"
                          ? s.previewCardWarning
                          : summary.tone === "muted"
                            ? s.previewCardMuted
                            : s.previewCardDanger),
                      ...(isSelectedRoom ? s.previewCardSelected : {}),
                    }}
                  >
                    <div style={s.panelTopRow}>
                      <strong>{room}</strong>
                      <span style={s.panelBadge}>{summary.label}</span>
                    </div>

                    <div style={s.panelMainText}>
                      {formatPanelDate(previewAnchorDate)}
                    </div>

                    <div style={s.panelSubtext}>{summary.detail}</div>
                  </button>
                );
              })}
            </div>
          )}

          {!loadingPreviewSlots && roomFirstDatePanels.length > 0 && (
            <div style={s.panelGrid}>
              {roomFirstDatePanels.map(previewDate => {
                const key = previewKey(previewDate, previewAnchorLab);
                const summary = getScheduleSummary(
                  previewAnchorLab,
                  previewDate,
                  previewSlots[key] ?? []
                );

                const isSelectedDate = previewDate === date;

                return (
                  <button
                    key={previewDate}
                    type="button"
                    style={{
                      ...s.schedulePanel,
                      ...(summary.tone === "success"
                        ? s.successPanel
                        : summary.tone === "warning"
                          ? s.warningPanel
                          : summary.tone === "danger"
                            ? s.dangerPanel
                            : s.mutedPanel),
                      ...(isSelectedDate ? s.selectedPanel : {}),
                    }}
                    onClick={() => {
                      setDate(previewDate);
                      setCart([]);
                    }}
                  >
                    <div style={s.panelTopRow}>
                      <strong>{formatPanelDate(previewDate)}</strong>
                      <span style={s.panelBadge}>{summary.label}</span>
                    </div>

                    <div style={s.panelMainText}>{previewAnchorLab}</div>
                    <div style={s.panelSubtext}>{summary.detail}</div>
                  </button>
                );
              })}
            </div>
          )}

          {lab && date && loadingSlots && <div style={s.emptyBox}>Loading...</div>}

          {lab && date && !loadingSlots && displaySlots.length === 0 && (
            <div style={s.emptyBox}>No available timeslots left for this date</div>
          )}

          {lab && date && !loadingSlots && displaySlots.length > 0 && (
            <>
              <div style={s.selectedScheduleHeader}>
                <div>
                  <strong>{lab}</strong>
                  <div style={s.groupSubtext}>{formatPanelDate(date)}</div>
                </div>
              </div>

              <div style={s.slotGrid}>
                {displaySlots.map(slot => {
                  const key = `${slot.time_start}-${slot.time_end}`;
                  const hasCourse = slot.status === "occupied" && slot.course_name;
                  const isAvailable = slot.status === "available";
                  const isSelected = slot.status === "selected";
                  const isReservedByMe = slot.status === "reservedByMe";
                  const isFull = slot.status === "full";
                  const isClickable = isAvailable || isSelected || isReservedByMe;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        if (isReservedByMe) {
                          const matchingReservation = allReservations.find(
                            r =>
                              r.student_email === email &&
                              r.room_name === lab &&
                              r.reserved_date === date &&
                              r.status === "approved" &&
                              overlaps(slot.time_start, slot.time_end, r.time_start, r.time_end)
                          );

                          if (!matchingReservation) {
                            alert("Could not find your reservation for this timeslot.");
                            return;
                          }

                          cancelReservation(matchingReservation.id);
                          return;
                        }

                        toggleCartSlot(slot);
                      }}
                      style={{
                        ...s.slotPill,
                        ...(isSelected
                          ? s.selectedPill
                          : isReservedByMe
                            ? s.reservedByMePill
                            : isAvailable
                              ? s.availablePill
                              : s.occupiedPill),
                        cursor: isClickable ? "pointer" : "not-allowed",
                      }}
                    >
                      <span style={s.slotTimeText}>
                        {fmt(slot.time_start)} – {fmt(slot.time_end)}
                      </span>

                      <span style={s.slotInfoText}>
                        {hasCourse
                          ? slot.course_name
                          : isSelected
                            ? "Selected"
                            : isReservedByMe
                              ? `You reserved this timeslot • click to cancel • ${slot.slots_left}/${slot.capacity} slots left`
                              : isAvailable
                                ? `${slot.slots_left}/${slot.capacity} slots left`
                                : isFull
                                  ? "Full"
                                  : "Occupied"}
                      </span>
                    </button>
                  );
                })}
              </div>

              {cart.length > 0 && (
                <div style={s.cartBox}>
                  <div>
                    <strong>{cart.length}</strong>{" "}
                    {cart.length === 1 ? "slot selected" : "slots selected"}

                    <div style={s.groupSubtext}>
                      Remaining reservation time for this day:{" "}
                      {Math.floor(getRemainingReservationMinutesForDate(date) / 60)} hr{" "}
                      {getRemainingReservationMinutesForDate(date) % 60} min
                    </div>
                  </div>

                  <button
                    type="button"
                    style={s.btn}
                    onClick={submitCartReservations}
                    disabled={submittingCart}
                  >
                    {submittingCart ? "Reserving..." : "Reserve selected slots"}
                  </button>
                </div>
              )}

              <div style={s.legend}>
                <span style={s.legendItem}>
                  <span style={{ ...s.dot, background: "var(--success-border)" }} />
                  Available
                </span>

                <span style={s.legendItem}>
                  <span style={{ ...s.dot, background: "var(--danger-border)" }} />
                  Occupied / Full
                </span>

                <span style={s.legendItem}>
                  <span style={{ ...s.dot, background: "var(--warning-border)" }} />
                  Your reservation
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <footer style={s.footer}>
        <a href="/about" style={s.footerLink}>
          About
        </a>
        <a href="/help" style={s.footerLink}>
          Help
        </a>
      </footer>
    </div>
  );
}

const s: { [k: string]: React.CSSProperties } = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "var(--page-bg)",
    color: "var(--text)",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },

  nav: {
    height: 64,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 28px",
    borderBottom: "1px solid var(--border)",
    background: "var(--surface)",
    position: "sticky",
    top: 0,
    zIndex: 20,
  },

  logo: {
    fontSize: 20,
    fontWeight: 800,
    textDecoration: "none",
    color: "var(--text)",
    letterSpacing: -0.5,
  },

  sn: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--muted)",
    background: "transparent",
    border: "none",
    padding: 0,
    borderRadius: 0,
    maxWidth: 260,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  body: {
    flex: 1,
    width: "100%",
    maxWidth: 980,
    margin: "0 auto",
    padding: "28px 18px 34px",
    boxSizing: "border-box",
  },

  welcome: {
    margin: "0 0 22px",
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: -0.3,
    textAlign: "left",
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: 800,
    color: "var(--text)",
    margin: 0,
  },

  resShell: {
    position: "relative",
    marginTop: 24,
    marginBottom: 24,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    borderRadius: 18,
    boxShadow: "var(--shadow-sm)",
    padding: "34px 18px 18px",
  },

  resFloatingTitle: {
    position: "absolute",
    top: -16,
    left: 18,
    padding: "8px 16px",
    borderRadius: 14,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    fontSize: 16,
    fontWeight: 800,
    boxShadow: "var(--shadow-sm)",
  },

  scheduleShell: {
    position: "relative",
    marginTop: 30,
    marginBottom: 24,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    borderRadius: 18,
    boxShadow: "var(--shadow-sm)",
    padding: "34px 18px 18px",
  },

  scheduleFloatingTitle: {
    position: "absolute",
    top: -16,
    left: 18,
    padding: "8px 16px",
    borderRadius: 14,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    fontSize: 16,
    fontWeight: 800,
    boxShadow: "var(--shadow-sm)",
  },

  resCard: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },

  scheduleCard: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },

  resHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
    marginBottom: 14,
  },

  tabGroup: {
    display: "flex",
    gap: 6,
    background: "var(--tab-bg)",
    border: "1px solid var(--border)",
    padding: 5,
    borderRadius: 16,
  },

  tabButton: {
    border: "none",
    background: "transparent",
    color: "var(--muted)",
    fontSize: 13,
    fontWeight: 700,
    padding: "9px 14px",
    borderRadius: 12,
    cursor: "pointer",
  },

  activeTabButton: {
    background: "var(--surface)",
    color: "var(--primary)",
    boxShadow: "var(--shadow-sm)",
    fontWeight: 800,
  },

  filters: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
    marginBottom: 10,
  },

  select: {
    width: "100%",
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    borderRadius: 12,
    padding: "11px 12px",
    fontSize: 14,
    outline: "none",
    minWidth: 0,
  },

  emptyBox: {
    border: "1px dashed var(--border-strong)",
    background: "var(--surface-2)",
    color: "var(--muted)",
    borderRadius: 16,
    padding: 18,
    textAlign: "center",
    fontSize: 14,
  },

  resGroupList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    width: "100%",
  },

  dayGroupCard: {
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    borderRadius: 16,
    overflow: "hidden",
  },

  dayGroupButton: {
    width: "100%",
    border: "none",
    background: "transparent",
    color: "var(--text)",
    padding: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    cursor: "pointer",
    textAlign: "left",
  },

  roomGroupList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "0 12px 12px",
  },

  roomGroupCard: {
    border: "1px solid var(--border)",
    background: "var(--surface)",
    borderRadius: 14,
    overflow: "hidden",
  },

  roomGroupButton: {
    width: "100%",
    border: "none",
    background: "transparent",
    color: "var(--text)",
    padding: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    cursor: "pointer",
    textAlign: "left",
  },

  groupSubtext: {
    marginTop: 4,
    fontSize: 12,
    color: "var(--muted)",
  },

  groupRightText: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 700,
    color: "var(--muted)",
    whiteSpace: "nowrap",
  },

  chevron: {
    width: 24,
    height: 24,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    background: "var(--tab-bg)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    fontSize: 16,
    fontWeight: 800,
    lineHeight: 1,
  },

  timeslotList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "0 12px 12px",
  },

  timeslotRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    borderRadius: 12,
    padding: 12,
    color: "var(--text)",
    flexWrap: "wrap",
  },

  cancelBtn: {
    border: "1px solid var(--danger-border-2)",
    background: "var(--danger-bg-2)",
    color: "var(--danger-text-2)",
    borderRadius: 10,
    padding: "8px 12px",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 800,
  },

  pastResItem: {
    background: "var(--surface-3)",
    borderColor: "var(--border)",
    color: "var(--muted)",
  },

  previewCard: {
    border: "1px solid var(--border)",
    background: "var(--surface-soft)",
    color: "var(--text)",
    borderRadius: 16,
    padding: 14,
    cursor: "pointer",
    textAlign: "left",
    transition: "transform 120ms ease, box-shadow 120ms ease",
  },

  previewCardSuccess: {
    background: "var(--success-bg)",
    borderColor: "var(--success-border)",
  },

  previewCardWarning: {
    background: "var(--warning-bg)",
    borderColor: "var(--warning-border)",
  },

  previewCardDanger: {
    background: "var(--danger-bg)",
    borderColor: "var(--danger-border)",
  },

  previewCardMuted: {
    background: "var(--surface-2)",
    borderColor: "var(--border)",
    opacity: 0.8,
  },

  previewCardSelected: {
    outline: "2px solid var(--primary)",
    outlineOffset: 2,
  },

  panelGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 12,
    padding: 16,
  },

  schedulePanel: {
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: 14,
    background: "var(--surface-2)",
    color: "var(--text)",
    textAlign: "left",
    cursor: "pointer",
    minHeight: 112,
  },

  selectedPanel: {
    outline: "2px solid var(--primary)",
    outlineOffset: 2,
  },

  successPanel: {
    background: "var(--success-bg)",
    borderColor: "var(--success-border)",
  },

  warningPanel: {
    background: "var(--warning-bg)",
    borderColor: "var(--warning-border)",
  },

  dangerPanel: {
    background: "var(--danger-bg)",
    borderColor: "var(--danger-border)",
  },

  mutedPanel: {
    background: "var(--surface-2)",
    borderColor: "var(--border)",
  },

  panelTopRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 12,
  },

  panelBadge: {
    fontSize: 11,
    fontWeight: 800,
    padding: "4px 8px",
    borderRadius: 999,
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    whiteSpace: "nowrap",
  },

  panelMainText: {
    fontSize: 14,
    fontWeight: 800,
    color: "var(--text)",
  },

  panelSubtext: {
    marginTop: 4,
    fontSize: 12,
    color: "var(--muted)",
  },

  previewGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 12,
    marginBottom: 14,
  },

  selectedScheduleHeader: {
    padding: "12px 14px",
    border: "1px solid var(--border)",
    borderRadius: 12,
    background: "var(--surface-2)",
    marginTop: 4,
    marginBottom: 14,
  },

  slotGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 8,
    marginTop: 2,
  },

  slotPill: {
    position: "relative",
    border: "1px solid",
    borderRadius: 14,
    padding: "8px 10px",
    fontSize: 12,
    fontWeight: 600,
    textAlign: "center",
    minHeight: 48,
    overflow: "hidden",
    cursor: "default",
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

  selectedPill: {
    background: "var(--primary-soft)",
    borderColor: "var(--primary)",
    color: "var(--primary)",
  },

  reservedByMePill: {
    background: "var(--warning-bg)",
    borderColor: "var(--warning-border)",
    color: "var(--warning-text)",
  },

  slotTimeText: {
    display: "block",
    fontSize: 11,
    lineHeight: 1.1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  slotInfoText: {
    display: "block",
    marginTop: 3,
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1.1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  legend: {
    display: "flex",
    marginTop: 12,
    gap: 14,
    fontSize: 11,
    color: "var(--muted)",
    flexWrap: "wrap",
  },

  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 5,
  },

  dot: {
    width: 9,
    height: 9,
    borderRadius: 99,
  },

  cartBox: {
    padding: 12,
    border: "1px solid var(--primary-border)",
    borderRadius: 12,
    background: "var(--primary-soft)",
    color: "var(--text)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },

  btn: {
    border: "none",
    background: "var(--primary)",
    color: "#fff",
    borderRadius: 12,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
    textDecoration: "none",
    whiteSpace: "nowrap",
  },

  resItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 12px",
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--surface-2)",
  },

  slotSpacer: {
    visibility: "hidden",
  },

  footer: {
    display: "flex",
    justifyContent: "center",
    gap: 18,
    padding: "20px 16px 28px",
    marginTop: "auto",
    borderTop: "1px solid var(--border)",
    background: "var(--surface)",
  },

  footerLink: {
    color: "var(--muted)",
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 600,
  },
};
