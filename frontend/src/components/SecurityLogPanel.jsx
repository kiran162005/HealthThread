import { useEffect, useState } from "react";
import api from "../api.js";
import { ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";

const ACTION_LABELS = {
  view_timeline: "Viewed your timeline",
  add_note: "Added a note",
  grant_access: "You granted access",
  revoke_access: "You revoked access",
  delete_document: "You deleted a document",
};

const BREAK_REASON_LABELS = {
  hash_mismatch: "an entry's contents don't match its recorded hash",
  bad_signature: "an entry's signature doesn't match its actor's key",
};

export default function SecurityLogPanel({ onClose }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const [verifyResult, setVerifyResult] = useState(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    api
      .get("/patients/me/audit-log")
      .then((res) => setEntries(res.data))
      .finally(() => setLoading(false));
  }, []);

  async function handleVerify() {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await api.get("/patients/me/audit-log/verify");
      setVerifyResult(res.data);
    } catch {
      setVerifyResult({ valid: false, error: true });
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="bg-white border border-line rounded-2xl p-6 mb-8">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display text-lg text-ink">Security Log</h2>
        <button onClick={onClose} className="text-xs text-ink/40 hover:text-primary transition">
          Close
        </button>
      </div>
      <p className="text-xs text-ink/40 mb-4">
        Who accessed your data, and when. Backed by a tamper-evident, hash-chained,
        ECDSA-signed record.
      </p>

      <button
        onClick={handleVerify}
        disabled={verifying}
        className="flex items-center gap-1.5 text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary rounded-lg px-3 py-1.5 mb-4 transition disabled:opacity-60"
      >
        {verifying ? (
          <>
            <Loader2 size={13} className="animate-spin" />
            Verifying…
          </>
        ) : (
          <>
            <ShieldCheck size={13} />
            Verify log integrity
          </>
        )}
      </button>

      {verifyResult && !verifyResult.error && (
        <div
          className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 mb-4 ${
            verifyResult.valid
              ? "bg-sage/10 border border-sage/30 text-ink/80"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}
        >
          {verifyResult.valid ? (
            <ShieldCheck size={14} className="shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert size={14} className="shrink-0 mt-0.5" />
          )}
          <span>
            {verifyResult.valid
              ? `Verified — all ${verifyResult.entries_checked} entries are unbroken and correctly signed.`
              : `Tampering detected — entry #${verifyResult.broken_at_index + 1} fails because ${
                  BREAK_REASON_LABELS[verifyResult.broken_reason] || verifyResult.broken_reason
                }.`}
          </span>
        </div>
      )}
      {verifyResult?.error && (
        <p className="text-xs text-red-600 mb-4">Couldn't run verification — try again.</p>
      )}

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