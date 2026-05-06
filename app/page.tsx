"use client";

import { createClient } from "../utils/supabase/client";

type DemoRole = "student" | "instructor" | "admin";

export default function Home() {
  const supabase = createClient();

  const showDemoButtons =
    process.env.NEXT_PUBLIC_DEMO_LOGIN_ENABLED === "true";

  async function handleGoogleLogin() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          hd: "eee.upd.edu.ph",
        },
      },
    });

    if (error) {
      console.error("Google login error:", error.message);
    }
  }

  function handleDemoLogin(role: DemoRole) {
    window.location.href = `/api/demo-login?role=${role}`;
  }

  return (
    <div style={s.page}>
      <nav style={s.nav}>
        <a href="/" style={s.logo}>
          rEEE<span style={{ color: "var(--primary)" }}>serve</span>
        </a>
      </nav>

      <main style={s.main}>
        <div style={s.card}>
          <p style={s.sub}>Student | Instructor</p>

          <h1 style={s.title}>Sign in</h1>

          <p style={s.desc}>
            Use your <strong>@eee.upd.edu.ph</strong> Google account to
            continue.
          </p>

          <button style={s.googleBtn} onClick={handleGoogleLogin}>
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
            </svg>
            Sign in with Google
          </button>

          {showDemoButtons && (
            <div style={s.demoBox}>
              <p style={s.demoTitle}>Demo login</p>

              <div style={s.demoGrid}>
                <button
                  type="button"
                  style={s.demoBtn}
                  onClick={() => handleDemoLogin("student")}
                >
                  Student
                </button>

                <button
                  type="button"
                  style={s.demoBtn}
                  onClick={() => handleDemoLogin("instructor")}
                >
                  Instructor
                </button>

                <button
                  type="button"
                  style={s.demoBtn}
                  onClick={() => handleDemoLogin("admin")}
                >
                  Admin
                </button>
              </div>

              <p style={s.demoNote}>
                For testing only.
              </p>
            </div>
          )}

          <div style={s.divider}>
            <hr style={{ flex: 1, border: "none", borderTop: "1px solid var(--border)" }} />
            <span style={{ fontSize: 12, color: "var(--muted-3)", margin: "0 10px" }}>
              or
            </span>
            <hr style={{ flex: 1, border: "none", borderTop: "1px solid var(--border)" }} />
          </div>

          <a href="/admin/login" style={s.adminLink}>
            Not a student or instructor? →
          </a>
        </div>
      </main>

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
    background: "var(--page-bg)",
    fontFamily: "sans-serif",
  },
  nav: {
    display: "flex",
    alignItems: "center",
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
  sub: {
    fontSize: 11,
    color: "var(--muted-2)",
    textTransform: "uppercase",
    letterSpacing: 1,
    margin: "0 0 4px",
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    margin: "0 0 8px",
  },
  desc: {
    fontSize: 13,
    color: "var(--muted)",
    margin: "0 0 24px",
    lineHeight: 1.6,
  },
  googleBtn: {
    width: "100%",
    padding: 11,
    background: "var(--surface)",
    color: "var(--text-soft)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  demoBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    background: "#F7FAFF",
    border: "1px solid #DCEBFA",
  },
  demoTitle: {
    margin: "0 0 8px",
    fontSize: 12,
    fontWeight: 700,
    color: "var(--primary)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  demoGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 8,
  },
  demoBtn: {
    padding: "8px 6px",
    borderRadius: 8,
    border: "1px solid #BFD8F2",
    background: "var(--surface)",
    color: "var(--primary)",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  demoNote: {
    margin: "8px 0 0",
    fontSize: 11,
    color: "var(--muted)",
    lineHeight: 1.4,
  },
  divider: {
    display: "flex",
    alignItems: "center",
    margin: "18px 0",
  },
  adminLink: {
    display: "block",
    textAlign: "center",
    fontSize: 13,
    color: "var(--primary)",
    textDecoration: "none",
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
};
