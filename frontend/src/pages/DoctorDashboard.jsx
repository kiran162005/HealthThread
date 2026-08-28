import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api.js";
import Header from "../components/Header.jsx";

function initials(name) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function timeAgo(dateStr) {
  if (!dateStr) return null;
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export default function DoctorDashboard() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/auth/me").then((res) => setMe(res.data));
    api
      .get("/doctors/me/patients")
      .then((res) => setPatients(res.data))
      .finally(() => setLoading(false));
  }, []);

  const filtered = patients.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-page">
      <Header name={me?.full_name} role="doctor" />

      <main className="max-w-2xl mx-auto px-6 py-10">
                <h1 className="font-display text-2xl text-ink mb-1">
          {me ? `Welcome back, ${me.full_name.split(" ").slice(-1)[0]}` : "My Patients"}
        </h1>
        <p className="text-sm text-ink/50 mb-5">
          Patients who've shared timeline access with you.
        </p>

        {!loading && patients.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-white border border-line rounded-xl px-4 py-3">
              <p className="font-display text-xl text-ink">{patients.length}</p>
              <p className="text-xs text-ink/45">
                {patients.length === 1 ? "Patient" : "Patients"}
              </p>
            </div>
            <div className="bg-white border border-line rounded-xl px-4 py-3">
              <p className="font-display text-xl text-ink">
                {patients.reduce((sum, p) => sum + p.shared_document_count, 0)}
              </p>
              <p className="text-xs text-ink/45">Shared docs</p>
            </div>
            <div className="bg-white border border-line rounded-xl px-4 py-3">
              <p className="font-display text-xl text-primary">
                {patients.reduce((sum, p) => sum + p.new_items_count, 0)}
              </p>
              <p className="text-xs text-ink/45">New items</p>
            </div>
          </div>
        )}

      

        {!loading && patients.length > 0 && (
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full border border-line rounded-lg px-3 py-2 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
          />
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-ink/40 py-8">
            <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            Loading your patients…
          </div>
        )}

        {!loading && patients.length === 0 && (
          <div className="text-center py-16 border border-dashed border-line rounded-2xl">
            <p className="text-ink/50 text-sm">
              No patients have shared access with you yet.
            </p>
          </div>
        )}

        {!loading && patients.length > 0 && filtered.length === 0 && (
          <div className="text-center py-12 border border-dashed border-line rounded-2xl">
            <p className="text-ink/50 text-sm">No patients match "{query}".</p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <ul className="space-y-2">
            {filtered.map((p) => (
              <li
                key={p.id}
                onClick={() => navigate(`/doctor/patients/${p.id}`)}
                className="bg-white border border-line hover:border-primary/40 hover:shadow-sm rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer transition"
              >
                <span className="w-9 h-9 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0">
                  {initials(p.full_name)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-ink font-medium truncate">{p.full_name}</p>
                    {p.new_items_count > 0 && (
                      <span className="text-[10px] font-semibold bg-primary/10 text-primary rounded-full px-1.5 py-0.5 shrink-0">
                        {p.new_items_count} new
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ink/40 font-mono truncate">{p.email}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-ink/45">
                    {p.shared_document_count} doc{p.shared_document_count === 1 ? "" : "s"}
                  </p>
                  <p className="text-[11px] text-ink/30">{timeAgo(p.last_activity_at)}</p>
                </div>
                <span className="text-ink/25">→</span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}