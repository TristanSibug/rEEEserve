"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import ThemeToggle from "../../components/ThemeToggle";
import Link from "next/link";

type QrPayload = {
  id: string;
  token: string;
  room_name: string | null;
  expires_at: string;
  scan_url: string;
  lifetime_seconds: number;
};

export default function AdminAttendancePage() {
  const [qr, setQr] = useState<QrPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  async function fetchQr() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/attendance/qr", {
        cache: "no-store",
      });

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
  }, []);

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
        <Link href="/admin/dashboard" style={s.logo}>
          rEEE<span style={{ color: "#185FA5" }}>serve</span>
        </Link>
        <div style={s.navRight}>
          <ThemeToggle />
        </div>
      </nav>

      <section style={s.shell}>
        <div style={s.header}>
          <h1 style={s.title}>Attendance QR</h1>
        </div>

        <div style={s.qrCard}>
          <div style={s.qrHeader}>
            <div>
              <p style={s.roomText}>All lab rooms</p>
            </div>

            <div style={s.timer}>{secondsLeft}s</div>
          </div>

          <div style={s.qrBox}>
            {qr?.scan_url ? (
              <QRCodeSVG value={qr.scan_url} size={300} />
            ) : (
              <div style={s.qrPlaceholder}>QR unavailable</div>
            )}
          </div>

          <p style={s.status}>{statusText}</p>

          <button
            type="button"
            style={{
              ...s.btn,
              opacity: loading ? 0.75 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
            onClick={fetchQr}
            disabled={loading}
          >
            {loading ? "Generating..." : "Generate new QR now"}
          </button>

          {error && <p style={s.error}>{error}</p>}
        </div>
      </section>
      <div style={s.bottomBackWrap}>
        <Link href="/admin/dashboard" style={s.bottomBackLink}>
          ← Back to admin dashboard
        </Link>
      </div>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "var(--bg)",
    color: "var(--text)",
    fontFamily:
      "sans-serif",
  },

  nav: {
    display: "flex",
    alignItems: "center",
    padding: "18px 28px",
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

  navLink: {
    fontSize: 14,
    fontWeight: 800,
    color: "#60a5fa",
    textDecoration: "none",
    marginRight: 46,
  },

  shell: {
    maxWidth: 760,
    margin: "0 auto",
    padding: "34px 20px 60px",
  },

  header: {
    marginBottom: 22,
  },

  eyebrow: {
    margin: 0,
    fontSize: 13,
    fontWeight: 800,
    color: "#60a5fa",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  title: {
    margin: "6px 0 8px",
    fontSize: 34,
    lineHeight: 1.1,
    letterSpacing: -1,
    color: "var(--text)",
  },

  desc: {
    margin: 0,
    maxWidth: 700,
    color: "var(--muted)",
    lineHeight: 1.6,
  },

  qrCard: {
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: 24,
    padding: 28,
    boxShadow: "0 14px 40px rgba(0, 0, 0, 0.16)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },

  qrHeader: {
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 22,
  },

  roomText: {
    margin: 0,
    fontSize: 14,
    fontWeight: 800,
    color: "#60a5fa",
  },

  qrTitle: {
    margin: "3px 0 0",
    fontSize: 26,
    letterSpacing: -0.5,
    color: "var(--text)",
  },

  timer: {
    minWidth: 58,
    textAlign: "center",
    padding: "8px 10px",
    borderRadius: 999,
    background: "rgba(251, 146, 60, 0.14)",
    color: "#fb923c",
    fontWeight: 900,
  },

  qrBox: {
    width: 360,
    height: 360,
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
    margin: "18px 0 12px",
    color: "var(--muted)",
    fontSize: 14,
    fontWeight: 700,
    textAlign: "center",
  },

  btn: {
    border: "none",
    borderRadius: 14,
    padding: "12px 18px",
    fontSize: 14,
    fontWeight: 800,
    color: "#ffffff",
    background: "#185FA5",
    cursor: "pointer",
    marginBottom: 20,
  },

  error: {
    color: "#f87171",
    fontSize: 14,
    fontWeight: 700,
    marginTop: 14,
    textAlign: "center",
  },

  bottomBackWrap: {
    width: "100%",
    display: "flex",
    justifyContent: "center",
    marginTop: 24,
  },

  bottomBackLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    maxWidth: 360,
    padding: "12px 16px",
    marginBottom: 40,
    borderRadius: 14,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 700,
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
  },
};
