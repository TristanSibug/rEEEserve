"use client";

import { CSSProperties, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ThemeToggle from "../../components/ThemeToggle";
import Link from "next/link";

type ScanState =
  | "loading"
  | "success"
  | "no_reservation"
  | "walk_in_start_choice"
  | "walk_in_loading"
  | "walk_in_options"
  | "walk_in_success"
  | "error";

type WalkInStartMode = "current" | "next";

type WalkInOption = {
  slots: number;
  minutes: number;
  label: string;
};

type RoomAvailability = {
  room_name: string;
  continuous_slots: number;
  continuous_minutes: number;
};

type WalkInAvailability = {
  available: boolean;
  message?: string;
  date: string;
  start_time: string | null;
  max_slots: number;
  max_minutes: number;
  max_label: string;
  selectable_slots?: number;
  selectable_minutes?: number;
  selectable_label?: string;
  remaining_daily_minutes?: number;
  options: WalkInOption[];
  rooms: RoomAvailability[];
  can_ask_current_slot?: boolean;
  auto_used_next_slot?: boolean;
};

type WalkInResult = {
  ok: boolean;
  message: string;
  room_name: string;
  reserved_date: string;
  time_start: string;
  time_end: string;
  duration_minutes: number;
  duration_label: string;
};

function fmt(time?: string | null) {
  if (!time) return "—";

  const [h, m] = time.slice(0, 5).split(":").map(Number);
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  const suffix = h >= 12 ? "PM" : "AM";

  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

function formatDate(date: string) {
  if (!date) return "—";

  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(year, month - 1, day);

  return value.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes} mins`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }

  return `${hours} hr ${remainingMinutes} mins`;
}

function StudentQrScanContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const token = searchParams.get("token") ?? "";

  const [state, setState] = useState<ScanState>("loading");
  const [message, setMessage] = useState("");
  const [scanResult, setScanResult] = useState<any>(null);
  const [availability, setAvailability] = useState<WalkInAvailability | null>(
    null
  );
  const [walkInResult, setWalkInResult] = useState<WalkInResult | null>(null);
  const [creatingSlots, setCreatingSlots] = useState<number | null>(null);
  const [selectedWalkInSlots, setSelectedWalkInSlots] = useState<number | null>(
    null
  );

  const [walkInStartMode, setWalkInStartMode] =
    useState<WalkInStartMode>("next");

  useEffect(() => {
    runQrScan();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function runQrScan() {
    if (!token) {
      setState("error");
      setMessage("Missing QR token.");
      return;
    }

    setState("loading");
    setMessage("");

    try {
      const res = await fetch("/api/attendance/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();

      if (res.ok) {
        setScanResult(data);
        setState("success");
        setMessage(data.message ?? "Attendance confirmed.");
        return;
      }

      const errorText = String(data.error ?? data.message ?? "").toLowerCase();

      const noReservation =
        res.status === 404 ||
        data.code === "NO_RESERVATION" ||
        errorText.includes("no reservation") ||
        errorText.includes("active reservation") ||
        errorText.includes("check-in opens");

      if (noReservation) {
        setScanResult(data);
        setState("no_reservation");
        setMessage(
          data.error ??
          data.message ??
          "You do not have an active reservation for this QR scan."
        );
        return;
      }

      setState("error");
      setMessage(data.error ?? data.message ?? "Failed to scan QR.");
    } catch {
      setState("error");
      setMessage("Something went wrong while scanning the QR.");
    }
  }

  async function loadWalkInAvailability(mode: WalkInStartMode = walkInStartMode) {
    setState("walk_in_loading");
    setMessage("");

    try {
      const res = await fetch(`/api/student/walk-in/availability?mode=${mode}`, {
        method: "GET",
      });

      const data = await res.json();

      if (!res.ok) {
        setState("no_reservation");
        setMessage(data.error ?? "Failed to check walk-in availability.");
        return;
      }

      setAvailability(data);
      setSelectedWalkInSlots(null);

      if (!data.available || data.options.length === 0) {
        setState("error");
        setMessage(data.message ?? "No walk-in slots are available right now.");
        return;
      }

      setState("walk_in_options");
    } catch {
      setState("no_reservation");
      setMessage("Failed to check walk-in availability.");
    }
  }

  async function checkWalkInStartChoice() {
    setState("walk_in_loading");
    setMessage("");

    try {
      const res = await fetch("/api/student/walk-in/availability", {
        method: "GET",
      });

      const data = await res.json();

      if (!res.ok) {
        setState("no_reservation");
        setMessage(data.error ?? "Failed to check walk-in availability.");
        return;
      }

      if (data.can_ask_current_slot) {
        setAvailability(data);
        setState("walk_in_start_choice");
        return;
      }

      setWalkInStartMode("next");
      setAvailability(data);

      if (!data.available || data.options.length === 0) {
        setState("error");
        setMessage(data.message ?? "No walk-in slots are available right now.");
        return;
      }

      setState("walk_in_options");
    } catch {
      setState("no_reservation");
      setMessage("Failed to check walk-in availability.");
    }
  }

  async function createWalkIn(slots: number, roomName: string) {
    setCreatingSlots(slots);
    setMessage("");

    try {
      const res = await fetch("/api/student/walk-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slots,
          room_name: roomName,
          mode: walkInStartMode,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMessage =
          data.error ?? data.message ?? "Failed to create walk-in reservation.";

        const alreadyHasReservation =
          errorMessage.toLowerCase().includes("already have") ||
          errorMessage.toLowerCase().includes("overlap") ||
          errorMessage.toLowerCase().includes("same timeslot") ||
          errorMessage.toLowerCase().includes("during this time");

        if (alreadyHasReservation) {
          setState("no_reservation");
          setMessage(
            "You already have a reservation during this time. Please go to your dashboard instead."
          );
          setSelectedWalkInSlots(null);
          setAvailability(null);
          return;
        }

        setMessage(errorMessage);
        await loadWalkInAvailability();
        return;
      }

      setWalkInResult(data);
      setState("walk_in_success");
      setMessage("Walk-in reservation created.");
    } catch {
      setMessage("Something went wrong while creating your walk-in reservation.");
    } finally {
      setCreatingSlots(null);
    }
  }

  return (
    <div style={s.page}>
      <nav style={s.nav}>
        <Link href="/" style={s.logo}>
          rEEE<span style={s.logoBlue}>serve</span>
        </Link>
        <div style={s.navRight}>
          <ThemeToggle />

          <button type="button" style={s.navBtn} onClick={() => router.push("/dashboard")}>
            Dashboard
          </button>
        </div>
      </nav>

      <main style={s.main}>
        <section style={s.card}>
          {state === "loading" && (
            <>
              <div style={s.statusIcon}>⌛</div>
              <h1 style={s.title}>Checking QR scan</h1>
              <p style={s.text}>Please wait while we verify your reservation.</p>
            </>
          )}

          {state === "success" && (
            <>
              <div style={{ ...s.statusIcon, ...s.successIcon }}>✓</div>
              <h1 style={s.title}>Attendance confirmed</h1>
              <p style={s.text}>{message}</p>

              {scanResult?.reservation && (
                <div style={s.infoBox}>
                  <div style={s.infoRow}>
                    <span style={s.infoLabel}>Lab</span>
                    <strong>{scanResult.reservation.room_name ?? "—"}</strong>
                  </div>

                  <div style={s.infoRow}>
                    <span style={s.infoLabel}>Date</span>
                    <strong>
                      {formatDate(scanResult.reservation.reserved_date ?? "")}
                    </strong>
                  </div>

                  <div style={s.infoRow}>
                    <span style={s.infoLabel}>Time</span>
                    <strong>
                      {fmt(scanResult.reservation.time_start)} –{" "}
                      {fmt(scanResult.reservation.time_end)}
                    </strong>
                  </div>
                </div>
              )}

              <button type="button" style={s.btn} onClick={() => router.push("/dashboard")}>
                Back to dashboard
              </button>
            </>
          )}

          {state === "no_reservation" && (
            <>
              <div style={{ ...s.statusIcon, ...s.warningIcon }}>!</div>

              <h1 style={s.title}>No active reservation</h1>

              <p style={s.text}>
                You may check if a walk-in reservation is available right now.
              </p>

              {message &&
                !message.toLowerCase().includes("active reservation") &&
                !message.toLowerCase().includes("no reservation") && (
                  <p style={s.errorText}>{message}</p>
                )}

              <div style={s.actions}>
                <button
                  type="button"
                  style={s.btnOutline}
                  onClick={() => router.push("/dashboard")}
                >
                  Go back
                </button>

                <button type="button" style={s.btn} onClick={checkWalkInStartChoice}>
                  Check walk-in
                </button>
              </div>
            </>
          )}

          {state === "walk_in_start_choice" && (
            <>
              <div style={{ ...s.statusIcon, ...s.walkInIcon }}>↳</div>

              <h1 style={s.title}>Choose walk-in start</h1>

              <p style={s.text}>
                There is still enough time left in the current timeslot. Do you want to start now or use the next timeslot instead?
              </p>

              <div style={s.actions}>
                <button
                  type="button"
                  style={s.btnOutline}
                  onClick={() => {
                    setWalkInStartMode("current");
                    loadWalkInAvailability("current");
                  }}
                >
                  Start now
                </button>

                <button
                  type="button"
                  style={s.btn}
                  onClick={() => {
                    setWalkInStartMode("next");
                    loadWalkInAvailability("next");
                  }}
                >
                  Next timeslot
                </button>
              </div>

              <button
                type="button"
                style={{ ...s.btnOutline, marginTop: 12 }}
                onClick={() => setState("no_reservation")}
              >
                Back
              </button>
            </>
          )}

          {state === "walk_in_loading" && (
            <>
              <div style={s.statusIcon}>⌛</div>

              <h1 style={s.title}>Checking walk-in availability</h1>

              <p style={s.text}>
                Please wait while we check if there is an available lab timeslot right now.
              </p>
            </>
          )}

          {state === "walk_in_options" && availability && (
            <>
              <div style={{ ...s.statusIcon, ...s.walkInIcon }}>↳</div>
              <h1 style={s.title}>Walk-in reservation</h1>

              <p style={s.text}>
                Starting time: <strong>{fmt(availability.start_time)}</strong>
              </p>

              <div style={s.infoBox}>
                <div style={s.infoRow}>
                  <span style={s.infoLabel}>Maximum stay</span>
                  <strong>{availability.max_label}</strong>
                </div>

                <div style={s.infoRow}>
                  <span style={s.infoLabel}>Date</span>
                  <strong>{formatDate(availability.date)}</strong>
                </div>
              </div>

              {availability.remaining_daily_minutes !== undefined &&
                availability.remaining_daily_minutes < availability.max_minutes && (
                  <p style={s.text}>
                    Your selectable duration is limited to{" "}
                    <strong>
                      {availability.selectable_label ??
                        `${availability.remaining_daily_minutes} mins`}
                    </strong>{" "}
                    because of the 3-hour daily reservation limit.
                  </p>
                )}

              <p style={s.sectionLabel}>How long do you want to stay?</p>

              <div style={s.durationGrid}>
                {availability.options.map(option => {
                  const isSelected = selectedWalkInSlots === option.slots;

                  return (
                    <button
                      key={option.slots}
                      type="button"
                      style={{
                        ...s.durationBtn,
                        ...(isSelected ? s.selectedDurationBtn : {}),
                      }}
                      disabled={creatingSlots !== null}
                      onClick={() => {
                        setSelectedWalkInSlots(option.slots);
                        setMessage("");
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {selectedWalkInSlots !== null && (
                <>
                  <p style={s.sectionLabel}>Choose a lab</p>

                  <div style={s.roomGrid}>
                    {availability.rooms
                      .filter(room => room.continuous_slots >= selectedWalkInSlots)
                      .map(room => (
                        <button
                          key={room.room_name}
                          type="button"
                          style={s.roomBtn}
                          disabled={creatingSlots !== null}
                          onClick={() => createWalkIn(selectedWalkInSlots, room.room_name)}
                        >
                          <strong>{room.room_name}</strong>
                          <span style={s.roomSub}>
                            {formatDuration(room.continuous_minutes)} available
                          </span>
                        </button>
                      ))}
                  </div>

                  {availability.rooms.filter(
                    room => room.continuous_slots >= selectedWalkInSlots
                  ).length === 0 && (
                      <p style={s.errorText}>
                        No lab can support that duration right now. Please choose a shorter
                        duration.
                      </p>
                    )}
                </>
              )}

              {creatingSlots !== null && (
                <p style={s.text}>Creating your walk-in reservation...</p>
              )}

              {message && <p style={s.errorText}>{message}</p>}

              <button
                type="button"
                style={{ ...s.btnOutline, marginTop: 16 }}
                onClick={() => {
                  setSelectedWalkInSlots(null);
                  setState("no_reservation");
                }}
              >
                Cancel walk-in
              </button>
            </>
          )}

          {state === "walk_in_success" && walkInResult && (
            <>
              <div style={{ ...s.statusIcon, ...s.successIcon }}>✓</div>
              <h1 style={s.title}>Walk-in confirmed</h1>

              <p style={s.text}>
                Your walk-in reservation has been created successfully.
              </p>

              <div style={s.infoBox}>
                <div style={s.infoRow}>
                  <span style={s.infoLabel}>Lab</span>
                  <strong>{walkInResult.room_name}</strong>
                </div>

                <div style={s.infoRow}>
                  <span style={s.infoLabel}>Date</span>
                  <strong>{formatDate(walkInResult.reserved_date)}</strong>
                </div>

                <div style={s.infoRow}>
                  <span style={s.infoLabel}>Time</span>
                  <strong>
                    {fmt(walkInResult.time_start)} – {fmt(walkInResult.time_end)}
                  </strong>
                </div>

                <div style={s.infoRow}>
                  <span style={s.infoLabel}>Duration</span>
                  <strong>{walkInResult.duration_label}</strong>
                </div>
              </div>

              <button type="button" style={s.btn} onClick={() => router.push("/dashboard")}>
                Back to dashboard
              </button>
            </>
          )}

          {state === "error" && (
            <>
              <div style={{ ...s.statusIcon, ...s.errorIcon }}>×</div>
              <h1 style={s.title}>QR scan failed</h1>

              <p style={s.text}>{message}</p>

              <div style={s.actions}>
                <button type="button" style={s.btnOutline} onClick={() => router.push("/dashboard")}>
                  Go back
                </button>

                <button type="button" style={s.btn} onClick={runQrScan}>
                  Try again
                </button>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

export default function StudentQrScanPage() {
  return (
    <Suspense
      fallback={
        <div style={s.page}>
          <main style={s.main}>
            <section style={s.card}>
              <div style={s.statusIcon}>⌛</div>
              <h1 style={s.title}>Loading QR scanner</h1>
            </section>
          </main>
        </div>
      }
    >
      <StudentQrScanContent />
    </Suspense>
  );
}

const s: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "var(--background)",
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

  navRight: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
    flexShrink: 0,
  },

  logo: {
    fontSize: 20,
    fontWeight: 800,
    textDecoration: "none",
    color: "var(--text)",
    letterSpacing: -0.5,
  },

  logoBlue: {
    color: "#185FA5",
  },

  navBtn: {
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    borderRadius: 999,
    padding: "9px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },

  main: {
    minHeight: "calc(100vh - 64px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  card: {
    width: "100%",
    maxWidth: 520,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 24,
    boxShadow: "var(--shadow)",
    padding: 26,
    textAlign: "center",
  },

  statusIcon: {
    width: 58,
    height: 58,
    borderRadius: 999,
    margin: "0 auto 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--muted)",
    color: "var(--text)",
    fontSize: 28,
    fontWeight: 900,
  },

  successIcon: {
    background: "#EAF3DE",
    color: "#3B6D11",
  },

  warningIcon: {
    background: "#FAEEDA",
    color: "#854F0B",
  },

  errorIcon: {
    background: "#FCEBEB",
    color: "#A32D2D",
  },

  walkInIcon: {
    background: "#E6F1FB",
    color: "#185FA5",
  },

  title: {
    margin: 0,
    fontSize: 26,
    fontWeight: 900,
    letterSpacing: -0.7,
  },

  text: {
    margin: "10px 0 0",
    fontSize: 14,
    color: "var(--muted-text)",
    lineHeight: 1.6,
  },

  errorText: {
    margin: "12px 0 0",
    fontSize: 13,
    color: "#A32D2D",
    fontWeight: 700,
  },

  actions: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginTop: 22,
  },

  btn: {
    width: "100%",
    height: 48,
    border: "none",
    background: "#185FA5",
    color: "#fff",
    borderRadius: 14,
    padding: "0 16px",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
  },

  btnOutline: {
    width: "100%",
    height: 48,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    borderRadius: 14,
    padding: "0 16px",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
  },

  infoBox: {
    display: "grid",
    gap: 10,
    textAlign: "left",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 18,
    padding: 14,
    marginTop: 18,
  },

  infoValue: {
    color: "var(--text)",
    fontWeight: 900,
  },

  infoRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    fontSize: 14,
  },

  infoLabel: {
    color: "var(--muted-text)",
    fontSize: 12,
    fontWeight: 700,
  },

  roomGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 8,
    marginTop: 14,
  },

  roomBox: {
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: "10px 8px",
    background: "var(--surface)",
    display: "grid",
    gap: 4,
    fontSize: 12,
  },

  roomSub: {
    color: "var(--muted-text)",
    fontSize: 11,
  },

  sectionLabel: {
    textAlign: "left",
    margin: "18px 0 8px",
    fontSize: 13,
    fontWeight: 800,
  },

  durationGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 10,
  },

  durationBtn: {
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    borderRadius: 14,
    padding: "14px 10px",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
  },

  mutedText: {
    margin: "8px 0 0",
    color: "var(--muted)",
    fontSize: 14,
    lineHeight: 1.5,
  },

  selectedDurationBtn: {
    border: "2px solid #185FA5",
    background: "rgba(24, 95, 165, 0.14)",
    color: "#185FA5",
  },

  roomBtn: {
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: "12px 8px",
    background: "var(--surface)",
    color: "var(--text)",
    display: "grid",
    gap: 4,
    fontSize: 12,
    cursor: "pointer",
    textAlign: "center",
  },

  successText: {
    margin: "10px 0 18px",
    fontSize: 14,
    color: "var(--muted-text)",
    lineHeight: 1.6,
  },
};
