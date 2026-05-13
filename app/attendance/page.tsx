"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import ThemeToggle from "../components/ThemeToggle";
import Link from "next/link";

export default function AttendanceScannerPage() {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const hasScannedRef = useRef(false);

  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  async function stopScanner() {
    const scanner = scannerRef.current;

    if (!scanner) return;

    try {
      await scanner.stop();
    } catch {
      // Scanner may already be stopped. Safe to ignore.
    }

    try {
      await scanner.clear();
    } catch {
      // Clear may fail if scanner already cleaned up. Safe to ignore.
    }

    scannerRef.current = null;
    setStarted(false);
  }

  async function startScanner() {
    setError("");
    setRedirecting(false);
    hasScannedRef.current = false;

    try {
      await stopScanner();

      const scanner = new Html5Qrcode("attendance-reader");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        async decodedText => {
          if (hasScannedRef.current) return;
          hasScannedRef.current = true;

          let url: URL;

          try {
            url = new URL(decodedText);
          } catch {
            hasScannedRef.current = false;
            setError("This is not a valid rEEEserve attendance QR code.");
            return;
          }

          if (url.pathname !== "/attendance/scan") {
            hasScannedRef.current = false;
            setError("This is not a valid rEEEserve attendance QR code.");
            return;
          }

          const token = url.searchParams.get("token");

          if (!token) {
            hasScannedRef.current = false;
            setError("This QR code does not contain an attendance token.");
            return;
          }

          setRedirecting(true);

          await stopScanner();

          // Use hard navigation instead of router.push.
          // This avoids mobile browser crashes caused by navigating while camera is active.
          window.location.href = `/attendance/scan?token=${encodeURIComponent(
            token
          )}`;
        },
        () => {
          // Ignore repeated scan failures while camera is searching.
        }
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
      stopScanner();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <p style={s.eyebrow}>Attendance</p>

          <h1 style={s.title}>
            {redirecting ? "Opening attendance page" : "Scan the lab QR code"}
          </h1>

          <p style={s.desc}>
            {redirecting
              ? "Please wait while we open your QR scan result."
              : "You must be logged in and have an active reservation for the room."}
          </p>

          <div style={s.readerWrap}>
            <div id="attendance-reader" style={s.reader} />
          </div>

          {!started && !error && !redirecting && (
            <p style={s.status}>Starting camera...</p>
          )}

          {redirecting && (
            <p style={s.status}>QR detected. Redirecting...</p>
          )}

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
    background: "var(--background)",
    color: "var(--text)",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },

  nav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
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
    boxShadow: "var(--shadow)",
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
    color: "var(--text)",
  },

  desc: {
    margin: "0 0 20px",
    color: "var(--muted-text)",
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
    color: "var(--muted-text)",
    fontWeight: 700,
  },

  error: {
    marginTop: 14,
    color: "#A32D2D",
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
