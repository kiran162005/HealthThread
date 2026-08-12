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

export default function DoctorDashboard() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/auth/me").then((res) => setMe(res.data));
    api
      .get("/doctors/me/patients")
      .then((res) => setPatients(res.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-page">
      <Header name={me?.full_name} role="doctor" />

      <main className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="font-display text-2xl text-ink mb-1">My Patients</h1>
        <p className="text-sm text-ink/50 mb-8">
          Patients who've shared timeline access with you.
        </p>

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

        {!loading && patients.length > 0 && (
          <ul className="space-y-2">
            {patients.map((p) => (
              <li
                key={p.id}
                onClick={() => navigate(`/doctor/patients/${p.id}`)}
                className="bg-white border border-line hover:border-primary/40 hover:shadow-sm rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer transition"
              >
                <span className="w-9 h-9 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0">
                  {initials(p.full_name)}
                </span>
                <div className="flex-1">
                  <p className="text-sm text-ink font-medium">{p.full_name}</p>
                  <p className="text-xs text-ink/40 font-mono">{p.email}</p>
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