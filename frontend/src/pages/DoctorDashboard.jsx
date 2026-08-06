import { useEffect, useState } from "react";
import api from "../api.js";

export default function DoctorDashboard() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/doctors/me/patients")
      .then((res) => setPatients(res.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <h1 className="text-2xl font-semibold text-slate-800 mb-6">My Patients</h1>

      {loading && <p className="text-slate-500">Loading…</p>}
      {!loading && patients.length === 0 && (
        <p className="text-slate-500">No patients have shared access with you yet.</p>
      )}

      <ul className="space-y-3">
        {patients.map((p) => (
          <li key={p.id} className="bg-white rounded-lg shadow-sm p-4 border border-slate-100">
            <p className="text-slate-800 font-medium">{p.full_name}</p>
            <p className="text-sm text-slate-400">{p.email}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}