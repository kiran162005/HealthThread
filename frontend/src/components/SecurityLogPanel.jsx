import { useEffect, useState } from "react";
import api from "../api.js";

const ACTION_LABELS = {
  view_timeline: "Viewed your timeline",
  add_note: "Added a note",
  grant_access: "You granted access",
  revoke_access: "You revoked access",
  delete_document: "You deleted a document",
};

export default function SecurityLogPanel({ onClose }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/patients/me/audit-log")
      .then((res) => setEntries(res.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-white border border-line rounded-2xl p-6 mb-8">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display text-lg text-ink">Security Log</h2>
        <button onClick={onClose} className="text-xs text-ink/40 hover:text-primary transition">
          Close
        </button>
      </div>
      <p className="text-xs text-ink/40 mb-4">
        Who accessed your data, and when. Backed by a tamper-evident, hash-chained record.
      </p>

      {loading && <p className="text-sm text-ink/40">Loading…</p>}

      {!loading && entries.length === 0 && (
        <p className="text-sm text-ink/40">No activity recorded yet.</p>
      )}

      {!loading && entries.length > 0 && (
        <ul className="space-y-1.5">
          {entries.map((e, i) => (
            <li
              key={i}
              className="flex items-center justify-between text-sm bg-page/60 border border-line rounded-lg px-3 py-2"
            >
              <span className="text-ink">
                <span className="font-medium">{e.actor_name}</span>{" "}
                <span className="text-ink/50">({e.actor_role})</span> —{" "}
                {ACTION_LABELS[e.action] || e.action}
              </span>
              <span className="text-xs font-mono text-ink/35 shrink-0 ml-3">
                {new Date(e.occurred_at).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}