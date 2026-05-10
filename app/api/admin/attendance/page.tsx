"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

const ROOMS = ["EEEI 301", "EEEI 305", "EEEI 308"];

type QrPayload = {
  id: string;
  token: string;
  room_name: string;
  expires_at: string;
  scan_url: string;
  lifetime_seconds: number;
};

export default function AdminAttendancePage() {
  const [room, setRoom] = useState("EEEI 301");
  const [qr, setQr] = useState<QrPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  async function fetchQr() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(
        `/api/admin/attendance/qr?room=${encodeURIComponent(room)}`,
        { cache: "no-store" }
      );

      const data = await res.json();

      if (!res.ok) {
        setQr(null);
        setError(data.error ?? "Failed to generate QR code.");
        return;
      }

      setQr(data);
    } catch {
      setQr(null);
      setError("Failed to generate QR code.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchQr();

    const interval = window.setInterval(() => {
      fetchQr();
    }, 25000);

    return () => window.clearInterval(interval);
  }, [room]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!qr?.expires_at) {
        setSecondsLeft(0);
        return;
      }

      const diff = Math.max(
        0,
        Math.ceil((new Date(qr.expires_at).getTime() - Date.now()) / 1000)
      );

      setSecondsLeft(diff);
    }, 500);

    return () => window.clearInterval(interval);
  }, [qr]);

  const statusText = useMemo(() => {
    if (loading && !qr) return "Generating QR code...";
    if (!qr) return "No QR code available.";
    return `Refreshes automatically. Expires in ${secondsLeft}s.`;
  }, [loading, qr, secondsLeft]);

  return (
    <main style={s.page}>
      <nav style={s.nav}>
        <a href="/admin/dashboard" style={s.logo}>
          REEE<span style={{ color: "#185FA5" }}>serve</span>
        </a>

        <a href="/admin/dashboard" style={s.navLink}>
          Back to admin dashboard
        </a>
      </nav>

      <section style={s.shell}>
        <div style={s.header}>
          <p style={s.eyebrow}>Attendance Authentication</p>
          <h1 style={s.title}>Rotating QR Check-in</h1>
          <p style={s.desc}>
            Display this QR code near the lab entrance. Students must be logged in
            and must have an active reservation for the selected room.
          </p>
        </div>

        <div style={s.grid}>
          <div style={s.card}>
            <label style={s.label}>Room</label>
            <select
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              style={s.select}
            >
              {ROOMS.map((roomName) => (
                <option key={roomName} value={roomName}>
                  {roomName}
                </option>
              ))}
            </select>

            <div style={s.infoBox}>
              <strong>How this works</strong>
              <p style={s.infoText}>
                The QR changes every 30 seconds. A screenshot of an old QR will
                expire and cannot be used later.
              </p>
            </div>

            <button type="button" style={s.btn} onClick={fetchQr}>
              Generate new QR now
            </button>
          </div>

          <div style={s.qrCard}>
            <div style={s.qrHeader}>
              <div>
                <p style={s.roomText}>{room}</p>
                <h2 style={s.qrTitle}>Attendance QR</h2>
              </div>

              <div style={s.timer}>{secondsLeft}s</div>
            </div>

            <div style={s.qrBox}>
              {qr?.scan_url ? (
                <QRCodeSVG value={qr.scan_url} size={280} />
              ) : (
                <div style={s.qrPlaceholder}>QR unavailable</div>
              )}
            </div>

            <p style={s.status}>{statusText}</p>

            {error && <p style={s.error}>{error}</p>}
          </div>
        </div>
      </section>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "var(--bg, #f6f8fb)",
    color: "var(--text, #111827)",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },

  nav: {
    height: 64,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 28px",
    borderBottom: "1px solid var(--border, #e5e7eb)",
    background: "var(--surface, #ffffff)",
    position: "sticky",
    top: 0,
    zIndex: 20,
  },

  logo: {
    fontSize: 20,
    fontWeight: 800,
    textDecoration: "none",
    color: "var(--text, #111827)",
    letterSpacing: -0.5,
  },

  navLink: {
    fontSize: 14,
    fontWeight: 700,
    color: "#185FA5",
    textDecoration: "none",
  },

  shell: {
    maxWidth: 1050,
    margin: "0 auto",
    padding: "34px 20px 60px",
  },

  header: {
    marginBottom: 24,
  },

  eyebrow: {
    margin: 0,
    fontSize: 13,
    fontWeight: 800,
    color: "#185FA5",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  title: {
    margin: "6px 0 8px",
    fontSize: 34,
    lineHeight: 1.1,
    letterSpacing: -1,
  },

  desc: {
    margin: 0,
    maxWidth: 700,
    color: "var(--muted, #6b7280)",
    lineHeight: 1.6,
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(260px, 360px) 1fr",
    gap: 18,
    alignItems: "stretch",
  },

  card: {
    background: "var(--surface, #ffffff)",
    border: "1px solid var(--border, #e5e7eb)",
    borderRadius: 22,
    padding: 22,
    boxShadow: "0 14px 40px rgba(15, 23, 42, 0.06)",
  },

  label: {
    display: "block",
    marginBottom: 8,
    fontSize: 13,
    fontWeight: 800,
  },

  select: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid var(--border, #d1d5db)",
    background: "var(--surface, #ffffff)",
    color: "var(--text, #111827)",
    fontSize: 15,
    marginBottom: 16,
  },

  infoBox: {
    padding: 14,
    borderRadius: 16,
    background: "var(--soft, #f3f4f6)",
    border: "1px solid var(--border, #e5e7eb)",
    marginBottom: 16,
  },

  infoText: {
    margin: "6px 0 0",
    fontSize: 13,
    color: "var(--muted, #6b7280)",
    lineHeight: 1.5,
  },

  btn: {
    width: "100%",
    border: "none",
    borderRadius: 14,
    padding: "12px 16px",
    fontSize: 14,
    fontWeight: 800,
    color: "#ffffff",
    background: "#185FA5",
    cursor: "pointer",
  },

  qrCard: {
    background: "var(--surface, #ffffff)",
    border: "1px solid var(--border, #e5e7eb)",
    borderRadius: 22,
    padding: 24,
    boxShadow: "0 14px 40px rgba(15, 23, 42, 0.06)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },

  qrHeader: {
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },

  roomText: {
    margin: 0,
    fontSize: 14,
    fontWeight: 800,
    color: "#185FA5",
  },

  qrTitle: {
    margin: "3px 0 0",
    fontSize: 24,
  },

  timer: {
    minWidth: 58,
    textAlign: "center",
    padding: "8px 10px",
    borderRadius: 999,
    background: "#fff7ed",
    color: "#c2410c",
    fontWeight: 900,
  },

  qrBox: {
    width: 330,
    height: 330,
    maxWidth: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    background: "#ffffff",
    border: "1px solid #e5e7eb",
  },

  qrPlaceholder: {
    color: "#9ca3af",
    fontWeight: 700,
  },

  status: {
    margin: "16px 0 0",
    color: "var(--muted, #6b7280)",
    fontSize: 14,
    fontWeight: 700,
  },

  error: {
    color: "#dc2626",
    fontSize: 14,
    fontWeight: 700,
  },
};
