"use client"

import { useState, type CSSProperties } from "react";
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
      headers: { "Content-Type": "application/json" },
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
        setError("Unknown staff role.");
      }
    } else {
      setError("Incorrect username or password.");
    }
  }

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <a href="/" style={styles.logo}>
          rEEE<span style={{ color: "#185FA5" }}>serve</span>
        </a>
        <a href="/" style={styles.back}></a>
      </nav>

      <main style={styles.main}>
        <div style={styles.card}>
          <span style={styles.badge}>Staff access</span>
          <h1 style={styles.title}>Login</h1>

          <label style={styles.label}>Username</label>
          <input
            style={styles.input}
            type="text"
            placeholder=""
            value={username}
            onChange={e => { setUsername(e.target.value); setError(""); }}
          />

          <label style={{ ...styles.label, marginTop: 14 }}>Password</label>
          <div style={{ position: "relative" }}>
            <input
              style={{ ...styles.input, paddingRight: 40 }}
              type={showPw ? "text" : "password"}
              placeholder=""
              value={password}
              onChange={e => { setPassword(e.target.value); setError(""); }}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
            />
            <button onClick={() => setShowPw(!showPw)} style={styles.eyeBtn}>
              {showPw ? "🙈" : "👁"}
            </button>
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button
            style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }}
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? "Verifying…" : "Login"}
          </button>

          <p style={styles.hint}>
            Not a staff?{" "}
            <a href="/" style={{ color: "#185FA5" }}>Log in as student</a>
          </p>
        </div>
      </main>

      <footer style={styles.footer}>
        <a href="/about" style={styles.footerLink}>About</a>
        <a href="/help" style={styles.footerLink}>Help</a>
      </footer>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", display: "flex", flexDirection: "column", background: "#f5f5f5", fontFamily: "sans-serif" },
  nav: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 28px", borderBottom: "1px solid #eee", background: "#fff" },
  logo: { fontSize: 22, fontWeight: 700, textDecoration: "none", color: "#111" },
  back: { fontSize: 13, color: "#888", textDecoration: "none" },
  main: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { background: "#fff", border: "1px solid #eee", borderRadius: 12, padding: "36px 40px", width: "100%", maxWidth: 380 },
  badge: { background: "#E6F1FB", color: "#185FA5", fontSize: 11, fontWeight: 500, padding: "4px 10px", borderRadius: 6, letterSpacing: 1, textTransform: "uppercase" },
  title: { fontSize: 22, fontWeight: 700, margin: "14px 0 24px" },
  label: { fontSize: 13, color: "#666", display: "block", marginBottom: 7 },
  input: { width: "100%", boxSizing: "border-box", padding: "10px 13px", border: "1px solid #ddd", borderRadius: 8, fontSize: 15, background: "#fafafa" },
  eyeBtn: { position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14 },
  error: { fontSize: 12, color: "#a32d2d", background: "#fcebeb", padding: "8px 10px", borderRadius: 6, marginTop: 8 },
  btn: { width: "100%", marginTop: 16, padding: 11, background: "#185FA5", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: "pointer" },
  hint: { textAlign: "center", fontSize: 13, color: "#aaa", marginTop: 20 },
  footer: { padding: "14px 28px", borderTop: "1px solid #eee", background: "#fff", display: "flex", gap: 20 },
  footerLink: { fontSize: 13, color: "#888", textDecoration: "none" },
};
