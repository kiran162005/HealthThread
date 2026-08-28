import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";

function ThreadHero() {
  return (
    <svg
      viewBox="0 0 640 200"
      className="w-full h-auto max-w-2xl mx-auto"
      role="img"
      aria-label="Scattered health records resolving into one organized thread"
    >
      <path
        d="M 20 60 Q 90 20, 150 90 T 260 70 Q 320 130, 380 100 L 620 100"
        fill="none"
        stroke="url(#threadGradient)"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="thread-path"
      />
      <defs>
        <linearGradient id="threadGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#7FB8A4" />
          <stop offset="55%" stopColor="#3E7CA6" />
          <stop offset="100%" stopColor="#0F4C75" />
        </linearGradient>
      </defs>

      {/* Scattered cards — a WhatsApp photo, a printout, a prescription */}
      <g transform="translate(20,60) rotate(-18)">
        <rect x="-16" y="-12" width="34" height="24" rx="3" fill="white" stroke="#E2E8F0" strokeWidth="1.5" />
        <line x1="-9" y1="-4" x2="9" y2="-4" stroke="#CBD5E0" strokeWidth="1.5" />
        <line x1="-9" y1="1" x2="4" y2="1" stroke="#CBD5E0" strokeWidth="1.5" />
      </g>
      <g transform="translate(150,90) rotate(12)">
        <rect x="-16" y="-12" width="34" height="24" rx="3" fill="white" stroke="#E2E8F0" strokeWidth="1.5" />
        <line x1="-9" y1="-4" x2="9" y2="-4" stroke="#CBD5E0" strokeWidth="1.5" />
        <line x1="-9" y1="1" x2="4" y2="1" stroke="#CBD5E0" strokeWidth="1.5" />
      </g>
      <g transform="translate(260,70) rotate(-8)">
        <rect x="-16" y="-12" width="34" height="24" rx="3" fill="white" stroke="#E2E8F0" strokeWidth="1.5" />
        <line x1="-9" y1="-4" x2="9" y2="-4" stroke="#CBD5E0" strokeWidth="1.5" />
        <line x1="-9" y1="1" x2="4" y2="1" stroke="#CBD5E0" strokeWidth="1.5" />
      </g>

      {/* Aligned nodes — the organized timeline */}
      <circle cx="380" cy="100" r="5" fill="#3E7CA6" />
      <circle cx="460" cy="100" r="5" fill="#0F4C75" />
      <circle cx="540" cy="100" r="5" fill="#0F4C75" />
      <circle cx="620" cy="100" r="6" fill="#0A3A5C" />

      <style>{`
        .thread-path {
          stroke-dasharray: 900;
          stroke-dashoffset: 900;
          animation: draw-thread 1.4s ease-out forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .thread-path { animation: none; stroke-dashoffset: 0; }
        }
        @keyframes draw-thread {
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </svg>
  );
}

const FEATURES = [
  {
    label: "Timeline",
    desc: "Every report and prescription, extracted and organized chronologically — not buried in a camera roll.",
  },
  {
    label: "Symptom Checker",
    desc: "Describe what's going on. The agent asks smart follow-ups and reasons using your real history, not a blank slate.",
  },
  {
    label: "Skin Check",
    desc: "Upload a photo of a skin concern for a preliminary, confidence-scored read — a flag, never a diagnosis.",
  },
  {
    label: "Share Access",
    desc: "Grant a specific doctor access to your timeline, and revoke it just as easily. Every view is logged.",
  },
];

export default function Home() {
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const role = localStorage.getItem("role");
    if (token && role) {
      navigate(role === "doctor" ? "/doctor" : "/patient", { replace: true });
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-page">
      <nav className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
        <span className="font-display text-xl text-primary tracking-tight">HealthThread</span>
        <Link
          to="/login"
          className="text-sm font-medium text-ink/60 hover:text-primary transition"
        >
          Sign in
        </Link>
      </nav>

      <header className="max-w-3xl mx-auto px-6 pt-10 pb-4 text-center">
        <p className="font-mono text-xs tracking-widest text-primary/70 uppercase mb-4">
          Personal health records, threaded together
        </p>
        <h1 className="font-display text-4xl sm:text-5xl text-ink leading-tight tracking-tight">
          Every report, symptom, and photo —<br className="hidden sm:block" /> one organized thread.
        </h1>
        <p className="text-ink/55 text-base sm:text-lg mt-5 max-w-xl mx-auto leading-relaxed">
          HealthThread doesn't ask you to start over every time. It reasons about new symptoms
          and explains new documents using your actual medical history — not just what you
          type in that moment.
        </p>
        <div className="mt-8">
          <Link
            to="/login"
            className="inline-block bg-primary hover:bg-primary-dark text-white font-medium text-sm rounded-lg px-6 py-3 transition"
          >
            Get started
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8">
        <ThreadHero />
      </div>

      <section className="max-w-4xl mx-auto px-6 py-16">
        <div className="grid sm:grid-cols-2 gap-5">
          {FEATURES.map((f) => (
            <div
              key={f.label}
              className="bg-white border border-line rounded-2xl p-5 hover:border-primary/30 transition"
            >
              <p className="font-display text-base text-ink mb-1.5">{f.label}</p>
              <p className="text-sm text-ink/55 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-sage/10 border-y border-sage/20">
        <div className="max-w-4xl mx-auto px-6 py-14">
          <p className="font-mono text-xs tracking-widest text-primary/70 uppercase mb-3">
            Built on real security, not a promise
          </p>
          <h2 className="font-display text-2xl text-ink mb-6">
            Your documents are encrypted before they're stored — and every access is logged.
          </h2>
          <div className="grid sm:grid-cols-3 gap-6 text-sm">
            <div>
              <p className="font-medium text-ink mb-1">AES-256-GCM encryption</p>
              <p className="text-ink/55 leading-relaxed">
                Documents are encrypted at rest. Nothing sits on the server as plaintext.
              </p>
            </div>
            <div>
              <p className="font-medium text-ink mb-1">Tamper-evident audit log</p>
              <p className="text-ink/55 leading-relaxed">
                Every access is hash-chained — a retroactive edit to the log is detectable.
              </p>
            </div>
            <div>
              <p className="font-medium text-ink mb-1">Granular sharing</p>
              <p className="text-ink/55 leading-relaxed">
                Share specific documents with a specific doctor. Revoke access anytime.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="max-w-4xl mx-auto px-6 py-10 text-center">
        <p className="text-xs text-ink/35">
          HealthThread is a portfolio project. Doctor accounts are simulated for demonstration.
        </p>
      </footer>
    </div>
  );
}