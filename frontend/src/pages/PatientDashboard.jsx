import { useEffect, useState } from "react";
import api from "../api.js";

export default function PatientDashboard() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/patients/me/timeline")
      .then((res) => setEntries(res.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <h1 className="text-2xl font-semibold text-slate-800 mb-6">Your Timeline</h1>

      {loading && <p className="text-slate-500">Loading…</p>}
      {!loading && entries.length === 0 && (
        <p className="text-slate-500">Nothing here yet — upload a report to get started.</p>
      )}

      <ul className="space-y-3">
        {entries.map((e) => (
          <li key={e.id} className="bg-white rounded-lg shadow-sm p-4 border border-slate-100">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">{e.entry_type}</p>
                <p className="text-slate-800">{e.summary}</p>
              </div>
              <span className="text-xs text-slate-400">
                {new Date(e.occurred_at).toLocaleDateString()}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}