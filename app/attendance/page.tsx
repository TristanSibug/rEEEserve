"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

export default function AttendanceScannerPage() {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);

  async function startScanner() {
    setError("");

    try {
      const oldScanner = scannerRef.current;

      if (oldScanner) {
        await oldScanner.stop().catch(() => { });
        oldScanner.clear();
      }

      const scanner = new Html5Qrcode("attendance-reader");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        async (decodedText) => {
          await scanner.stop().catch(() => { });

          let url: URL;

          try {
            url = new URL(decodedText);
          } catch {
            setError("This is not a valid rEEEserve attendance QR code.");
            return;
          }

          if (url.pathname !== "/attendance/scan") {
            setError("This is not a valid rEEEserve attendance QR code.");
            return;
          }

          const token = url.searchParams.get("token");

          if (!token) {
            setError("This QR code does not contain an attendance token.");
            return;
          }

          window.location.href = `/attendance/scan?token=${encodeURIComponent(
            token
          )}`;
        },
        () => { }
      );

      setStarted(true);
    } catch (err) {
      console.error(err);
      setError(
        "Could not start the camera. Please allow camera access, or use your phone camera app to scan the QR code."
      );
    }
  }

  useEffect(() => {
    startScanner();

    return () => {
      const scanner = scannerRef.current;

      if (scanner) {
        scanner
          .stop()
          .catch(() => { })
          .finally(() => {
            scanner.clear();
          });
      }
    };
  }, []);

  return (
    <main style={s.page}>
      <nav style={s.nav}>
        <a href="/dashboard" style={s.logo}>
          rEEE<span style={{ color: "#185FA5" }}>serve</span>
        </a>

        <a href="/dashboard" style={s.navLink}>
          Back to dashboard
        </a>
      </nav>

      <section style={s.shell}>
        <div style={s.card}>
          <p style={s.eyebrow}>Attendance</p>
          <h1 style={s.title}>Scan the lab QR code</h1>
          <p style={s.desc}>
            You must be logged in and have an active reservation for the room.
          </p>

          <div style={s.readerWrap}>
            <div id="attendance-reader" style={s.reader} />
          </div>

          {!started && !error && <p style={s.status}>Starting camera...</p>}

          {error && (
            <>
              <p style={s.error}>{error}</p>
              <button type="button" style={s.btn} onClick={startScanner}>
                Try again
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "var(--bg)",
    color: "var(--text)",
    fontFamily: "sans-serif",
  },

  nav: {
    height: 64,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 92px 0 28px",
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

  navLink: {
    fontSize: 14,
    fontWeight: 800,
    color: "#60a5fa",
    textDecoration: "none",
    marginRight: 46,
  },

  shell: {
    maxWidth: 660,
    margin: "0 auto",
    padding: "34px 20px 60px",
  },

  card: {
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: 24,
    padding: 28,
    boxShadow: "0 14px 40px rgba(0, 0, 0, 0.16)",
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
    fontSize: 30,
    letterSpacing: -0.8,
    color: "var(--text)",
  },

  desc: {
    margin: "0 0 20px",
    color: "var(--muted)",
    lineHeight: 1.6,
  },

  readerWrap: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 18,
    border: "1px solid var(--border)",
    background: "#000000",
  },

  reader: {
    width: "100%",
    minHeight: 390,
    overflow: "hidden",
    borderRadius: 18,
    background: "#000000",
    color: "#ffffff",
  },

  status: {
    marginTop: 14,
    color: "var(--muted)",
    fontWeight: 700,
  },

  error: {
    marginTop: 14,
    color: "#f87171",
    fontWeight: 700,
    lineHeight: 1.5,
  },

  btn: {
    marginTop: 12,
    border: "none",
    borderRadius: 14,
    padding: "12px 16px",
    fontSize: 14,
    fontWeight: 800,
    color: "#ffffff",
    background: "#185FA5",
    cursor: "pointer",
  },
};
