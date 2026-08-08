import { useEffect, useState } from "react";
import api from "../api.js";
import Header from "../components/Header.jsx";

const ENTRY_LABELS = {
  document: "Document",
  symptom_check: "Symptom Check",
  doctor_note: "Doctor's Note",
  skin_check: "Skin Check",
};

export default function PatientDashboard() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);

  const [showUpload, setShowUpload] = useState(false);
  const [docType, setDocType] = useState("report");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // explanation panel state, keyed by document id
  const [expandedId, setExpandedId] = useState(null);
  const [explanations, setExplanations] = useState({}); // { [docId]: { loading, text, error } }

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

  async function handleDelete(entry) {
    if (!window.confirm("Delete this document? This can't be undone.")) return;
    try {
      await api.delete(`/patients/me/documents/${entry.ref_id}`);
      loadTimeline();
    } catch (err) {
      alert(err.response?.data?.detail || "Could not delete this document.");
    }
  }

  async function toggleExplanation(entry) {
    const docId = entry.ref_id;

    if (expandedId === docId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(docId);

    if (explanations[docId]) return; // already fetched

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

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setUploadError("");

    const formData = new FormData();
    formData.append("doc_type", docType);
    formData.append("file", file);

    try {
      await api.post("/patients/me/documents", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setFile(null);
      setShowUpload(false);
      loadTimeline();
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
          <button
            onClick={() => setShowUpload((s) => !s)}
            className="shrink-0 bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg px-4 py-2 transition"
          >
            {showUpload ? "Cancel" : "+ Upload document"}
          </button>
        </div>

        {showUpload && (
          <form
            onSubmit={handleUpload}
            className="bg-white border border-line rounded-2xl p-6 mb-8 space-y-4"
          >
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
            {/* the pulse rail */}
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-line" />

            {entries.map((e) => {
              const isDoc = e.entry_type === "document";
              const isExpanded = expandedId === e.ref_id;
              const explanation = explanations[e.ref_id];

              return (
                <li key={e.id} className="relative pl-8 pb-7 last:pb-0">
                  <span className="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-white border-2 border-sage flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-sage" />
                  </span>

                  <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm">
                    <div
                      className={`px-4 py-3 ${isDoc ? "cursor-pointer hover:bg-page/60" : ""} transition`}
                      onClick={isDoc ? () => toggleExplanation(e) : undefined}
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
                          {isDoc && (
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
                      </div>
                    </div>

                    {isDoc && isExpanded && (
                      <div className="px-4 py-3 bg-page/50 border-t border-line text-sm text-ink/80 leading-relaxed">
                        {explanation?.loading && (
                          <span className="text-ink/40">Loading explanation…</span>
                        )}
                        {explanation?.error && (
                          <span className="text-red-600">{explanation.error}</span>
                        )}
                        {explanation?.text && (
                          <p className="whitespace-pre-line">{explanation.text}</p>
                        )}
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