"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "../../../utils/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Tab = "classes" | "reservations";
type ScheduleMode = "none" | "dateFirst" | "roomFirst" | "both";

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
  status: "available" | "reserved" | "full" | "occupied" | "reservedByMe";
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

function formatNameFromEmail(email: string) {
  const namePart = email.split("@")[0];

  return namePart
    .split(".")
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export default function InstructorDashboard() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const rooms = ["EEEI 301", "EEEI 305", "EEEI 308"];

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

  const roomCapacity: Record<string, number> = {
    "EEEI 301": 10,
    "EEEI 305": 10,
    "EEEI 308": 16,
  };

  const [activeTab, setActiveTab] = useState<Tab>("classes");
  const [username, setUsername] = useState("Instructor");

  const [lab, setLab] = useState("");
  const [date, setDate] = useState("");

  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("none");
  const [previewAnchorDate, setPreviewAnchorDate] = useState("");
  const [previewAnchorLab, setPreviewAnchorLab] = useState("");

  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [previewSlots, setPreviewSlots] = useState<Record<string, ScheduleSlot[]>>(
    {}
  );
  const [loadingPreviewSlots, setLoadingPreviewSlots] = useState(false);

  const [myReservations, setMyReservations] = useState<InstructorReservation[]>(
    []
  );

  const [expandedReservationDate, setExpandedReservationDate] =
    useState<string | null>(null);

  const [expandedReservationRoom, setExpandedReservationRoom] =
    useState<string | null>(null);

  const [creatingReservation, setCreatingReservation] = useState(false);

  useEffect(() => {
    async function getUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const activeEmail = user?.email || "";

      if (!activeEmail) {
        router.push("/");
        return;
      }

      setUsername(formatNameFromEmail(activeEmail));
    }

    getUser();
  }, [router, supabase]);

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
    setExpandedReservationDate(null);
    setExpandedReservationRoom(null);
  }, [activeTab]);

  useEffect(() => {
    async function fetchPreviews() {
      const nextPreviewSlots: Record<string, ScheduleSlot[]> = {};

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
              const result = await fetchScheduleFor(previewDate, previewAnchorLab);
              nextPreviewSlots[previewKey(previewDate, previewAnchorLab)] =
                result;
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

  async function fetchMyReservations() {
    const res = await fetch("/api/instructor/reservations");
    const data = await res.json();

    if (!res.ok) {
      setMyReservations([]);
      return;
    }

    setMyReservations(Array.isArray(data.current) ? data.current : []);
  }

  function previewKey(selectedDate: string, selectedRoom: string) {
    return `${selectedDate}__${selectedRoom}`;
  }

  function getPreviewDates(startDate: string) {
    return [0, 1, 2].map(days => addDaysToDateString(startDate, days));
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

    const sortedDates = Array.from(dateMap.entries()).sort(
      ([dateA], [dateB]) => dateA.localeCompare(dateB)
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
    const full = display.filter(slot => slot.status === "full").length;
    const occupied = display.filter(slot => slot.status === "occupied").length;

    if (display.length === 0) {
      return {
        label: "No timeslots left",
        detail: "All usable timeslots have passed",
        tone: "muted" as const,
        available,
        reserved,
        full,
        occupied,
      };
    }

    if (available > 0) {
      return {
        label: "Available",
        detail: `${available} open slot${available === 1 ? "" : "s"}`,
        tone: "success" as const,
        available,
        reserved,
        full,
        occupied,
      };
    }

    if (reserved > 0 || full > 0) {
      return {
        label: "Student reservations",
        detail: `${reserved + full} student-used slot${reserved + full === 1 ? "" : "s"
          }`,
        tone: "warning" as const,
        available,
        reserved,
        full,
        occupied,
      };
    }

    return {
      label: "Occupied",
      detail: "Blocked by class or schedule",
      tone: "danger" as const,
      available,
      reserved,
      full,
      occupied,
    };
  }

  async function createInstructorReservation(slot: DisplaySlot) {
    if (!lab || !date) return;

    if (slot.status === "occupied") {
      alert("This slot is occupied by a class or blocked schedule.");
      return;
    }

    if (slot.status === "available") {
      const confirmed = window.confirm(
        `Reserve ${lab} from ${fmt(slot.time_start)} to ${fmt(slot.time_end)}?`
      );

      if (!confirmed) return;
    }

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

  return (
    <div style={s.page}>
      <nav style={s.nav}>
        <Link href="/" style={s.logo}>
          rEEE<span style={{ color: "var(--primary)" }}>serve</span>
        </Link>

        <div style={s.navRight}>
          <span style={s.badge}>Instructor</span>
          <button
            type="button"
            style={s.logout}
            onClick={() => router.push("/")}
          >
            Log out
          </button>
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
              <p style={s.sectionTitle}>My Reservations</p>

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
                              {dayGroup.reservations.length === 1 ? "slot" : "slots"}
                              <span style={s.chevron}>{isDateOpen ? "−" : "+"}</span>
                            </div>
                          </button>

                          {isDateOpen && (
                            <div style={s.roomGroupList}>
                              {dayGroup.rooms.map(roomGroup => {
                                const roomKey = `${dayGroup.scheduleDate}-${roomGroup.roomName}`;
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
                                                onClick={() => cancelInstructorReservation(r.id)}
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

              <p style={s.sectionTitle}>Reserve a lab</p>

              <div style={s.scheduleCard}>
                <div style={s.filters}>
                  <select
                    style={s.select}
                    value={date}
                    onChange={e => {
                      const selectedDate = e.target.value;

                      setDate(selectedDate);

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

                {!lab && !date && (
                  <div style={s.emptyBox}>
                    Select a date to compare all rooms, or select a lab to view
                    the next three available days.
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
                  <div style={s.previewGrid}>
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
                          onClick={() => {
                            setDate(previewDate);
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
                            ...(isSelectedDate ? s.previewCardSelected : {}),
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
                        const isAvailable = slot.status === "available";
                        const isReserved = slot.status === "reserved";
                        const isReservedByMe = slot.status === "reservedByMe";
                        const isFull = slot.status === "full";
                        const isOccupied = slot.status === "occupied";
                        const isClickable = (!isOccupied || isReservedByMe) && !creatingReservation;

                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              if (isReservedByMe) {
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

                              createInstructorReservation(slot);
                            }}
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
                              {isReservedByMe
                                ? "Reserved by you"
                                : isOccupied
                                  ? slot.course_name ?? "Class / blocked"
                                  : isFull
                                    ? "Full — click to override"
                                    : isReserved
                                      ? `${slot.slots_left}/${slot.capacity} slots left`
                                      : `${slot.slots_left}/${slot.capacity} slots left`}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div style={s.legend}>
                      <span style={s.legendItem}>
                        <span
                          style={{
                            ...s.dot,
                            background: "var(--success-border)",
                          }}
                        />
                        Available
                      </span>

                      <span style={s.legendItem}>
                        <span
                          style={{
                            ...s.dot,
                            background: "var(--warning-border)",
                          }}
                        />
                        Student reservation / full / reserved by you
                      </span>

                      <span style={s.legendItem}>
                        <span
                          style={{
                            ...s.dot,
                            background: "var(--danger-border)",
                          }}
                        />
                        Class / blocked
                      </span>
                    </div>
                  </>
                )}
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

const s: { [k: string]: React.CSSProperties } = {
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

  navRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },

  badge: {
    background: "var(--primary-soft)",
    color: "var(--primary)",
    fontSize: 11,
    fontWeight: 500,
    padding: "4px 10px",
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
    padding: 28,
    maxWidth: 980,
    width: "100%",
    boxSizing: "border-box",
  },

  welcome: {
    fontSize: 20,
    fontWeight: 500,
    margin: "0 0 20px",
    color: "var(--text)",
  },

  card: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    overflow: "hidden",
  },

  tabs: {
    display: "flex",
    borderBottom: "1px solid var(--border)",
    background: "var(--surface-2)",
  },

  tab: {
    padding: "12px 18px",
    border: "none",
    borderRight: "1px solid var(--border)",
    background: "var(--surface-2)",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--muted)",
  },

  activeTab: {
    padding: "12px 18px",
    border: "none",
    borderRight: "1px solid var(--border)",
    background: "var(--surface)",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--primary)",
  },

  content: {
    padding: 20,
  },

  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 12,
    flexWrap: "wrap",
  },

  sectionTitle: {
    fontSize: 12,
    fontWeight: 500,
    color: "var(--muted-2)",
    textTransform: "uppercase",
    letterSpacing: 1,
    margin: "0 0 12px",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },

  th: {
    background: "var(--surface-2)",
    padding: "10px 12px",
    textAlign: "left",
    fontWeight: 500,
    color: "var(--muted)",
    fontSize: 12,
    borderBottom: "1px solid var(--border)",
  },

  td: {
    padding: "10px 12px",
    borderBottom: "1px solid var(--border)",
    color: "var(--text-soft)",
  },

  placeholder: {
    marginTop: 14,
    color: "var(--muted)",
    fontSize: 13,
  },

  btn: {
    padding: "8px 14px",
    background: "var(--primary)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  },

  dangerBtn: {
    padding: "5px 10px",
    background: "var(--surface)",
    color: "var(--danger-text)",
    border: "1px solid var(--danger-border-2)",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
  },

  resCard: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 20,
    marginBottom: 28,
  },

  resList: {
    display: "grid",
    gap: 10,
  },

  resItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    border: "1px solid var(--border)",
    borderRadius: 14,
    background: "var(--surface-2)",
    flexWrap: "wrap",
  },

  emptyText: {
    margin: 0,
    fontSize: 15,
    color: "var(--muted)",
  },

  cancelBtn: {
    border: "1px solid var(--danger-border-2)",
    background: "var(--danger-bg-2)",
    color: "var(--danger-text-2)",
    fontSize: 12,
    fontWeight: 500,
    padding: "6px 10px",
    borderRadius: 999,
    cursor: "pointer",
  },

  scheduleCard: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 28,
  },

  filters: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
    padding: "14px 16px",
    borderBottom: "1px solid var(--border)",
  },

  select: {
    padding: "9px 12px",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    fontSize: 13,
    background: "var(--select-bg)",
    color: "var(--text)",
    width: "100%",
    minWidth: 0,
  },

  emptyBox: {
    textAlign: "center",
    padding: 18,
    color: "var(--muted-3)",
    fontSize: 13,
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--surface-2)",
    margin: 16,
  },

  previewGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 12,
    padding: 16,
  },

  previewCard: {
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: 14,
    background: "var(--surface-2)",
    color: "var(--text)",
    textAlign: "left",
    cursor: "pointer",
    minHeight: 112,
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
  },

  previewCardSelected: {
    outline: "2px solid var(--primary)",
    outlineOffset: 2,
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
    fontWeight: 700,
    padding: "4px 8px",
    borderRadius: 999,
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    whiteSpace: "nowrap",
  },

  panelMainText: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text)",
  },

  panelSubtext: {
    marginTop: 4,
    fontSize: 12,
    color: "var(--muted)",
  },

  selectedScheduleHeader: {
    margin: "4px 16px 0",
    padding: "12px 14px",
    border: "1px solid var(--border)",
    borderRadius: 12,
    background: "var(--surface-2)",
  },

  slotGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 8,
    padding: 16,
  },

  slotPill: {
    position: "relative",
    border: "1px solid",
    borderRadius: 14,
    padding: "8px 10px",
    fontSize: 12,
    fontWeight: 500,
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

  reservedPill: {
    background: "var(--warning-bg)",
    borderColor: "var(--warning-border)",
    color: "var(--warning-text)",
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
    fontWeight: 600,
    lineHeight: 1.1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  legend: {
    display: "flex",
    gap: 14,
    padding: "0 16px 14px",
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

  groupSubtext: {
    marginTop: 3,
    fontSize: 12,
    color: "var(--muted)",
  },

  footer: {
    padding: "14px 28px",
    borderTop: "1px solid var(--border)",
    background: "var(--surface)",
    display: "flex",
    gap: 20,
    marginTop: "auto",
  },

  footerLink: {
    fontSize: 13,
    color: "var(--muted)",
    textDecoration: "none",
  },

  reservedByMePill: {
    background: "var(--warning-bg)",
    borderColor: "var(--warning-border)",
    color: "var(--warning-text)",
  },

  resGroupList: {
    display: "grid",
    gap: 10,
    width: "100%",
  },

  dayGroupCard: {
    border: "1px solid var(--border)",
    borderRadius: 12,
    background: "var(--surface-2)",
    overflow: "hidden",
  },

  dayGroupButton: {
    width: "100%",
    border: "none",
    background: "transparent",
    color: "var(--text)",
    padding: "14px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    cursor: "pointer",
    textAlign: "left",
  },

  roomGroupList: {
    display: "grid",
    gap: 8,
    padding: "0 12px 12px",
  },

  roomGroupCard: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--surface)",
    overflow: "hidden",
  },

  roomGroupButton: {
    width: "100%",
    border: "none",
    background: "transparent",
    color: "var(--text)",
    padding: "12px 14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    cursor: "pointer",
    textAlign: "left",
  },

  timeslotList: {
    display: "grid",
    gap: 8,
    padding: "0 12px 12px",
  },

  timeslotRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 12px",
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--surface-2)",
    color: "var(--text)",
    flexWrap: "wrap",
  },

  groupRightText: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    color: "var(--muted)",
    whiteSpace: "nowrap",
  },

  chevron: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 22,
    height: 22,
    borderRadius: 999,
    background: "var(--surface)",
    border: "1px solid var(--border-strong)",
    color: "var(--primary)",
    fontSize: 16,
    fontWeight: 700,
  },

  sectionSubtitle: {
    margin: "4px 0 0",
    fontSize: 13,
    color: "var(--muted)",
  },

  classGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
    gap: 14,
    marginTop: 16,
  },

  classCard: {
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 16,
    background: "var(--surface-2)",
    boxShadow: "0 8px 20px rgba(0,0,0,0.04)",
  },

  classCardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },

  classCode: {
    fontSize: 17,
    fontWeight: 700,
    color: "var(--text)",
  },

  classLab: {
    marginTop: 4,
    fontSize: 13,
    color: "var(--muted)",
  },

  classMetaGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 10,
  },

  classMetaItem: {
    padding: "10px 12px",
    borderRadius: 12,
    background: "var(--surface)",
    border: "1px solid var(--border)",
  },

  classMetaLabel: {
    display: "block",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "var(--muted-2)",
    marginBottom: 4,
  },

  classMetaValue: {
    display: "block",
    fontSize: 13,
    color: "var(--text)",
  },

  classCancelBtn: {
    padding: "6px 10px",
    background: "var(--surface)",
    color: "var(--danger-text)",
    border: "1px solid var(--danger-border-2)",
    borderRadius: 999,
    fontSize: 12,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
};
