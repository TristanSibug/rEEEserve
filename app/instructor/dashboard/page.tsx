"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";

type Tab = "classes" | "reservations";
type ScheduleMode = "none" | "dateFirst" | "roomFirst" | "both";
type ScheduleChangeSource = "dropdown" | "panel";

type ScheduleSlot = {
  id: number | string;
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
  status: "available" | "reserved" | "reservedByMe" | "full" | "occupied";
  course_name?: string | null;
  capacity: number;
  reserved_count: number;
  slots_left: number;
};

type InstructorReservation = {
  id: number;
  room_name: string;
  schedule_date: string;
  time_start: string;
  time_end: string;
  status: string;
};

const rooms = ["EEEI 301", "EEEI 305", "EEEI 308"];

const roomCapacity: Record<string, number> = {
  "EEEI 301": 10,
  "EEEI 305": 10,
  "EEEI 308": 16,
};

const teachingClasses = [
  {
    name: "EEE 121",
    lab: "EEEI 399",
    days: "M, W",
    timeslot: "11:30 AM – 2:30 PM",
  },
  {
    name: "EEE 128",
    lab: "EEEI 001",
    days: "S",
    timeslot: "8:00 AM – 11:00 AM",
  },
];

const RESERVATION_LEAD_TIME_MINUTES = 60;

