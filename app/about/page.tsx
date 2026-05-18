"use client";

import Link from "next/link";
import { useEffect } from "react";
import ThemeToggle from "../components/ThemeToggle";

const features = [
  {
    title: "Check lab availability",
    text: "View available lab slots anytime, anywhere before deciding when to work.",
  },
  {
    title: "Reserve in advance",
    text: "Book slots ahead of time so you do not have to worry about losing a spot during busy weeks.",
  },
  {
    title: "Validate reservations",
    text: "Confirm reserved lab slots through a straightforward attendance validation flow.",
  },
  {
    title: "Walk-in support",
    text: "No reservation? rEEEserve can still help students find available lab space.",
  },
  {
    title: "Instructor tools",
    text: "Instructors can manage lab classes and help maximize lab room usage.",
  },
];

export default function AboutPage() {
  useEffect(() => {
    const revealItems = document.querySelectorAll(".reveal");

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      {
        threshold: 0.15,
      }
    );

    revealItems.forEach(item => observer.observe(item));

    return () => observer.disconnect();
  }, []);

  return (
    <div className="page">
      <nav className="nav">
        <Link href="/" className="logo">
          rEEE<span>serve</span>
        </Link>

        <div className="navRight">
          <ThemeToggle />

          <Link href="/" className="navLink">
            Back to home
          </Link>
        </div>
      </nav>

      <main className="main">
        <section className="hero reveal">
          <div className="heroGlow" />

          <div className="heroContent">
            <p className="eyebrow">About rEEEserve</p>

            <h1>
              Welcome to <span>rEEEserve!</span>
            </h1>

            <p className="heroText">
              rEEEserve is a smart system built for laboratory management that
              aims to provide an efficient and straightforward way to allocate
              lab facilities to users, while also providing powerful
              administrative tools to handlers in order to maximize utilization
              of resources.
            </p>
          </div>
        </section>

        <section className="section twoCol reveal">
          <div className="stickyTitle">
            <p className="sectionLabel">Motivation</p>
            <h2>Built for the reality of EEEI hell weeks.</h2>
          </div>

          <div className="textBlock">
            <p>
              We have all experienced the pressure of hell weeks here in EEEI.
              When those deadlines come close, everyone is rushing to finish
              their projects. This leads to a period wherein the labs are full
              and you have got no place to work.
            </p>

            <p>
              Sure, you can come in early to get a station before everyone else,
              but not everybody has that luxury.
            </p>

            <p>
              And so, we built rEEEserve as our answer to that ever-present
              issue. Originally, as the name suggests, it was for students to
              reserve lab slots in advance, but we evolved the use to make it a
              dynamically allocating system that serves not only students, but
              instructors and lab handlers as well.
            </p>
          </div>
        </section>

        <section className="section reveal">
          <div className="sectionHeader">
            <p className="sectionLabel">Features</p>
            <h2>What rEEEserve helps you do</h2>
          </div>

          <div className="featureGrid">
            {features.map((feature, index) => (
              <article
                key={feature.title}
                className="featureCard reveal"
                style={{ transitionDelay: `${index * 80}ms` }}
              >
                <div className="featureNumber">
                  {String(index + 1).padStart(2, "0")}
                </div>

                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="footer">
        <Link href="/about" className="footerLink active">
          About
        </Link>
        <Link href="/help" className="footerLink">
          Help
        </Link>
      </footer>

      <style>{`
        .page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: var(--background);
          color: var(--text);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          overflow-x: hidden;
        }

        .nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 28px;
          border-bottom: 1px solid var(--border);
          background: var(--surface);
          position: sticky;
          top: 0;
          z-index: 20;
          backdrop-filter: blur(14px);
        }

        .logo {
          font-size: 20px;
          font-weight: 800;
          text-decoration: none;
          color: var(--text);
          letter-spacing: -0.5px;
        }

        .logo span {
          color: #185FA5;
        }

        .navRight {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .navLink {
          font-size: 13px;
          color: #185FA5;
          text-decoration: none;
          font-weight: 700;
          padding: 9px 12px;
          border-radius: 999px;
          background: rgba(24, 95, 165, 0.1);
        }

        .main {
          flex: 1;
          width: 100%;
          max-width: 1080px;
          margin: 0 auto;
          padding: 44px 28px 64px;
          box-sizing: border-box;
        }

        .hero {
          position: relative;
          overflow: hidden;
          min-height: 380px;
          display: flex;
          align-items: center;
          border: 1px solid var(--border);
          border-radius: 28px;
          padding: 48px;
          background: var(--surface);
          box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
        }

        .heroGlow {
          position: absolute;
          width: 420px;
          height: 420px;
          right: -120px;
          top: -140px;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(24, 95, 165, 0.28), transparent 65%);
          animation: floatGlow 7s ease-in-out infinite;
        }

        .heroContent {
          position: relative;
          z-index: 1;
          max-width: 800px;
        }

        .eyebrow,
        .sectionLabel {
          margin: 0 0 10px;
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1.2px;
          color: #185FA5;
        }

        h1 {
          margin: 0;
          font-size: clamp(38px, 7vw, 72px);
          line-height: 0.95;
          letter-spacing: -3px;
        }

        h1 span {
          color: #185FA5;
        }

        .heroText {
          max-width: 760px;
          margin: 24px 0 0;
          font-size: 17px;
          line-height: 1.85;
          color: var(--muted-text);
        }

        .section {
          margin-top: 26px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 34px;
        }

        .twoCol {
          display: grid;
          grid-template-columns: 0.85fr 1.15fr;
          gap: 38px;
          align-items: start;
        }

        .stickyTitle {
          position: sticky;
          top: 96px;
        }

        h2 {
          margin: 0;
          font-size: 28px;
          line-height: 1.2;
          letter-spacing: -0.9px;
        }

        .textBlock {
          display: grid;
          gap: 16px;
        }

        .textBlock p {
          margin: 0;
          color: var(--muted-text);
          font-size: 15px;
          line-height: 1.85;
        }

        .sectionHeader {
          margin-bottom: 22px;
        }

        .featureGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }

        .featureCard {
          min-height: 170px;
          padding: 21px;
          border-radius: 18px;
          border: 1px solid var(--border);
          background: var(--soft-surface, rgba(24, 95, 165, 0.04));
          box-sizing: border-box;
          transition-property: opacity, transform, border-color, box-shadow;
        }

        .featureCard:hover {
          transform: translateY(-5px);
          border-color: rgba(24, 95, 165, 0.35);
          box-shadow: 0 16px 36px rgba(15, 23, 42, 0.08);
        }

        .featureNumber {
          width: fit-content;
          margin-bottom: 18px;
          padding: 5px 9px;
          border-radius: 999px;
          background: rgba(24, 95, 165, 0.12);
          color: #185FA5;
          font-size: 11px;
          font-weight: 800;
        }

        .featureCard h3 {
          margin: 0 0 8px;
          font-size: 16px;
          letter-spacing: -0.2px;
        }

        .featureCard p {
          margin: 0;
          color: var(--muted-text);
          font-size: 13px;
          line-height: 1.65;
        }

        .footer {
          padding: 14px 28px;
          border-top: 1px solid var(--border);
          background: var(--surface);
          display: flex;
          justify-content: center;
          gap: 20px;
        }

        .footerLink {
          font-size: 13px;
          color: var(--muted-text);
          text-decoration: none;
        }

        .footerLink.active {
          color: #185FA5;
          font-weight: 800;
        }

        .reveal {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 650ms ease, transform 650ms ease;
        }

        .reveal.visible {
          opacity: 1;
          transform: translateY(0);
        }

        @keyframes floatGlow {
          0%, 100% {
            transform: translate3d(0, 0, 0) scale(1);
          }

          50% {
            transform: translate3d(-30px, 35px, 0) scale(1.08);
          }
        }

        @media (max-width: 820px) {
          .main {
            padding: 24px 16px 46px;
          }

          .hero {
            min-height: 320px;
            padding: 30px 22px;
            border-radius: 22px;
          }

          .section {
            padding: 24px 20px;
            border-radius: 20px;
          }

          .twoCol {
            grid-template-columns: 1fr;
            gap: 18px;
          }

          .stickyTitle {
            position: static;
          }

          .featureGrid {
            grid-template-columns: 1fr;
          }

          .nav {
            padding: 0 18px;
          }

          .navLink {
            font-size: 12px;
            padding: 8px 10px;
          }
        }
      `}</style>
    </div>
  );
}
