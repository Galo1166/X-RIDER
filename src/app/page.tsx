import {
  Apple,
  Bike,
  Download,
  Gauge,
  Headset,
  Play,
  Star,
  Truck,
  UserRound,
} from "lucide-react";

const navItems = [
  { label: "Services", href: "#" },
  { label: "How It Works", href: "#" },
  { label: "Drive / Earn with Us", href: "/rider" },
  { label: "Business Solutions", href: "#" },
  { label: "Safety", href: "#" },
];

const metrics = [
  { value: "12K+", label: "active riders" },
  { value: "3.2 min", label: "avg. pickup" },
  { value: "99.8%", label: "on-time dispatch" },
];

const serviceCards = [
  {
    icon: Truck,
    title: "Urgent Document Runs",
    description: "Legal, pharmacy, and executive hand-offs across the city with live route confirmation.",
  },
  {
    icon: Gauge,
    title: "Rapid Retail Delivery",
    description: "From same-day pastry drops to last-mile inventory restocks in under 15 minutes.",
  },
  {
    icon: Headset,
    title: "Business Concierge",
    description: "On-demand dispatch support for teams, property managers, and hospitality operations.",
  },
];

const steps = [
  {
    number: "01",
    title: "Choose a route",
    detail: "Select your pickup, destination, and urgency level in under 30 seconds.",
  },
  {
    number: "02",
    title: "Track in real time",
    detail: "Watch your rider move on a live map and receive status updates as they arrive.",
  },
  {
    number: "03",
    title: "Deliver with confidence",
    detail: "Receive an instant handoff confirmation and keep every critical delivery protected.",
  },
];

const reviews = [
  {
    name: "Sarah Kendrick",
    role: "Partner, Veloce Legal LLP",
    quote:
      "We had crucial closing contracts stranded in midtown during 5 PM rush hour... X-RIDER had it in the partner's hands in 11 minutes flat.",
    initials: "SK",
  },
  {
    name: "David Miller",
    role: "Owner, Artisanal Crust Co.",
    quote:
      "Integrating the X-RIDER API for our boutique bakery was effortless. Customers get an interactive live link showing the motorcycle zooming with their fresh pastries.",
    initials: "DM",
  },
  {
    name: "Elena Rostova",
    role: "Tech Founder & Speaker",
    quote:
      "I left my laptop charger before an international keynote. Booked a rider through X-RIDER and watched him weave through traffic like lightning.",
    initials: "ER",
  },
];

