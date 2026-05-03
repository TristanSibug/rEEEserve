"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Tab = "classes" | "reservations";

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
  status: "available" | "reserved" | "full" | "occupied";
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

export default function InstructorDashboard() {
  const router = useRouter();

  const rooms = ["EEEI 301", "EEEI 305", "EEEI 308"];

  const [activeTab, setActiveTab] = useState<Tab>("classes");
  const [username, setUsername] = useState("Instructor");

  const [lab, setLab] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [myReservations, setMyReservations] = useState<
    InstructorReservation[]
  >([]);
  const [creatingReservation, setCreatingReservation] = useState(false);

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

  async function fetchMyReservations() {
    const res = await fetch("/api/instructor/reservations");
    const data = await res.json();

    if (!res.ok) {
      setMyReservations([]);
      return;
    }

    setMyReservations(Array.isArray(data.current) ? data.current : []);
  }

  function fmt(t: string) {
    const [h, m] = t.split(":").map(Number);
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;

    return `${hour}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
  }

  function timeToMinutes(t: string) {
    const [h, m] = t.split(":").map(Number);
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

    return timeToMinutes(slotStart) >= nowMinutes + 30;
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

  function getDisplaySlots(): DisplaySlot[] {
    const displaySlots: DisplaySlot[] = [];

    const labStart = 8 * 60 + 30;
    const labEnd = 16 * 60;
    const interval = 30;

    const defaultCapacity = lab === "EEEI 308" ? 16 : 10;

    const capacity =
      slots.find(slot => typeof slot.capacity === "number")?.capacity ??
      defaultCapacity;

    for (let current = labStart; current < labEnd; current += interval) {
      const time_start = minutesToTime(current);
      const time_end = minutesToTime(current + interval);

      if (!isSlotAllowedForDate(date, time_start)) {
        continue;
      }

      const blockingSlot = slots.find(
        slot =>
          slot.source !== "reservation" &&
          overlaps(time_start, time_end, slot.time_start, slot.time_end)
      );

      const reservationCount = slots.filter(
        slot =>
          slot.source === "reservation" &&
          overlaps(time_start, time_end, slot.time_start, slot.time_end)
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
      });
    }

    return displaySlots;
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
      headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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
        `Instructor reservation created. ${secondData.cancelledStudentReservations ?? 0} student booking(s) were cancelled and notified.`
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

  return (
    <div style={s.page}>
      <nav style={s.nav}>
        <a href="/" style={s.logo}>
          rEEE<span style={{ color: "#185FA5" }}>serve</span>
        </a>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={s.badge}>Instructor</span>
          <button style={s.logout} onClick={() => router.push("/")}>
            Log out
          </button>
        </div>
      </nav>

      <main style={s.body}>
        <h1 style={s.welcome}>
          Welcome, <span style={{ color: "#185FA5" }}>{username}</span>!
        </h1>

        <div style={s.card}>
          <div style={s.tabs}>
            <button
              style={activeTab === "classes" ? s.activeTab : s.tab}
              onClick={() => setActiveTab("classes")}
            >
              My Classes
            </button>

            <button
              style={activeTab === "reservations" ? s.activeTab : s.tab}
              onClick={() => setActiveTab("reservations")}
            >
              Reservations
            </button>
          </div>

          <div style={s.content}>
            {activeTab === "classes" && (
              <>
                <div style={s.sectionHeader}>
                  <p style={s.sectionTitle}>My Classes</p>
                  <button style={s.btn}>Edit Classes</button>
                </div>

                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Name</th>
                      <th style={s.th}>Lab</th>
                      <th style={s.th}>Day</th>
                      <th style={s.th}>Timeslot</th>
                      <th style={s.th}>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    <tr>
                      <td style={s.td}>EEE 196</td>
                      <td style={s.td}>Rm 308</td>
                      <td style={s.td}>F</td>
                      <td style={s.td}>11:30 AM – 2:30 PM</td>
                      <td style={s.td}>
                        <button style={s.dangerBtn}>Cancel</button>
                      </td>
                    </tr>

                    <tr>
                      <td colSpan={5} style={s.empty}>
                        placeholder
                      </td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}

            {activeTab === "reservations" && (
              <>
                <div style={s.sectionHeader}>
                  <p style={s.sectionTitle}>My Reservations</p>
                </div>

                <div style={s.resCard}>
                  {myReservations.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 15, color: "#888" }}>
                      No instructor reservations
                    </p>
                  ) : (
                    <div style={{ display: "grid", gap: 8, width: "100%" }}>
                      {myReservations.map(r => (
                        <div key={r.id} style={s.resItem}>
                          <div>
                            <strong>{r.room_name}</strong>
                            <div style={{ fontSize: 12, color: "#888" }}>
                              {r.schedule_date} • {fmt(r.time_start)} –{" "}
                              {fmt(r.time_end)}
                            </div>
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

                <p style={{ ...s.sectionTitle, marginTop: 24 }}>
                  Reserve a lab
                </p>

                <div style={s.scheduleCard}>
                  <div style={s.filters}>
                    <select
                      style={s.select}
                      value={lab}
                      onChange={e => {
                        const selectedLab = e.target.value;
                        setLab(selectedLab);

                        if (selectedLab) {
                          setDate(getDefaultScheduleDate());
                        } else {
                          setDate("");
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

                    <select
                      style={s.select}
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      disabled={!lab}
                    >
                      <option value="">Date: select one</option>
                      {getDateOptions().map(({ val, label }) => (
                        <option key={val} value={val}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(!lab || !date) && (
                    <div style={s.emptyBox}>
                      Select a lab and date to view the schedule
                    </div>
                  )}

                  {lab && date && loadingSlots && (
                    <div style={s.emptyBox}>Loading...</div>
                  )}

                  {lab && date && !loadingSlots && (
                    <>
                      <div style={s.slotGrid}>
                        <div style={s.slotSpacer} />

                        {displaySlots.map(slot => {
                          const key = `${slot.time_start}-${slot.time_end}`;

                          const isAvailable = slot.status === "available";
                          const isReserved = slot.status === "reserved";
                          const isFull = slot.status === "full";
                          const isOccupied = slot.status === "occupied";

                          const isClickable = !isOccupied && !creatingReservation;

                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => createInstructorReservation(slot)}
                              disabled={!isClickable}
                              style={{
                                ...s.slotPill,
                                ...(isAvailable
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
                                {isOccupied
                                  ? slot.course_name ??
                                  "Class / blocked / instructor reservation"
                                  : isFull
                                    ? "Full"
                                    : `${slot.slots_left}/${slot.capacity} slots left`}
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
                          <span style={{ ...s.dot, background: "#F5B45B" }} />
                          Student reservation / full
                        </span>

                        <span style={s.legendItem}>
                          <span style={{ ...s.dot, background: "#E24B4A" }} />
                          Class / blocked
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </main>

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
    background: "#f5f5f5",
    fontFamily: "sans-serif",
  },
  nav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 28px",
    borderBottom: "1px solid #eee",
    background: "#fff",
  },
  logo: {
    fontSize: 22,
    fontWeight: 700,
    textDecoration: "none",
    color: "#111",
  },
  badge: {
    background: "#E6F1FB",
    color: "#185FA5",
    fontSize: 11,
    fontWeight: 500,
    padding: "4px 10px",
    borderRadius: 99,
  },
  logout: {
    fontSize: 12,
    color: "#888",
    background: "none",
    border: "1px solid #ddd",
    padding: "4px 10px",
    borderRadius: 6,
    cursor: "pointer",
  },
  body: {
    flex: 1,
    padding: 28,
    maxWidth: 720,
    width: "100%",
    boxSizing: "border-box",
  },
  welcome: {
    fontSize: 20,
    fontWeight: 500,
    margin: "0 0 20px",
  },
  card: {
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 12,
    overflow: "hidden",
  },
  tabs: {
    display: "flex",
    borderBottom: "1px solid #eee",
    background: "#fafafa",
  },
  tab: {
    padding: "12px 18px",
    border: "none",
    borderRight: "1px solid #eee",
    background: "#fafafa",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    color: "#777",
  },
  activeTab: {
    padding: "12px 18px",
    border: "none",
    borderRight: "1px solid #eee",
    background: "#fff",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    color: "#185FA5",
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
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: 1,
    margin: "0 0 12px",
  },
  filters: {
    display: "flex",
    gap: 10,
    padding: "14px 16px",
    borderBottom: "1px solid #eee",
    flexWrap: "wrap",
  },
  select: {
    padding: "8px 12px",
    border: "1px solid #ddd",
    borderRadius: 8,
    fontSize: 13,
    background: "#fafafa",
    minWidth: 160,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },
  th: {
    background: "#f9f9f9",
    padding: "10px 12px",
    textAlign: "left",
    fontWeight: 500,
    color: "#888",
    fontSize: 12,
    borderBottom: "1px solid #eee",
  },
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid #eee",
  },
  empty: {
    textAlign: "center",
    padding: 24,
    color: "#aaa",
    fontSize: 13,
  },
  emptyBox: {
    textAlign: "center",
    padding: 18,
    color: "#aaa",
    fontSize: 13,
    border: "1px solid #eee",
    borderRadius: 10,
    background: "#fafafa",
    margin: 16,
  },
  btn: {
    padding: "8px 14px",
    background: "#185FA5",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  },
  dangerBtn: {
    padding: "5px 10px",
    background: "#fff",
    color: "#A32D2D",
    border: "1px solid #F3C6C6",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
  },
  slotGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 8,
    padding: 16,
  },
  availablePill: {
    background: "#F7FBF2",
    borderColor: "#97C459",
    color: "#3B6D11",
  },
  reservedPill: {
    background: "#FFF8EF",
    borderColor: "#F5B45B",
    color: "#A85B00",
  },
  occupiedPill: {
    background: "#FFF7F7",
    borderColor: "#E24B4A",
    color: "#A32D2D",
  },
  legend: {
    display: "flex",
    gap: 14,
    padding: "0 16px 14px",
    fontSize: 11,
    color: "#888",
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
    padding: "14px 28px",
    borderTop: "1px solid #eee",
    background: "#fff",
    display: "flex",
    gap: 20,
    marginTop: "auto",
  },
  footerLink: {
    fontSize: 13,
    color: "#888",
    textDecoration: "none",
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
  resCard: {
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 12,
    padding: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
    gap: 16,
    flexWrap: "wrap",
  },
  resItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    border: "1px solid #eee",
    borderRadius: 14,
    background: "#fff",
  },
  scheduleCard: {
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 28,
  },
  slotSpacer: {
    visibility: "hidden",
  },
  cancelBtn: {
    padding: "6px 10px",
    background: "#fff",
    color: "#A32D2D",
    border: "1px solid #F3C6C6",
    borderRadius: 8,
    fontSize: 12,
    cursor: "pointer",
  },
};
