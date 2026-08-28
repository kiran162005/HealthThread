import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api.js";
import Header from "../components/Header.jsx";
import DocumentExplanation from "../components/DocumentExplanation.jsx";
import { FileText, Stethoscope, ScanLine, ClipboardList } from "lucide-react";

const ENTRY_META = {
  document: { label: "Document", icon: FileText },
  symptom_check: { label: "Symptom Check", icon: Stethoscope },
  doctor_note: { label: "Doctor's Note", icon: ClipboardList },
  skin_check: { label: "Skin Check", icon: ScanLine },
};

export default function Timeline() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);

  const [expandedId, setExpandedId] = useState(null);
  const [explanations, setExplanations] = useState({});
  const [notesById, setNotesById] = useState(null);

  function loadTimeline() {
    setLoading(true);
    api
      .get("/patients/me/timeline")
      .then((res) => setEntries(res.data))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    api.get("/auth/me").then((res) => setMe(res.data));
    loadTimeline();
  }, []);

  async function fetchExplanation(docId) {
    setExplanations((prev) => ({ ...prev, [docId]: { loading: true } }));
    try {
      const res = await api.get(`/patients/me/documents/${docId}/explanation`);
      setExplanations((prev) => ({
        ...prev,
        [docId]: { loading: false, text: res.data.plain_explanation },
      }));
    } catch (err) {
      setExplanations((prev) => ({
        ...prev,
        [docId]: { loading: false, error: err.response?.data?.detail || "Could not load explanation." },
      }));
    }
  }

  async function toggleExplanation(entry) {
    const docId = entry.ref_id;
    if (expandedId === docId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(docId);
    if (!explanations[docId]) fetchExplanation(docId);
  }

  async function toggleNote(entry) {
    if (expandedId === entry.ref_id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(entry.ref_id);
    if (!notesById) {
      const res = await api.get("/patients/me/notes");
      const map = {};
      res.data.forEach((n) => { map[n.id] = n; });
      setNotesById(map);
    }
  }

  async function handleDelete(entry) {
    const label = entry.entry_type === "symptom_check" ? "symptom check" : "document";
    if (!window.confirm(`Delete this ${label}? This can't be undone.`)) return;
    try {
      const path =
        entry.entry_type === "symptom_check"
          ? `/patients/me/symptom-check/${entry.ref_id}`
          : `/patients/me/documents/${entry.ref_id}`;
      await api.delete(path);
      loadTimeline();
    } catch (err) {
      alert(err.response?.data?.detail || `Could not delete this ${label}.`);
    }
  }

  return (
    <div className="min-h-screen bg-page">
      <Header name={me?.full_name} role="patient" />

      <main className="max-w-2xl mx-auto px-6 py-10">
        <button
          onClick={() => navigate("/patient")}
          className="flex items-center gap-1.5 text-sm text-ink/60 hover:text-primary border border-line hover:border-primary/40 rounded-lg px-3 py-1.5 mb-5 transition"
        >
          <span className="text-base leading-none">←</span> Back to dashboard
        </button>

        <h1 className="font-display text-2xl text-ink mb-1">Your Timeline</h1>
        <p className="text-sm text-ink/50 mb-8">
          Every report, note, and check-in, in one place.
        </p>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-ink/40 py-8">
            <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            Loading your timeline…
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="text-center py-16 border border-dashed border-line rounded-2xl">
            <p className="text-ink/50 text-sm">
              Nothing here yet — upload a report from the dashboard to get started.
            </p>
          </div>
        )}

        {!loading && entries.length > 0 && (
          <ol className="relative">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-line" />

            {entries.map((e) => {
              const isDoc = e.entry_type === "document";
              const isSymptomCheck = e.entry_type === "symptom_check";
              const isNote = e.entry_type === "doctor_note";
              const isDeletable = isDoc || isSymptomCheck;
              const isClickable = isDoc || isNote;
              const isExpanded = expandedId === e.ref_id;
              const meta = ENTRY_META[e.entry_type] || { label: e.entry_type, icon: FileText };
              const EntryIcon = meta.icon;

              return (
                <li key={e.id} className="relative pl-8 pb-7 last:pb-0">
                  <span className="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-sage/15 border-2 border-sage flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-sage" />
                  </span>

                  <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm">
                    <div
                      className={`px-4 py-3 ${isClickable ? "cursor-pointer hover:bg-page/60" : ""} transition`}
                      onClick={isDoc ? () => toggleExplanation(e) : isNote ? () => toggleNote(e) : undefined}
                    >
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <span className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wide text-primary/70">
                          <EntryIcon size={12} strokeWidth={2.25} />
                          {meta.label}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] font-mono text-ink/35">
                            {new Date(e.occurred_at).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                          {isDeletable && (
                            <button
                              onClick={(ev) => {
                                ev.stopPropagation();
                                handleDelete(e);
                              }}
                              className="text-xs font-medium text-red-500 hover:text-white hover:bg-red-500 border border-red-200 hover:border-red-500 rounded-md px-2 py-0.5 transition"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm text-ink">{e.summary}</p>
                        {isDoc && (
                          <span className="text-xs text-primary/60 shrink-0">
                            {isExpanded ? "Hide explanation ▲" : "View explanation ▾"}
                          </span>
                        )}
                        {isNote && (
                          <span className="text-xs text-primary/60 shrink-0">
                            {isExpanded ? "Hide note ▲" : "Read note ▾"}
                          </span>
                        )}
                      </div>
                    </div>

                    {isDoc && isExpanded && (
                      <div className="px-4 py-3 bg-page/50 border-t border-line">
                        <DocumentExplanation
                          documentId={e.ref_id}
                          explanation={explanations[e.ref_id]}
                        />
                      </div>
                    )}
                    {isNote && isExpanded && (
                      <div className="px-4 py-3 bg-page/50 border-t border-line text-sm text-ink/80">
                        {notesById ? (notesById[e.ref_id]?.note || "Note not found.") : "Loading…"}
                      </div>
                    )}
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