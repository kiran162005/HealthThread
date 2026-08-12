import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api.js";
import Header from "../components/Header.jsx";


const ENTRY_LABELS = {
  document: "Document",
  symptom_check: "Symptom Check",
  doctor_note: "Doctor's Note",
  skin_check: "Skin Check",
};

export default function DoctorPatientView() {
  const { patientId } = useParams();
  const navigate = useNavigate();

  const [me, setMe] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openingFileId, setOpeningFileId] = useState(null);

  const [notes, setNotes] = useState([]);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  function loadTimeline() {
    setLoading(true);
    api
      .get(`/doctors/me/patients/${patientId}/timeline`)
      .then((res) => setEntries(res.data))
      .finally(() => setLoading(false));
  }

  function loadNotes() {
    api.get(`/doctors/me/patients/${patientId}/notes`).then((res) => setNotes(res.data));
  }

  useEffect(() => {
    api.get("/auth/me").then((res) => setMe(res.data));
    loadTimeline();
    loadNotes();
  }, [patientId]);

  async function handleViewFile(entry) {
    const docId = entry.ref_id;
    setOpeningFileId(docId);
    try {
      const res = await api.get(`/doctors/me/patients/${patientId}/documents/${docId}/file`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank");
    } catch (err) {
      alert(err.response?.data?.detail || "Could not open this document.");
    } finally {
      setOpeningFileId(null);
    }
  }

  async function handleAddNote(e) {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      await api.post(`/doctors/me/patients/${patientId}/notes`, { note: noteText.trim() });
      setNoteText("");
      loadNotes();
      loadTimeline();
    } catch (err) {
      alert(err.response?.data?.detail || "Could not save note.");
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <div className="min-h-screen bg-page">
      <Header name={me?.full_name} role="doctor" />

      <main className="max-w-2xl mx-auto px-6 py-10">
        <button
          onClick={() => navigate("/doctor")}
          className="flex items-center gap-1.5 text-sm text-ink/60 hover:text-primary border border-line hover:border-primary/40 rounded-lg px-3 py-1.5 mb-6 transition"
        >
          <span className="text-base leading-none">←</span> Back to patients
        </button>

        <h1 className="font-display text-2xl text-ink mb-1">Patient Timeline</h1>
        <p className="text-sm text-ink/50 mb-8">
          Read-only view — access granted by the patient, logged in the audit trail.
        </p>

        {/* Add note */}
        <form onSubmit={handleAddNote} className="bg-white border border-line rounded-2xl p-5 mb-6 space-y-3">
          <label className="block text-xs font-medium text-ink/60">Add a note to this patient's record</label>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
            placeholder="Observations, follow-up recommendations…"
            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition resize-none"
          />
          <button
            type="submit"
            disabled={savingNote || !noteText.trim()}
            className="bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg px-4 py-2 transition disabled:opacity-50"
          >
            {savingNote ? "Saving…" : "Add note"}
          </button>
        </form>

        {notes.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xs font-mono uppercase tracking-wide text-primary/70 mb-2">
              Notes on this patient
            </h2>
            <ul className="space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="bg-white border border-line rounded-lg px-3 py-2">
                  <p className="text-sm text-ink">{n.note}</p>
                  <p className="text-xs text-ink/35 font-mono mt-1">
                    {new Date(n.created_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Timeline */}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-ink/40 py-8">
            <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            Loading timeline…
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="text-center py-16 border border-dashed border-line rounded-2xl">
            <p className="text-ink/50 text-sm">Nothing in this patient's timeline yet.</p>
          </div>
        )}

        {!loading && entries.length > 0 && (
          <ol className="relative">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-line" />

            {entries.map((e) => {
              const isDoc = e.entry_type === "document";
              const opening = openingFileId === e.ref_id;

              return (
                <li key={e.id} className="relative pl-8 pb-7 last:pb-0">
                  <span className="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-white border-2 border-sage flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-sage" />
                  </span>

                  <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm">
                    <div
                      className={`px-4 py-3 ${isDoc ? "cursor-pointer hover:bg-page/60" : ""} transition`}
                      onClick={isDoc ? () => handleViewFile(e) : undefined}
                    >
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <span className="text-[11px] font-mono uppercase tracking-wide text-primary/70">
                          {ENTRY_LABELS[e.entry_type] || e.entry_type}
                        </span>
                        <span className="text-[11px] font-mono text-ink/35">
                          {new Date(e.occurred_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm text-ink">{e.summary}</p>
                        {isDoc && (
                          <span className="text-xs text-primary/60 shrink-0">
                            {opening ? "Opening…" : "View original document ↗"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </main>
    </div>
  );
}