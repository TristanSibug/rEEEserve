"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import ThemeToggle from "@/app/components/ThemeToggle";
import Link from "next/link";

type CheckInResult = {
  ok?: boolean;
  already_checked_in?: boolean;
  room_name?: string;
  reserved_date?: string;
  time_start?: string;
  time_end?: string;
  checked_count?: number;
  message?: string;
  error?: string;
};

function ScanContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [result, setResult] = useState<CheckInResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkIn() {
      if (!token) {
        setResult({ error: "Missing attendance token." });
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/attendance/check-in", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();
        setResult(data);
      } catch {
        setResult({ error: "Failed to check in. Please try again." });
      } finally {
        setLoading(false);
      }
    }

    checkIn();
  }, [token]);

  return (
    <main style={s.page}>
      <nav style={s.nav}>
        <Link href="/dashboard" style={s.logo}>
          rEEE<span style={{ color: "#185FA5" }}>serve</span>
        </Link>
        <div style={s.navRight}>
          <ThemeToggle />
        </div>
      </nav>

      <section style={s.shell}>
        <div style={s.card}>
          {loading && (
            <>
              <p style={s.eyebrow}>Attendance</p>
              <h1 style={s.title}>Checking you in...</h1>
              <p style={s.desc}>Please wait while we verify your reservation.</p>
            </>
          )}

          {!loading && result?.ok && (
            <>
              <div style={s.successIcon}>✓</div>
              <p style={s.eyebrow}>Attendance confirmed</p>
              <h1 style={s.title}>
                {result.already_checked_in
                  ? "You are already checked in"
                  : "Check-in successful"}
              </h1>

              <div style={s.details}>
                <div>
                  <span style={s.detailLabel}>Room</span>
                  <strong>{result.room_name}</strong>
                </div>

                <div>
                  <span style={s.detailLabel}>Date</span>
                  <strong>{result.reserved_date}</strong>
                </div>

                <div>
                  <span style={s.detailLabel}>Time</span>
                  <strong>
                    {fmt(result.time_start ?? "")} – {fmt(result.time_end ?? "")}
                  </strong>
                </div>

                <div>
                  <span style={s.detailLabel}>Slots marked</span>
                  <strong>{result.checked_count}</strong>
                </div>
              </div>

              <p style={s.desc}>{result.message}</p>

              <a href="/dashboard" style={s.btnLink}>
                Return to dashboard
              </a>
            </>
          )}

          {!loading && result?.error && (
            <>
              <div style={s.errorIcon}>!</div>
              <p style={s.eyebrow}>Attendance failed</p>
              <h1 style={s.title}>Could not check you in</h1>
              <p style={s.error}>{result.error}</p>

              <div style={s.actions}>
                <a href="/attendance" style={s.btnLink}>
                  Scan again
                </a>

                <a href="/dashboard" style={s.secondaryLink}>
                  Back to dashboard
                </a>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

export default function AttendanceScanPage() {
  return (
    <Suspense
      fallback={
        <main style={s.page}>
          <section style={s.shell}>
            <div style={s.card}>
              <h1 style={s.title}>Loading...</h1>
            </div>
          </section>
        </main>
      }
    >
      <ScanContent />
    </Suspense>
  );
}

function fmt(t: string) {
  if (!t) return "";

  const [h, m] = t.split(":").map(Number);
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  const suffix = h >= 12 ? "PM" : "AM";

  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
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
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 28px",
    borderBottom: "1px solid var(--border, #e5e7eb)",
    background: "var(--surface, #ffffff)",
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
    maxWidth: 620,
    margin: "0 auto",
    padding: "34px 20px 60px",
  },

  card: {
    background: "var(--surface, #ffffff)",
    border: "1px solid var(--border, #e5e7eb)",
    borderRadius: 22,
    padding: 26,
    boxShadow: "0 14px 40px rgba(15, 23, 42, 0.06)",
  },

  successIcon: {
    width: 54,
    height: 54,
    borderRadius: "50%",
    background: "#dcfce7",
    color: "#15803d",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 30,
    fontWeight: 900,
    marginBottom: 14,
  },

  errorIcon: {
    width: 54,
    height: 54,
    borderRadius: "50%",
    background: "#fee2e2",
    color: "#b91c1c",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 30,
    fontWeight: 900,
    marginBottom: 14,
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
    fontSize: 30,
    letterSpacing: -0.8,
  },

  desc: {
    margin: "12px 0 0",
    color: "var(--muted, #6b7280)",
    lineHeight: 1.6,
  },

  error: {
    margin: "12px 0 0",
    color: "#dc2626",
    fontWeight: 700,
    lineHeight: 1.5,
  },

  details: {
    display: "grid",
    gap: 10,
    marginTop: 18,
    marginBottom: 12,
  },

  detailLabel: {
    display: "block",
    fontSize: 12,
    fontWeight: 800,
    color: "var(--muted, #6b7280)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },

  btnLink: {
    display: "inline-flex",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 18,
    borderRadius: 14,
    padding: "12px 16px",
    background: "#185FA5",
    color: "#ffffff",
    textDecoration: "none",
    fontWeight: 800,
  },

  secondaryLink: {
    display: "inline-flex",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 18,
    borderRadius: 14,
    padding: "12px 16px",
    background: "var(--soft, #f3f4f6)",
    color: "var(--text, #111827)",
    textDecoration: "none",
    fontWeight: 800,
  },

  actions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
};
