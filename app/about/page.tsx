import Link from "next/link";

const features = [
  {
    title: "Check lab availability",
    text: "View available lab slots anytime, anywhere before deciding when to work.",
  },
  {
    title: "Reserve in advance",
    text: "Book slots early so you do not have to worry about losing a spot during busy weeks.",
  },
  {
    title: "Validate reservations",
    text: "Use the attendance flow to confirm that reserved lab slots are actually used.",
  },
  {
    title: "Support walk-ins",
    text: "No reservation? REEEserve can still help students find available lab space.",
  },
  {
    title: "Instructor tools",
    text: "Instructors can manage lab classes and help maximize room usage.",
  },
];

export default function AboutPage() {
  return (
    <div className="page">
      <nav className="nav">
        <Link href="/" className="logo">
          REEE<span>serve</span>
        </Link>

        <Link href="/" className="navLink">
          Back to home
        </Link>
      </nav>

      <main className="main">
        <section className="hero">
          <p className="eyebrow">About REEEserve</p>
          <h1>Welcome to REEEserve!</h1>
          <p className="heroText">
            REEEserve is a smart system built for laboratory management that aims
            to provide an efficient and straightforward way to allocate lab
            facilities to users, while also providing powerful administrative
            tools to handlers in order to maximize utilization of resources.
          </p>
        </section>

        <section className="section twoCol">
          <div>
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
              And so, we built REEEserve as our answer to that ever-present
              issue. Originally, as the name suggests, it was for students to
              reserve lab slots in advance, but we evolved the use to make it a
              dynamically allocating system that serves not only students, but
              instructors and lab handlers as well.
            </p>
          </div>
        </section>

        <section className="section">
          <div className="sectionHeader">
            <p className="sectionLabel">Features</p>
            <h2>What REEEserve helps you do</h2>
          </div>

          <div className="featureGrid">
            {features.map((feature, index) => (
              <article key={feature.title} className="featureCard">
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
          background: var(--background, #f5f5f5);
          color: var(--text, #111);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .nav {
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 28px;
          border-bottom: 1px solid var(--border, #eee);
          background: var(--surface, #fff);
          position: sticky;
          top: 0;
          z-index: 20;
        }

        .logo {
          font-size: 20px;
          font-weight: 800;
          text-decoration: none;
          color: var(--text, #111);
          letter-spacing: -0.5px;
        }

        .logo span {
          color: #185FA5;
        }

        .navLink {
          font-size: 13px;
          color: #185FA5;
          text-decoration: none;
          font-weight: 600;
        }

        .main {
          flex: 1;
          width: 100%;
          max-width: 1040px;
          margin: 0 auto;
          padding: 42px 28px 56px;
          box-sizing: border-box;
        }

        .hero {
          background:
            radial-gradient(circle at top right, rgba(24, 95, 165, 0.16), transparent 34%),
            var(--surface, #fff);
          border: 1px solid var(--border, #eee);
          border-radius: 24px;
          padding: 44px;
          box-shadow: 0 18px 50px rgba(15, 23, 42, 0.06);
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
          max-width: 720px;
          margin: 0;
          font-size: clamp(34px, 6vw, 58px);
          line-height: 1;
          letter-spacing: -2px;
        }

        .heroText {
          max-width: 760px;
          margin: 22px 0 0;
          font-size: 17px;
          line-height: 1.8;
          color: var(--muted-text, #666);
        }

        .section {
          margin-top: 24px;
          background: var(--surface, #fff);
          border: 1px solid var(--border, #eee);
          border-radius: 20px;
          padding: 32px;
        }

        .twoCol {
          display: grid;
          grid-template-columns: 0.85fr 1.15fr;
          gap: 36px;
          align-items: start;
        }

        h2 {
          margin: 0;
          font-size: 26px;
          line-height: 1.2;
          letter-spacing: -0.8px;
        }

        .textBlock {
          display: grid;
          gap: 14px;
        }

        .textBlock p {
          margin: 0;
          color: var(--muted-text, #666);
          font-size: 15px;
          line-height: 1.8;
        }

        .sectionHeader {
          margin-bottom: 20px;
        }

        .featureGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }

        .featureCard {
          min-height: 160px;
          padding: 20px;
          border-radius: 16px;
          border: 1px solid var(--border, #eee);
          background: var(--soft-surface, #fafafa);
          box-sizing: border-box;
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
          color: var(--muted-text, #666);
          font-size: 13px;
          line-height: 1.65;
        }

        .footer {
          padding: 14px 28px;
          border-top: 1px solid var(--border, #eee);
          background: var(--surface, #fff);
          display: flex;
          gap: 20px;
        }

        .footerLink {
          font-size: 13px;
          color: var(--muted-text, #888);
          text-decoration: none;
        }

        .footerLink.active {
          color: #185FA5;
          font-weight: 700;
        }

        @media (max-width: 760px) {
          .nav {
            padding: 0 20px;
          }

          .main {
            padding: 24px 16px 40px;
          }

          .hero {
            padding: 28px 22px;
            border-radius: 20px;
          }

          .section {
            padding: 24px 20px;
          }

          .twoCol {
            grid-template-columns: 1fr;
            gap: 18px;
          }

          .featureGrid {
            grid-template-columns: 1fr;
          }

          .footer {
            padding: 14px 20px;
          }
        }
      `}</style>
    </div>
  );
}
