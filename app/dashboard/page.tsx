"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";

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
  status: "available" | "occupied" | "full" | "selected";
  course_name?: string | null;
  capacity: number;
  reserved_count: number;
  slots_left: number;
};

type ReservationTab = "current" | "past";

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
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [submittingCart, setSubmittingCart] = useState(false);

  const [reservationTab, setReservationTab] =
    useState<ReservationTab>("current");

  const [allReservations, setAllReservations] = useState<Reservation[]>([]);

  const [email, setEmail] = useState("");
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    async function getUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/");
        return;
      }

      setEmail(user.email ?? "");
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

  function isSlotAllowedForDate(selectedDate: string, slotStart: string) {
    const { today, nowMinutes } = getManilaDateTime();

    if (selectedDate < today) return false;
    if (selectedDate > today) return true;

    return timeToMinutes(slotStart) >= nowMinutes + 30;
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

  function getDisplaySlots(): DisplaySlot[] {
    const displaySlots: DisplaySlot[] = [];

    const labStart = 8 * 60 + 30;
    const labEnd = 16 * 60;
    const interval = 30;
    const capacity = roomCapacity[lab] ?? 10;

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

      const selectedCount = cart.filter(item =>
        overlaps(time_start, time_end, item.time_start, item.time_end)
      ).length;

      const selected = cart.some(
        item => item.time_start === time_start && item.time_end === time_end
      );

      const slotsLeft = capacity - reservationCount - selectedCount;

      displaySlots.push({
        time_start,
        time_end,
        status: selected
          ? "selected"
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
        background: "#FDECEC",
        color: "#A32D2D",
        border: "1px solid #E24B4A",
        borderRadius: 999,
        padding: "5px 9px",
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: "nowrap",
      };
    }

    return {};
  }

  const currentReservations = getCurrentReservations();
  const pastReservations = getPastReservations();
  const visibleReservations =
    reservationTab === "current" ? currentReservations : pastReservations;

  const displaySlots = lab && date ? getDisplaySlots() : [];

  if (loadingUser) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f5f5",
        }}
      >
        <p style={{ color: "#aaa", fontSize: 14 }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <nav style={s.nav}>
        <a href="/" style={s.logo}>
          rEEE<span style={{ color: "#185FA5" }}>serve</span>
        </a>
        <span style={s.sn}>{email}</span>
      </nav>

      <div style={s.body}>
        <p style={s.welcome}>
          Welcome,{" "}
          <span style={{ color: "#185FA5" }}>
            {formatNameFromEmail(email)}
          </span>
          !
        </p>

        <div style={s.resHeaderRow}>
          <p style={s.sectionTitle}>Reservations</p>

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
          {visibleReservations.length === 0 ? (
            <p style={{ margin: 0, fontSize: 15, color: "#888" }}>
              {reservationTab === "current"
                ? "No current reservations"
                : "No past reservations"}
            </p>
          ) : (
            <div style={{ display: "grid", gap: 8, width: "100%" }}>
              {visibleReservations.map(r => {
                const cancellationLabel = pastReservationLabel(r.status);

                return (
                  <div
                    key={r.id}
                    style={{
                      ...s.resItem,
                      ...(reservationTab === "past" ? s.pastResItem : {}),
                    }}
                  >
                    <div>
                      <strong>{r.room_name}</strong>
                      <div
                        style={{
                          fontSize: 12,
                          color: reservationTab === "past" ? "#aaa" : "#888",
                        }}
                      >
                        {r.reserved_date} • {fmt(r.time_start)} –{" "}
                        {fmt(r.time_end)}
                      </div>
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

                    {reservationTab === "past" && cancellationLabel && (
                      <span style={pastReservationPillStyle(r.status)}>
                        {cancellationLabel}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p style={s.sectionTitle}>Lab schedules</p>

        <div style={s.scheduleCard}>
          <div style={s.filters}>
            <select
              style={s.select}
              value={lab}
              onChange={e => {
                const selectedLab = e.target.value;
                setLab(selectedLab);
                setCart([]);

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

          {lab && date && loadingSlots && <div style={s.emptyBox}>Loading...</div>}

          {lab && date && !loadingSlots && displaySlots.length === 0 && (
            <div style={s.emptyBox}>
              No available timeslots left for this date
            </div>
          )}

          {lab && date && !loadingSlots && displaySlots.length > 0 && (
            <>
              <div style={s.slotGrid}>
                <div style={s.slotSpacer} />

                {displaySlots.map(slot => {
                  const key = `${slot.time_start}-${slot.time_end}`;

                  const hasCourse =
                    slot.status === "occupied" && slot.course_name;
                  const isAvailable = slot.status === "available";
                  const isSelected = slot.status === "selected";
                  const isFull = slot.status === "full";
                  const isClickable = isAvailable || isSelected;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleCartSlot(slot)}
                      style={{
                        ...s.slotPill,
                        ...(isSelected
                          ? s.selectedPill
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
                  <span style={{ ...s.dot, background: "#97C459" }} />
                  Available
                </span>

                <span style={s.legendItem}>
                  <span style={{ ...s.dot, background: "#E24B4A" }} />
                  Occupied
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
    background: "#f5f5f5",
    fontFamily: "sans-serif",
  },
  nav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 28px",
    borderBottom: "1px solid #eee",
    background: "#fff",
  },
  logo: {
    fontSize: 20,
    fontWeight: 700,
    textDecoration: "none",
    color: "#111",
  },
  sn: {
    fontSize: 13,
    color: "#888",
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
  sectionTitle: {
    fontSize: 12,
    fontWeight: 500,
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: 1,
    margin: "0 0 10px",
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
  btn: {
    padding: "9px 18px",
    background: "#185FA5",
    color: "#fff",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    textDecoration: "none",
    whiteSpace: "nowrap",
    border: "none",
    cursor: "pointer",
  },
  scheduleCard: {
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 28,
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
  slotGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
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
    background: "#F7FBF2",
    borderColor: "#97C459",
    color: "#3B6D11",
  },
  occupiedPill: {
    background: "#FFF7F7",
    borderColor: "#E24B4A",
    color: "#A32D2D",
  },
  selectedPill: {
    background: "#E6F1FB",
    borderColor: "#185FA5",
    color: "#185FA5",
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
    color: "#888",
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
  resItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 12px",
    border: "1px solid #eee",
    borderRadius: 10,
    background: "#fafafa",
  },
  cartBox: {
    margin: "12px 16px",
    padding: 12,
    border: "1px solid #BFD7F0",
    borderRadius: 10,
    background: "#F5FAFF",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  slotSpacer: {
    visibility: "hidden",
  },
  resHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  tabGroup: {
    display: "flex",
    gap: 6,
    background: "#F2F4F7",
    padding: 4,
    borderRadius: 999,
  },
  tabButton: {
    border: "none",
    background: "transparent",
    color: "#666",
    fontSize: 13,
    fontWeight: 500,
    padding: "7px 14px",
    borderRadius: 999,
    cursor: "pointer",
  },
  activeTabButton: {
    background: "#FFFFFF",
    color: "#185FA5",
    boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
  },
  cancelBtn: {
    border: "1px solid #F2B8B5",
    background: "#FFF5F5",
    color: "#B42318",
    fontSize: 12,
    fontWeight: 500,
    padding: "6px 10px",
    borderRadius: 999,
    cursor: "pointer",
  },
  pastResItem: {
    background: "#f7f7f7",
    borderColor: "#e0e0e0",
    color: "#777",
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
};
