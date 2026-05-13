"use client";

import { CSSProperties, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ThemeToggle from "../../components/ThemeToggle";
import Link from "next/link";

type ScanState =
  | "loading"
  | "success"
  | "no_reservation"
  | "walk_in_loading"
  | "walk_in_options"
  | "walk_in_success"
  | "error";

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
  ok: boolean;
  available: boolean;
  message: string;
  date: string;
  start_time: string | null;
  max_slots: number;
  max_minutes: number;
  max_label: string;
  options: WalkInOption[];
  rooms: RoomAvailability[];
  remaining_daily_minutes?: number;
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
        setMessage(data.error ?? data.message ?? "No reservation made.");

        // Automatically check if walk-in is possible.
        loadWalkInAvailability();
        return;
      }

      setState("error");
      setMessage(data.error ?? data.message ?? "Failed to scan QR.");
    } catch {
      setState("error");
      setMessage("Something went wrong while scanning the QR.");
    }
  }

  async function loadWalkInAvailability() {
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

      setAvailability(data);

      if (!data.available || data.options.length === 0) {
        setState("no_reservation");
        setMessage(data.message ?? "No walk-in slots are available right now.");
        return;
      }

      setState("walk_in_options");
    } catch {
      setState("no_reservation");
      setMessage("Failed to check walk-in availability.");
    }
  }

  async function createWalkIn(slots: number) {
    setCreatingSlots(slots);
    setMessage("");

    try {
      const res = await fetch("/api/student/walk-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error ?? "Failed to create walk-in reservation.");
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
                You do not have an active reservation for this QR scan.
              </p>

              {message && (
                <p style={s.errorText}>
                  {message}
                </p>
              )}

              <p style={s.text}>
                Checking if a walk-in reservation is available right now...
              </p>

              <div style={s.actions}>
                <button
                  type="button"
                  style={s.btnOutline}
                  onClick={() => router.push("/dashboard")}
                >
                  Go back
                </button>

                <button
                  type="button"
                  style={s.btn}
                  onClick={loadWalkInAvailability}
                >
                  Check walk-in
                </button>
              </div>
            </>
          )}

          {state === "walk_in_loading" && (
            <>
              <div style={s.statusIcon}>⌛</div>
              <h1 style={s.title}>Checking walk-in slots</h1>
              <p style={s.text}>
                Checking which lab can accommodate you starting now.
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

              <div style={s.roomGrid}>
                {availability.rooms.map(room => (
                  <div key={room.room_name} style={s.roomBox}>
                    <strong>{room.room_name}</strong>
                    <span style={s.roomSub}>
                      {room.continuous_slots === 0
                        ? "No continuous slot"
                        : `${room.continuous_minutes / 60} hr available`}
                    </span>
                  </div>
                ))}
              </div>

              <p style={s.sectionLabel}>How long do you want to stay?</p>

              <div style={s.durationGrid}>
                {availability.options.map(option => (
                  <button
                    key={option.slots}
                    type="button"
                    style={{
                      ...s.durationBtn,
                      opacity: creatingSlots === option.slots ? 0.7 : 1,
                    }}
                    disabled={creatingSlots !== null}
                    onClick={() => createWalkIn(option.slots)}
                  >
                    {creatingSlots === option.slots
                      ? "Creating..."
                      : option.label}
                  </button>
                ))}
              </div>

              {message && <p style={s.errorText}>{message}</p>}

              <button
                type="button"
                style={{ ...s.btnOutline, marginTop: 16 }}
                onClick={() => setState("no_reservation")}
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
    background: "var(--muted)",
    border: "1px solid var(--border)",
    borderRadius: 18,
    padding: 14,
    marginTop: 18,
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
};
