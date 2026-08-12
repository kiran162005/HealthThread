import { useEffect, useState } from "react";
import api from "../api.js";

export default function ShareAccessPanel({ onClose }) {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [granting, setGranting] = useState(false);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    api
      .get("/patients/me/share")
      .then((res) => setShares(res.data))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleGrant(e) {
    e.preventDefault();
    setError("");
    setGranting(true);
    try {
      await api.post("/patients/me/share", { doctor_email: email });
      setEmail("");
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not grant access — check the email.");
    } finally {
      setGranting(false);
    }
  }

  async function handleRevoke(doctorId) {
    if (!window.confirm("Revoke this doctor's access to your timeline?")) return;
    await api.delete(`/patients/me/share/${doctorId}`);
    load();
  }

  return (
    <div className="bg-white border border-line rounded-2xl p-6 mb-8">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display text-lg text-ink">Share Access</h2>
        <button onClick={onClose} className="text-xs text-ink/40 hover:text-primary transition">
          Close
        </button>
      </div>
      <p className="text-xs text-ink/40 mb-4">
        Connecting a doctor here doesn't share anything by itself — choose specific records to share from Medical Records afterward.
      </p>

      <form onSubmit={handleGrant} className="flex gap-2 mb-5">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="doctor@example.com"
          required
          className="flex-1 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
        />
        <button
          type="submit"
          disabled={granting}
          className="bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg px-4 py-2 transition disabled:opacity-50 shrink-0"
        >
          {granting ? "Sharing…" : "Grant access"}
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {loading && <p className="text-sm text-ink/40">Loading…</p>}

      {!loading && shares.length === 0 && (
        <p className="text-sm text-ink/40">No doctors have access yet.</p>
      )}

      {!loading && shares.length > 0 && (
        <ul className="space-y-2">
          {shares.map((s) => (
            <li
              key={s.doctor_id}
              className="flex items-center justify-between bg-page/60 border border-line rounded-lg px-3 py-2"
            >
              <div>
                <p className="text-sm text-ink font-medium">{s.doctor_name}</p>
                <p className="text-xs text-ink/40 font-mono">{s.doctor_email}</p>
              </div>
              <button
                onClick={() => handleRevoke(s.doctor_id)}
                className="text-xs font-medium text-red-500 hover:text-white hover:bg-red-500 border border-red-200 hover:border-red-500 rounded-md px-2 py-1 transition"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}