export default function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-shell landing-header-inner">
          <div className="landing-brand" aria-label="X-RIDER home">
            <span className="landing-logo-mark" aria-hidden="true">X</span>
            <span className="landing-brand-text">X-RIDER</span>
          </div>

          <nav className="landing-nav" aria-label="Main navigation">
            {navItems.map(({ label, href }) => (
              <a key={label} href={href} className="landing-nav-link">
                {label}
              </a>
            ))}
          </nav>

          <div className="landing-actions">
            <a href="/login" className="landing-login-link">
              Log In
            </a>
            <a href="/login" className="landing-primary-button">
              Download App
            </a>
            <div className="landing-avatar" aria-label="Profile avatar">
              <UserRound aria-hidden="true" size={18} />
            </div>
          </div>
        </div>
      </header>

      <main className="landing-main">
        <section className="hero-section">
          <div className="hero-glow hero-glow-left" aria-hidden="true" />
          <div className="hero-glow hero-glow-right" aria-hidden="true" />

          <div className="landing-shell hero-shell">
            <div className="hero-copy">
              <div className="hero-badge">
                <span className="hero-badge-dot" />
                Live Dispatch Active in Metropolitan Area
              </div>

              <h1 className="hero-title">
                Lightning-Fast <span className="hero-title-accent">Urban Courier &amp; Rider</span> Dispatch
              </h1>

              <p className="hero-text">
                Send high-priority documents, retail packages, or dispatch on-demand electric motorcycle
                couriers with live GPS radar tracking and guaranteed sub-15 minute doorstep handoff.
              </p>

              <div className="hero-actions-row">
                <a href="/login" className="landing-primary-button">
                  <Download aria-hidden="true" size={20} />
                  Download App
                </a>
                <a href="/login" className="landing-secondary-button">
                  Book a Courier
                </a>
              </div>

              <div className="hero-metrics" aria-label="Key performance metrics">
                {metrics.map((metric) => (
                  <div key={metric.label} className="metric-item">
                    <strong>{metric.value}</strong>
                    <span>{metric.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="hero-visual" aria-label="X-RIDER live dispatch preview">
              <div className="preview-card">
                <div className="preview-header">
                  <div>
                    <span className="preview-label">Live route</span>
                    <strong>Downtown Express</strong>
                  </div>
                  <span className="preview-pill">ETA 08:42</span>
                </div>

                <div className="map-box" aria-hidden="true">
                  <div className="map-grid" />
                  <div className="route route-a" />
                  <div className="route route-b" />
                  <div className="map-pin pin-start" />
                  <div className="map-pin pin-end" />
                  <div className="rider-mark">
                    <Bike aria-hidden="true" size={30} />
                  </div>
                </div>

                <div className="driver-row">
                  <div className="driver-avatar">AM</div>
                  <div className="driver-meta">
                    <strong>Amir M.</strong>
                    <span>3.1 miles away</span>
                  </div>
                  <span className="driver-status">On route</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="trust-section">
          <div className="landing-shell trust-shell">
            <div className="section-label">Trusted by teams that move fast</div>
            <div className="trust-logos" aria-label="Brand partners">
              <span>Veloce Legal</span>
              <span>Northstar Labs</span>
              <span>Urban Leaf</span>
              <span>Madrid Fresh</span>
              <span>Nova Events</span>
            </div>
          </div>
        </section>

        <section className="features-section">
          <div className="landing-shell">
            <div className="section-heading">
              <span className="section-kicker">Urban delivery, simplified</span>
              <h2>Everything your business needs to move critical items with confidence.</h2>
            </div>

            <div className="feature-grid">
              {serviceCards.map(({ icon: Icon, title, description }) => (
                <article key={title} className="feature-card">
                  <div className="feature-icon">
                    <Icon aria-hidden="true" size={28} />
                  </div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="steps-section">
          <div className="landing-shell steps-shell">
            <div className="section-heading slim">
              <span className="section-kicker">How it works</span>
              <h2>From dispatch request to doorstep handoff in three easy steps.</h2>
            </div>

            <div className="steps-grid">
              {steps.map(({ number, title, detail }) => (
                <div key={number} className="step-card">
                  <span className="step-number">{number}</span>
                  <h3>{title}</h3>
                  <p>{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="reviews-section">
          <div className="landing-shell">
            <div className="section-heading slim">
              <span className="section-kicker">Client stories</span>
              <h2>Operations teams love the speed, visibility, and reliability.</h2>
            </div>

            <div className="reviews-grid">
              {reviews.map(({ name, role, quote, initials }) => (
                <article key={name} className="review-card">
                  <div className="review-stars" aria-label="Five star rating">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Star key={`${name}-${index}`} aria-hidden="true" size={18} fill="currentColor" />
                    ))}
                  </div>
                  <p className="review-quote">“{quote}”</p>
                  <div className="review-person">
                    <div className="review-avatar">{initials}</div>
                    <div>
                      <strong>{name}</strong>
                      <span>{role}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="download-section">
          <div className="landing-shell">
            <div className="download-banner">
              <div className="download-copy">
                <div className="download-pill">
                  <Gauge aria-hidden="true" size={18} />
                  Zero Lag Mobility
                </div>
                <h2>Experience the city’s fastest dispatch in your pocket.</h2>
                <p>
                  Download the X-RIDER App on iOS or Android. Track couriers on live radar, save favorite
                  corporate addresses, and dispatch within 2 taps.
                </p>
                <div className="store-actions">
                  <a href="/login" className="store-button">
                    <Apple aria-hidden="true" size={22} />
                    <span>
                      <small>Download on</small>
                      <strong>Apple App Store</strong>
                    </span>
                  </a>
                  <a href="/login" className="store-button">
                    <Play aria-hidden="true" size={22} />
                    <span>
                      <small>Get it on</small>
                      <strong>Google Play</strong>
                    </span>
                  </a>
                </div>
              </div>

              <div className="qr-card" aria-label="QR code app install card">
                <div className="qr-box">
                  <svg viewBox="0 0 100 100" aria-hidden="true">
                    <path d="M0,0 h30 v30 h-30 z M10,10 h10 v10 h-10 z" />
                    <path d="M70,0 h30 v30 h-30 z M80,10 h10 v10 h-10 z" />
                    <path d="M0,70 h30 v30 h-30 z M10,80 h10 v10 h-10 z" />
                    <rect x="45" y="10" width="10" height="20" />
                    <rect x="40" y="40" width="20" height="20" />
                    <rect x="70" y="45" width="20" height="10" />
                    <rect x="10" y="45" width="20" height="10" />
                    <rect x="45" y="70" width="10" height="20" />
                    <rect x="70" y="70" width="20" height="20" />
                  </svg>
                </div>
                <span className="qr-title">Scan to Install Now</span>
                <span className="qr-subtitle">iOS &amp; Android Compatible</span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