export default function InstructorDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("classes");
  const [username, setUsername] = useState("Instructor");

  const [lab, setLab] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [myReservations, setMyReservations] = useState<InstructorReservation[]>([]);
  const [creatingReservation, setCreatingReservation] = useState(false);

  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("none");
  const [previewAnchorDate, setPreviewAnchorDate] = useState("");
  const [previewAnchorLab, setPreviewAnchorLab] = useState("");
  const [previewSlots, setPreviewSlots] = useState<Record<string, ScheduleSlot[]>>({});
  const [loadingPreviewSlots, setLoadingPreviewSlots] = useState(false);

  const [expandedReservationDate, setExpandedReservationDate] = useState<string | null>(null);
  const [expandedReservationRoom, setExpandedReservationRoom] = useState<string | null>(null);

  useEffect(() => {
    setUsername("Instructor");
  }, []);

  useEffect(() => {
    fetchMyReservations();
  }, []);

  useEffect(() => {
    if (!lab || !date) {
      setSlots([]);
      return;
    }

    fetchSlots();
  }, [lab, date]);

  useEffect(() => {
    fetchPreviewSlots();
  }, [scheduleMode, previewAnchorDate, previewAnchorLab, myReservations]);

  async function fetchSlots() {
    setLoadingSlots(true);

    try {
      const res = await fetch(
        `/api/schedules?date=${date}&room=${encodeURIComponent(lab)}`
      );

      const data = await res.json();

      if (!res.ok) {
        console.error("Failed to fetch schedule:", data);
        setSlots([]);
        return;
      }

      setSlots(Array.isArray(data) ? data : []);
    } finally {
      setLoadingSlots(false);
    }
  }

  async function fetchPreviewSlots() {
    const requests: { key: string; room: string; date: string }[] = [];

    if (scheduleMode === "dateFirst" && previewAnchorDate) {
      rooms.forEach(room => {
        requests.push({
          key: previewKey(previewAnchorDate, room),
          room,
          date: previewAnchorDate,
        });
      });
    }

    if (
      (scheduleMode === "roomFirst" || scheduleMode === "both") &&
      previewAnchorLab &&
      previewAnchorDate
    ) {
      getPreviewDates(previewAnchorDate).forEach(previewDate => {
        requests.push({
          key: previewKey(previewDate, previewAnchorLab),
          room: previewAnchorLab,
          date: previewDate,
        });
      });
    }

    if (requests.length === 0) {
      setPreviewSlots({});
      return;
    }

    setLoadingPreviewSlots(true);

    try {
      const entries = await Promise.all(
        requests.map(async item => {
          const res = await fetch(
            `/api/schedules?date=${item.date}&room=${encodeURIComponent(item.room)}`
          );

          const data = await res.json();

          return [item.key, res.ok && Array.isArray(data) ? data : []] as const;
        })
      );

      setPreviewSlots(Object.fromEntries(entries));
    } finally {
      setLoadingPreviewSlots(false);
    }
  }

  async function fetchMyReservations() {
    const res = await fetch("/api/instructor/reservations");
    const data = await res.json();

    if (!res.ok) {
      setMyReservations([]);
      return;
    }

    setMyReservations(Array.isArray(data.current) ? data.current : []);
  }

  function normalizeTime(t: string) {
    if (!t) return "00:00:00";

    const parts = t.split(":");

    const h = parts[0] ?? "00";
    const m = parts[1] ?? "00";
    const s = parts[2] ?? "00";

    return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:${s.padStart(2, "0")}`;
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

  function isSlotAllowedForDate(selectedDate: string, slotStart: string) {
    const { today, nowMinutes } = getManilaDateTime();

    if (selectedDate < today) return false;
    if (selectedDate > today) return true;

    return timeToMinutes(slotStart) >= nowMinutes + RESERVATION_LEAD_TIME_MINUTES;
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

  function getPreviewDates(anchorDate: string) {
    return [0, 1, 2].map(offset => addDaysToDateString(anchorDate, offset));
  }

  function previewKey(previewDate: string, previewLab: string) {
    return `${previewDate}-${previewLab}`;
  }

  function getEarliestStart(reservations: InstructorReservation[]) {
    return reservations.reduce(
      (earliest, r) =>
        timeToMinutes(r.time_start) < timeToMinutes(earliest)
          ? r.time_start
          : earliest,
      reservations[0]?.time_start ?? "00:00:00"
    );
  }

  function getLatestEnd(reservations: InstructorReservation[]) {
    return reservations.reduce(
      (latest, r) =>
        timeToMinutes(r.time_end) > timeToMinutes(latest) ? r.time_end : latest,
      reservations[0]?.time_end ?? "00:00:00"
    );
  }

  function getInstructorReservationDayGroups(
    reservations: InstructorReservation[]
  ) {
    const dateMap = new Map<string, InstructorReservation[]>();

    reservations.forEach(r => {
      const existing = dateMap.get(r.schedule_date) ?? [];
      existing.push(r);
      dateMap.set(r.schedule_date, existing);
    });

    const sortedDates = Array.from(dateMap.entries()).sort(([dateA], [dateB]) =>
      dateA.localeCompare(dateB)
    );

    return sortedDates.map(([scheduleDate, dayReservations]) => {
      const sortedDayReservations = [...dayReservations].sort(
        (a, b) => timeToMinutes(a.time_start) - timeToMinutes(b.time_start)
      );

      const roomMap = new Map<string, InstructorReservation[]>();

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
        scheduleDate,
        reservations: sortedDayReservations,
        rooms,
        firstStart: getEarliestStart(sortedDayReservations),
        lastEnd: getLatestEnd(sortedDayReservations),
      };
    });
  }

  function canCancelInstructorReservation(r: InstructorReservation) {
    return isSlotAllowedForDate(r.schedule_date, r.time_start);
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

  function getDisplaySlotsFor(
    selectedLab: string,
    selectedDate: string,
    sourceSlots: ScheduleSlot[]
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

      const reservedByMe = myReservations.some(
        r =>
          r.room_name === selectedLab &&
          r.schedule_date === selectedDate &&
          overlaps(time_start, time_end, r.time_start, r.time_end)
      );

      const blockingSlot = sourceSlots.find(
        slot =>
          slot.source !== "reservation" &&
          !reservedByMe &&
          overlaps(time_start, time_end, slot.time_start, slot.time_end)
      );

      const reservationCount = sourceSlots.filter(
        slot =>
          slot.source === "reservation" &&
          overlaps(time_start, time_end, slot.time_start, slot.time_end)
      ).length;

      const slotsLeft = capacity - reservationCount;

      displaySlots.push({
        time_start,
        time_end,
        status: reservedByMe
          ? "reservedByMe"
          : blockingSlot
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
    sourceSlots: ScheduleSlot[]
  ) {
    const display = getDisplaySlotsFor(selectedLab, selectedDate, sourceSlots);

    const available = display.filter(slot => slot.status === "available").length;
    const reserved = display.filter(slot => slot.status === "reserved").length;
    const reservedByMe = display.filter(slot => slot.status === "reservedByMe").length;
    const full = display.filter(slot => slot.status === "full").length;
    const occupied = display.filter(slot => slot.status === "occupied").length;

    if (display.length === 0) {
      return {
        label: "No timeslots left",
        detail: "All usable timeslots have passed",
        tone: "muted" as const,
      };
    }

    if (reservedByMe > 0) {
      return {
        label: "Reserved by you",
        detail: `${reservedByMe} reserved slot${reservedByMe === 1 ? "" : "s"}`,
        tone: "warning" as const,
      };
    }

    if (available > 0) {
      return {
        label: "Available",
        detail: `${available} open slot${available === 1 ? "" : "s"}`,
        tone: "success" as const,
      };
    }

    if (reserved > 0 || full > 0) {
      return {
        label: "Student reservations",
        detail: `${reserved + full} student-used slot${reserved + full === 1 ? "" : "s"
          }`,
        tone: "warning" as const,
      };
    }

    return {
      label: "Occupied",
      detail: "Blocked by class or schedule",
      tone: "danger" as const,
    };
  }

  async function createInstructorReservation(slot: DisplaySlot) {
    if (!lab || !date) return;

    if (slot.status === "occupied") {
      alert("This slot is occupied by a class or blocked schedule.");
      return;
    }

    if (slot.status === "reservedByMe") {
      const matchingReservation = myReservations.find(
        r =>
          r.room_name === lab &&
          r.schedule_date === date &&
          overlaps(slot.time_start, slot.time_end, r.time_start, r.time_end)
      );

      if (!matchingReservation) {
        alert("Could not find your instructor reservation for this timeslot.");
        return;
      }

      cancelInstructorReservation(matchingReservation.id);
      return;
    }

    const confirmMessage =
      slot.status === "available"
        ? `Reserve ${lab} from ${fmt(slot.time_start)} to ${fmt(slot.time_end)}?`
        : "This slot has student reservation(s). Reserving it as an instructor may cancel affected student bookings and notify them by email. Continue?";

    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) return;

    setCreatingReservation(true);

    const firstRes = await fetch("/api/instructor/reservations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        room_name: lab,
        schedule_date: date,
        time_start: slot.time_start,
        time_end: slot.time_end,
        force: false,
      }),
    });

    const firstData = await firstRes.json();

    if (firstRes.status === 409 && firstData.needsConfirmation) {
      const overrideConfirmed = window.confirm(firstData.message);

      if (!overrideConfirmed) {
        setCreatingReservation(false);
        return;
      }

      const secondRes = await fetch("/api/instructor/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          room_name: lab,
          schedule_date: date,
          time_start: slot.time_start,
          time_end: slot.time_end,
          force: true,
        }),
      });

      const secondData = await secondRes.json();

      setCreatingReservation(false);

      if (!secondRes.ok) {
        alert(secondData.error ?? "Failed to create instructor reservation.");
        return;
      }

      alert(
        `Instructor reservation created.\n${secondData.cancelledStudentReservations ?? 0
        } student booking(s) were cancelled and notified.`
      );

      fetchSlots();
      fetchMyReservations();
      return;
    }

    setCreatingReservation(false);

    if (!firstRes.ok) {
      alert(firstData.error ?? "Failed to create instructor reservation.");
      return;
    }

    alert("Instructor reservation created.");
    fetchSlots();
    fetchMyReservations();
  }

  async function cancelInstructorReservation(id: number) {
    const confirmed = window.confirm("Cancel this instructor reservation?");
    if (!confirmed) return;

    const res = await fetch(`/api/instructor/reservations?id=${id}`, {
      method: "DELETE",
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error ?? "Failed to cancel instructor reservation.");
      return;
    }

    fetchSlots();
    fetchMyReservations();
  }

  function handleDateChange(
    selectedDate: string,
    source: ScheduleChangeSource = "dropdown"
  ) {
    const currentLab = lab;
    const currentMode = scheduleMode;
    const currentPreviewAnchorDate = previewAnchorDate;
    const currentPreviewAnchorLab = previewAnchorLab;

    setDate(selectedDate);

    if (!selectedDate && !currentLab) {
      setScheduleMode("none");
      setPreviewAnchorDate("");
      setPreviewAnchorLab("");
      return;
    }

    if (!selectedDate && currentLab) {
      const defaultDate = getDefaultScheduleDate();

      setDate(defaultDate);
      setScheduleMode("roomFirst");
      setPreviewAnchorLab(currentLab);
      setPreviewAnchorDate(defaultDate);
      return;
    }

    if (selectedDate && currentLab) {
      /*
        Important:
        If the user clicked one of the 3 preview panels, do NOT move the
        preview anchor. This keeps the same 3 panels visible, just like the
        student dashboard behavior.
      */
      if (
        source === "panel" &&
        (currentMode === "roomFirst" || currentMode === "both") &&
        currentPreviewAnchorDate &&
        currentPreviewAnchorLab
      ) {
        setScheduleMode(currentMode);
        setPreviewAnchorDate(currentPreviewAnchorDate);
        setPreviewAnchorLab(currentPreviewAnchorLab);
        return;
      }

      /*
        Dropdown date change while a lab is already selected:
        this means the user intentionally changed both filters, so this
        selected date becomes the first panel.
      */
      setScheduleMode("both");
      setPreviewAnchorDate(selectedDate);
      setPreviewAnchorLab(currentLab);
      return;
    }

    if (selectedDate && !currentLab) {
      setScheduleMode("dateFirst");
      setPreviewAnchorDate(selectedDate);
      setPreviewAnchorLab("");
    }
  }

  function handleLabChange(
    selectedLab: string,
    source: ScheduleChangeSource = "dropdown"
  ) {
    const currentDate = date;
    const currentMode = scheduleMode;
    const currentPreviewAnchorDate = previewAnchorDate;

    setLab(selectedLab);

    if (!selectedLab && !currentDate) {
      setScheduleMode("none");
      setPreviewAnchorDate("");
      setPreviewAnchorLab("");
      return;
    }

    if (!selectedLab && currentDate) {
      setScheduleMode("dateFirst");
      setPreviewAnchorDate(currentDate);
      setPreviewAnchorLab("");
      return;
    }

    if (selectedLab && currentDate) {

      if (
        source === "panel" &&
        currentMode === "dateFirst" &&
        currentPreviewAnchorDate
      ) {
        setScheduleMode("dateFirst");
        setPreviewAnchorDate(currentPreviewAnchorDate);
        setPreviewAnchorLab("");
        return;
      }

      setScheduleMode("both");
      setPreviewAnchorDate(currentDate);
      setPreviewAnchorLab(selectedLab);
      return;
    }

    if (selectedLab && !currentDate) {
      const defaultDate = getDefaultScheduleDate();

      setDate(defaultDate);
      setScheduleMode("roomFirst");
      setPreviewAnchorDate(defaultDate);
      setPreviewAnchorLab(selectedLab);
    }
  }

  const displaySlots = lab && date ? getDisplaySlots() : [];

  const instructorReservationGroups =
    getInstructorReservationDayGroups(myReservations);

  const dateFirstRoomPanels =
    scheduleMode === "dateFirst" && previewAnchorDate ? rooms : [];

  const roomFirstDatePanels =
    (scheduleMode === "roomFirst" || scheduleMode === "both") &&
      previewAnchorLab &&
      previewAnchorDate
      ? getPreviewDates(previewAnchorDate)
      : [];

  const selectedPreviewKey = lab && date ? previewKey(date, lab) : "";

  return (
    <div style={s.page}>
      <nav style={s.nav}>
        <Link href="/" style={s.logo}>
          rEEE<span style={{ color: "var(--primary)" }}>serve</span>
        </Link>

        <div style={s.navRight}>
          <span style={s.badge}>Instructor</span>
        </div>
      </nav>

      <main style={s.body}>
        <p style={s.welcome}>
          Welcome, <span style={{ color: "var(--primary)" }}>{username}</span>!
        </p>

        <div style={s.card}>
          <div style={s.tabs}>
            <button
              type="button"
              style={activeTab === "classes" ? s.activeTab : s.tab}
              onClick={() => setActiveTab("classes")}
            >
              My Classes
            </button>

            <button
              type="button"
              style={activeTab === "reservations" ? s.activeTab : s.tab}
              onClick={() => setActiveTab("reservations")}
            >
              Reservations
            </button>
          </div>

          {activeTab === "classes" && (
            <div>
              <div style={s.sectionHeader}>
                <div>
                  <p style={s.sectionSubtitle}>
                    Placeholder. Not working yet (Class sharing & No lab class implementation).
                  </p>
                </div>

                <button type="button" style={s.btn}>
                  Edit Classes
                </button>
              </div>

              <div style={s.classGrid}>
                {teachingClasses.map(cls => (
                  <div key={`${cls.name}-${cls.lab}-${cls.days}`} style={s.classCard}>
                    <div style={s.classCardTop}>
                      <div>
                        <div style={s.classCode}>{cls.name}</div>
                        <div style={s.classLab}>{cls.lab}</div>
                      </div>

                      <button type="button" style={s.classCancelBtn}>
                        Cancel
                      </button>
                    </div>

                    <div style={s.classMetaGrid}>
                      <div style={s.classMetaItem}>
                        <span style={s.classMetaLabel}>Days</span>
                        <strong style={s.classMetaValue}>{cls.days}</strong>
                      </div>

                      <div style={s.classMetaItem}>
                        <span style={s.classMetaLabel}>Timeslot</span>
                        <strong style={s.classMetaValue}>{cls.timeslot}</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "reservations" && (
            <div style={s.content}>
              <div style={s.floatingSection}>
                <div style={s.floatingSectionTitle}>My Reservations</div>

                <div style={s.resCard}>
                  {instructorReservationGroups.length === 0 ? (
                    <p style={s.emptyText}>No instructor reservations</p>
                  ) : (
                    <div style={s.resGroupList}>
                      {instructorReservationGroups.map(dayGroup => {
                        const isDateOpen =
                          expandedReservationDate === dayGroup.scheduleDate;

                        return (
                          <div key={dayGroup.scheduleDate} style={s.dayGroupCard}>
                            <button
                              type="button"
                              style={s.dayGroupButton}
                              onClick={() => {
                                setExpandedReservationDate(
                                  isDateOpen ? null : dayGroup.scheduleDate
                                );
                                setExpandedReservationRoom(null);
                              }}
                            >
                              <div>
                                <strong>{formatPanelDate(dayGroup.scheduleDate)}</strong>
                                <div style={s.groupSubtext}>
                                  {fmt(dayGroup.firstStart)} – {fmt(dayGroup.lastEnd)}
                                </div>
                              </div>

                              <div style={s.groupRightText}>
                                {dayGroup.reservations.length}{" "}
                                {dayGroup.reservations.length === 1
                                  ? "slot"
                                  : "slots"}
                                <span style={s.chevron}>
                                  {isDateOpen ? "−" : "+"}
                                </span>
                              </div>
                            </button>

                            {isDateOpen && (
                              <div style={s.roomGroupList}>
                                {dayGroup.rooms.map(roomGroup => {
                                  const roomKey = `${dayGroup.scheduleDate}-${roomGroup.roomName}`;
                                  const isRoomOpen =
                                    expandedReservationRoom === roomKey;

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
                                          {roomGroup.reservations.map(r => (
                                            <div key={r.id} style={s.timeslotRow}>
                                              <div>
                                                <strong>
                                                  {fmt(r.time_start)} – {fmt(r.time_end)}
                                                </strong>
                                              </div>

                                              {canCancelInstructorReservation(r) && (
                                                <button
                                                  type="button"
                                                  style={s.cancelBtn}
                                                  onClick={() =>
                                                    cancelInstructorReservation(r.id)
                                                  }
                                                >
                                                  Cancel
                                                </button>
                                              )}
                                            </div>
                                          ))}
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

              <div style={s.floatingSection}>
                <div style={s.floatingSectionTitle}>Lab Schedules</div>

                <div style={s.scheduleCard}>
                  <div style={s.filters}>
                    <select
                      style={s.select}
                      value={date}
                      onChange={e => handleDateChange(e.target.value)}
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
                      onChange={e => handleLabChange(e.target.value)}
                    >
                      <option value="">Lab: select one</option>

                      {rooms.map(room => (
                        <option key={room} value={room}>
                          {room}
                        </option>
                      ))}
                    </select>
                  </div>

                  {loadingPreviewSlots && (
                    <div style={s.emptyBox}>Loading schedules...</div>
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
                        const isSelectedPanel = selectedPreviewKey === key;

                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => handleLabChange(room, "panel")}
                            style={{
                              ...s.previewCard,
                              ...(summary.tone === "success"
                                ? s.previewCardSuccess
                                : summary.tone === "warning"
                                  ? s.previewCardWarning
                                  : summary.tone === "muted"
                                    ? s.previewCardMuted
                                    : s.previewCardDanger),
                              ...(isSelectedPanel ? s.previewCardSelected : {}),
                            }}
                          >
                            <div style={s.previewMainText}>
                              {room}
                            </div>

                            <div style={s.previewSubText}>
                              {formatPanelDate(previewAnchorDate)}
                            </div>

                            <div style={s.previewDetail}>
                              {summary.detail}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {!loadingPreviewSlots && roomFirstDatePanels.length > 0 && (
                    <div style={s.previewGrid}>
                      {roomFirstDatePanels.map(previewDate => {
                        const key = previewKey(previewDate, previewAnchorLab);
                        const summary = getScheduleSummary(
                          previewAnchorLab,
                          previewDate,
                          previewSlots[key] ?? []
                        );
                        const isSelectedPanel = selectedPreviewKey === key;

                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => handleDateChange(previewDate, "panel")}
                            style={{
                              ...s.previewCard,
                              ...(summary.tone === "success"
                                ? s.previewCardSuccess
                                : summary.tone === "warning"
                                  ? s.previewCardWarning
                                  : summary.tone === "muted"
                                    ? s.previewCardMuted
                                    : s.previewCardDanger),
                              ...(isSelectedPanel ? s.previewCardSelected : {}),
                            }}
                          >
                            <div style={s.previewMainText}>
                              {formatPanelDate(previewDate)}
                            </div>

                            <div style={s.previewSubText}>
                              {previewAnchorLab}
                            </div>

                            <div style={s.previewDetail}>
                              {summary.detail}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {(!lab || !date) && (
                    <div style={s.emptyBox}>
                      Select a date or lab to view the schedule
                    </div>
                  )}

                  {lab && date && loadingSlots && (
                    <div style={s.emptyBox}>Loading...</div>
                  )}

                  {lab && date && !loadingSlots && displaySlots.length === 0 && (
                    <div style={s.emptyBox}>
                      No available timeslots left for this date
                    </div>
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

                          const hasCourse =
                            slot.status === "occupied" && slot.course_name;
                          const isAvailable = slot.status === "available";
                          const isReserved = slot.status === "reserved";
                          const isReservedByMe = slot.status === "reservedByMe";
                          const isFull = slot.status === "full";
                          const isOccupied = slot.status === "occupied";

                          const isClickable =
                            !isOccupied && !creatingReservation;

                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => createInstructorReservation(slot)}
                              disabled={!isClickable}
                              style={{
                                ...s.slotPill,
                                ...(isReservedByMe
                                  ? s.reservedByMePill
                                  : isAvailable
                                    ? s.availablePill
                                    : isReserved || isFull
                                      ? s.reservedPill
                                      : s.occupiedPill),
                                cursor: isClickable ? "pointer" : "not-allowed",
                                opacity: creatingReservation ? 0.75 : 1,
                              }}
                            >
                              <span style={s.slotTimeText}>
                                {fmt(slot.time_start)} – {fmt(slot.time_end)}
                              </span>

                              <span style={s.slotInfoText}>
                                {hasCourse
                                  ? slot.course_name
                                  : isReservedByMe
                                    ? `Reserved by you • ${slot.slots_left}/${slot.capacity} slots left`
                                    : isAvailable
                                      ? `${slot.slots_left}/${slot.capacity} slots left`
                                      : isFull
                                        ? "Full"
                                        : isReserved
                                          ? `${slot.slots_left}/${slot.capacity} slots left`
                                          : "Occupied"}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div style={s.legend}>
                        <span style={s.legendItem}>
                          <span style={{ ...s.dot, background: "#97C459" }} />
                          Available
                        </span>

                        <span style={s.legendItem}>
                          <span style={{ ...s.dot, background: "#F4A340" }} />
                          Reserved by you
                        </span>

                        <span style={s.legendItem}>
                          <span style={{ ...s.dot, background: "#E24B4A" }} />
                          Reserved / occupied
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer style={s.footer}>
        <Link href="/about" style={s.footerLink}>
          About
        </Link>
        <Link href="/help" style={s.footerLink}>
          Help
        </Link>
      </footer>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
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

  navRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },

  badge: {
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
  },

  card: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 22,
    boxShadow: "var(--shadow-md)",
    padding: 18,
  },

  tabs: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 8,
    background: "var(--tab-bg)",
    border: "1px solid var(--border)",
    padding: 5,
    borderRadius: 16,
    marginBottom: 22,
  },

  tab: {
    border: "none",
    background: "transparent",
    color: "var(--muted)",
    borderRadius: 12,
    padding: "11px 12px",
    fontWeight: 700,
    cursor: "pointer",
  },

  activeTab: {
    border: "none",
    background: "var(--surface)",
    color: "var(--primary)",
    borderRadius: 12,
    padding: "11px 12px",
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "var(--shadow-sm)",
  },

  content: {
    display: "flex",
    flexDirection: "column",
    gap: 26,
  },

  floatingSection: {
    position: "relative",
    marginTop: 16,
    marginBottom: 8,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    borderRadius: 18,
    boxShadow: "var(--shadow-sm)",
    padding: "36px 18px 18px",
  },

  floatingSectionTitle: {
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

  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },

  sectionTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 800,
    color: "var(--text)",
  },

  sectionSubtitle: {
    margin: 0,
    fontSize: 13,
    color: "var(--muted)",
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
  },

  classGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 12,
  },

  classCard: {
    border: "1px solid var(--border)",
    background: "var(--surface-soft)",
    borderRadius: 18,
    padding: 16,
  },

  classCardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 14,
  },

  classCode: {
    fontSize: 18,
    fontWeight: 800,
    color: "var(--text)",
  },

  classLab: {
    marginTop: 4,
    fontSize: 13,
    color: "var(--muted)",
  },

  classCancelBtn: {
    border: "1px solid var(--danger-border)",
    background: "var(--danger-soft)",
    color: "var(--danger-text)",
    borderRadius: 999,
    padding: "7px 10px",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
  },

  classMetaGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 8,
  },

  classMetaItem: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: 12,
  },

  classMetaLabel: {
    display: "block",
    fontSize: 11,
    color: "var(--muted)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },

  classMetaValue: {
    fontSize: 14,
    color: "var(--text)",
  },

  resCard: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },

  emptyText: {
    margin: 0,
    fontSize: 15,
    color: "var(--muted)",
  },

  resGroupList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  dayGroupCard: {
    border: "1px solid var(--border)",
    background: "var(--surface-soft)",
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
    fontSize: 16,
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
    background: "var(--surface-soft)",
    borderRadius: 12,
    padding: 12,
  },

  cancelBtn: {
    border: "1px solid var(--danger-border)",
    background: "var(--danger-soft)",
    color: "var(--danger-text)",
    borderRadius: 10,
    padding: "8px 12px",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 800,
  },

  scheduleCard: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },

  filters: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
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
  },

  emptyBox: {
    border: "1px dashed var(--border-strong)",
    background: "var(--surface-soft)",
    color: "var(--muted)",
    borderRadius: 16,
    padding: 18,
    textAlign: "center",
    fontSize: 14,
  },

  previewGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 12,
    marginBottom: 14,
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

  previewMainText: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text)",
  },

  previewSubText: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text)",
  },

  previewDetail: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: 400,
    color: "var(--muted)",
  },

  selectedScheduleHeader: {
    padding: "12px 14px",
    border: "1px solid var(--border)",
    borderRadius: 12,
    background: "var(--surface-2)",
    marginTop: 4,
    marginBottom: 14,
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

  footer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 18,
    padding: "10px 16px",
    marginTop: "auto",
    borderTop: "1px solid var(--border)",
    background: "var(--surface)",
  },

  footerLink: {
    color: "var(--muted)",
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1,
  },

  previewTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    fontSize: 13,
  },

  previewDate: {
    marginTop: 8,
    fontSize: 12,
    color: "var(--muted)",
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

  reservedByMePill: {
    background: "var(--warning-bg)",
    borderColor: "var(--warning-border)",
    color: "var(--warning-text)",
  },

  reservedPill: {
    background: "var(--danger-bg)",
    borderColor: "var(--danger-border)",
    color: "var(--danger-text)",
  },

  occupiedPill: {
    background: "var(--danger-bg)",
    borderColor: "var(--danger-border)",
    color: "var(--danger-text)",
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
};
