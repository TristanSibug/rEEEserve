"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  async function handleLogin() {
    if (!username || !password) {
      setError("Please fill in both fields.");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/admin-login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();
    setLoading(false);

    if (data.ok) {
      if (data.role === "admin") {
        router.push("/admin/dashboard");
      } else if (data.role === "instructor") {
        router.push("/instructor/dashboard");
      } else {
        setError("Unknown admin role.");
      }
    } else {
      setError("Incorrect username or password.");
    }
  }

  return (
    <main style={styles.page}>
      <nav style={styles.nav}>
        <Link href="/" style={styles.logo}>
          rEEE<span style={{ color: "var(--primary)" }}>serve</span>
        </Link>
      </nav>

      <section style={styles.main}>
        <div style={styles.card}>
          <span style={styles.badge}>Admin access</span>

          <h1 style={styles.title}>Login</h1>

          <label style={styles.label}>Username</label>
          <input
            style={styles.input}
            value={username}
            onChange={e => {
              setUsername(e.target.value);
              setError("");
            }}
          />

          <label style={styles.label}>Password</label>
          <div style={{ position: "relative" }}>
            <input
              style={{ ...styles.input, paddingRight: 42 }}
              type={showPw ? "text" : "password"}
              value={password}
              onChange={e => {
                setPassword(e.target.value);
                setError("");
              }}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
            />

            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              style={styles.eyeBtn}
              aria-label={showPw ? "Hide password" : "Show password"}
            >
              {showPw ? "🙈" : "👁️"}
            </button>
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button
            type="button"
            onClick={handleLogin}
            disabled={loading}
            style={{
              ...styles.btn,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Verifying…" : "Login"}
          </button>
          <Link href="/" style={styles.notAdminLink}>
            Not an admin?
          </Link>
        </div>
      </section>

      <footer style={styles.footer}>
        <Link href="/about" style={styles.footerLink}>
          About
        </Link>

        <Link href="/help" style={styles.footerLink}>
          Help
        </Link>
      </footer>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
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

  logoBlue: {
    color: "var(--primary)",
  },

  back: {
    fontSize: 13,
    color: "var(--muted)",
    textDecoration: "none",
  },

  main: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  card: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "36px 40px",
    width: "100%",
    maxWidth: 380,
  },

  badge: {
    background: "var(--primary-soft)",
    color: "var(--primary)",
    fontSize: 11,
    fontWeight: 500,
    padding: "4px 10px",
    borderRadius: 6,
    letterSpacing: 1,
    textTransform: "uppercase",
  },

  title: {
    fontSize: 22,
    fontWeight: 700,
    margin: "14px 0 24px",
    color: "var(--text)",
  },

  label: {
    fontSize: 13,
    color: "var(--text-soft)",
    display: "block",
    marginBottom: 7,
    marginTop: 12,
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 13px",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    fontSize: 15,
    background: "var(--surface-2)",
    color: "var(--text)",
    outline: "none",
  },

  eyeBtn: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 14,
  },

  error: {
    fontSize: 12,
    color: "var(--danger-text)",
    background: "var(--danger-bg)",
    border: "1px solid var(--danger-border-2)",
    padding: "8px 10px",
    borderRadius: 6,
    marginTop: 8,
  },

  btn: {
    width: "100%",
    marginTop: 16,
    padding: 11,
    background: "var(--primary)",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
  },

  footer: {
    padding: "14px 28px",
    borderTop: "1px solid var(--border)",
    background: "var(--surface)",
    display: "flex",
    gap: 20,
  },

  footerLink: {
    fontSize: 13,
    color: "var(--muted)",
    textDecoration: "none",
  },

  notAdminLink: {
    display: "block",
    textAlign: "center",
    marginTop: 16,
    fontSize: 13,
    color: "var(--primary)",
    textDecoration: "none",
    fontWeight: 500,
  },
};
