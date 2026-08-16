import { useEffect, useState } from "react";
import api from "../api.js";
import Header from "../components/Header.jsx";
import DocumentExplanation from "../components/DocumentExplanation.jsx";
import ShareAccessPanel from "../components/ShareAccessPanel.jsx";
import SecurityLogPanel from "../components/SecurityLogPanel.jsx";
import { useNavigate } from "react-router-dom";

const ENTRY_LABELS = {
  document: "Document",
  symptom_check: "Symptom Check",
  doctor_note: "Doctor's Note",
  skin_check: "Skin Check",
};

export default function PatientDashboard() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);

  const [showUpload, setShowUpload] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showSecurityLog, setShowSecurityLog] = useState(false);
  const [docType, setDocType] = useState("report");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [saveToRecords, setSaveToRecords] = useState(false);

  // shown immediately after a successful upload, before it settles into the timeline
  const [justUploadedId, setJustUploadedId] = useState(null);

  // explanation panel state for timeline entries, keyed by document id
  const [expandedId, setExpandedId] = useState(null);
  const [explanations, setExplanations] = useState({}); // { [docId]: { loading, text, error } }
  const [notesById, setNotesById] = useState(null); // fetched lazily on first note click

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

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setUploadError("");

    const formData = new FormData();
    formData.append("doc_type", docType);
    formData.append("file", file);
    formData.append("save_to_records", saveToRecords);

    try {
      const res = await api.post("/patients/me/documents", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setFile(null);
      setShowUpload(false);
      setSaveToRecords(false);
      loadTimeline();

      // show the explanation right away instead of making them find it in the timeline
      const newDocId = res.data.id;
      setJustUploadedId(newDocId);
      fetchExplanation(newDocId);
    } catch (err) {
      setUploadError(err.response?.data?.detail || "Upload failed — try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="min-h-screen bg-page">
      <Header name={me?.full_name} role="patient" />

      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="font-display text-2xl text-ink mb-1">Your Timeline</h1>
            <p className="text-sm text-ink/50">
              Every report, note, and check-in, in one place.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => navigate("/patient/records")}
              className="bg-white border border-line hover:border-primary/40 text-ink/70 text-sm font-medium rounded-lg px-3 py-2 transition"
            >
              Medical Records
            </button>
            <button
              onClick={() => navigate("/patient/symptom-check")}
              className="bg-white border border-line hover:border-primary/40 text-ink/70 text-sm font-medium rounded-lg px-3 py-2 transition"
            >
              Symptom Checker
            </button>
            <button
              onClick={() => { setShowShare((s) => !s); setShowSecurityLog(false); setShowUpload(false); }}
              className="bg-white border border-line hover:border-primary/40 text-ink/70 text-sm font-medium rounded-lg px-3 py-2 transition"
            >
              Share Access
            </button>
            <button
              onClick={() => navigate("/patient/skin-check")}
              className="bg-white border border-line hover:border-primary/40 text-ink/70 text-sm font-medium rounded-lg px-3 py-2 transition"
            >
              Skin Check
            </button>
            <button
              onClick={() => { setShowSecurityLog((s) => !s); setShowShare(false); setShowUpload(false); }}
              className="bg-white border border-line hover:border-primary/40 text-ink/70 text-sm font-medium rounded-lg px-3 py-2 transition"
            >
              Security Log
            </button>
            <button
              onClick={() => { setShowUpload((s) => !s); setShowShare(false); setShowSecurityLog(false); }}
              className="bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg px-4 py-2 transition"
            >
              {showUpload ? "Cancel" : "Explain a Document"}
            </button>
          </div>
        </div>

        {showShare && <ShareAccessPanel onClose={() => setShowShare(false)} />}
        {showSecurityLog && <SecurityLogPanel onClose={() => setShowSecurityLog(false)} />}

        {showUpload && (
          <form
            onSubmit={handleUpload}
            className="bg-white border border-line rounded-2xl p-6 mb-8 space-y-4"
          >
            <p className="text-xs text-ink/40 -mt-1">
              Quick look — get an explanation and ask follow-ups. Won't appear in Medical Records unless you choose to save it below.
            </p>
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Document type</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
              >
                <option value="report">Report</option>
                <option value="prescription">Prescription</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">File (PDF or photo)</label>
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => setFile(e.target.files[0] || null)}
                className="w-full text-sm text-ink/70 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-primary/10 file:text-primary file:text-sm file:font-medium"
                required
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-ink/70">
              <input
                type="checkbox"
                checked={saveToRecords}
                onChange={(e) => setSaveToRecords(e.target.checked)}
                className="accent-primary"
              />
              Also save this to Medical Records
            </label>

            {uploadError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {uploadError}
              </p>
            )}

            <button
              type="submit"
              disabled={uploading || !file}
              className="w-full bg-primary hover:bg-primary-dark text-white rounded-lg py-2.5 font-medium text-sm transition disabled:opacity-50"
            >
              {uploading ? "Reading and explaining your document…" : "Upload"}
            </button>
            {uploading && (
              <p className="text-xs text-ink/40 text-center">
                This can take a minute or two the first time — extraction and explanation run together.
              </p>
            )}
          </form>
        )}

        {justUploadedId && (
          <div className="bg-white border-2 border-primary/20 rounded-2xl p-6 mb-8">
            <p className="text-xs font-mono uppercase tracking-wide text-primary/70 mb-3">
              Just uploaded
            </p>
            <DocumentExplanation
              documentId={justUploadedId}
              explanation={explanations[justUploadedId]}
              onClose={() => setJustUploadedId(null)}
            />
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-ink/40 py-8">
            <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            Loading your timeline…
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="text-center py-16 border border-dashed border-line rounded-2xl">
            <p className="text-ink/50 text-sm">
              Nothing here yet — upload a report to get started.
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

              return (
                <li key={e.id} className="relative pl-8 pb-7 last:pb-0">
                  <span className="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-white border-2 border-sage flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-sage" />
                  </span>

                  <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm">
                    <div
                      className={`px-4 py-3 ${isClickable ? "cursor-pointer hover:bg-page/60" : ""} transition`}
                      onClick={isDoc ? () => toggleExplanation(e) : isNote ? () => toggleNote(e) : undefined}
                    >
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <span className="text-[11px] font-mono uppercase tracking-wide text-primary/70">
                          {ENTRY_LABELS[e.entry_type] || e.entry_type}
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