import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api.js";
import Header from "../components/Header.jsx";
import DocumentExplanation from "../components/DocumentExplanation.jsx";

const DOC_TYPE_LABELS = { report: "Report", prescription: "Prescription", other: "Other" };

export default function MedicalRecords() {
  const [me, setMe] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [doctors, setDoctors] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [expandedId, setExpandedId] = useState(null);
  const [explanations, setExplanations] = useState({});

  const [shareMode, setShareMode] = useState(null); // null | "selected" | "all"
  const [showUpload, setShowUpload] = useState(false);
  const [docType, setDocType] = useState("report");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const navigate = useNavigate();

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setUploadError("");
    const formData = new FormData();
    formData.append("doc_type", docType);
    formData.append("file", file);
    formData.append("save_to_records", true);
    try {
      await api.post("/patients/me/documents", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setFile(null);
      setShowUpload(false);
      loadDocuments();
    } catch (err) {
      setUploadError(err.response?.data?.detail || "Upload failed — try again.");
    } finally {
      setUploading(false);
    }
  }

  function loadDocuments() {
    setLoading(true);
    api.get("/patients/me/documents").then((res) => setDocuments(res.data)).finally(() => setLoading(false));
  }

  useEffect(() => {
    api.get("/auth/me").then((res) => setMe(res.data));
    api.get("/patients/me/share").then((res) => setDoctors(res.data));
    loadDocuments();
  }, []);

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleViewFile(doc) {
    try {
      const res = await api.get(`/patients/me/documents/${doc.id}/file`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank");
    } catch (err) {
      alert(err.response?.data?.detail || "Could not open this document.");
    }
  }

  async function toggleExplanation(doc) {
    if (expandedId === doc.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(doc.id);
    if (explanations[doc.id]) return;

    setExplanations((prev) => ({ ...prev, [doc.id]: { loading: true } }));
    try {
      const res = await api.get(`/patients/me/documents/${doc.id}/explanation`);
      setExplanations((prev) => ({ ...prev, [doc.id]: { loading: false, text: res.data.plain_explanation } }));
    } catch (err) {
      setExplanations((prev) => ({
        ...prev,
        [doc.id]: { loading: false, error: err.response?.data?.detail || "Could not load explanation." },
      }));
    }
  }

  async function handleDelete(doc) {
    if (!window.confirm("Delete this document? This can't be undone.")) return;
    await api.delete(`/patients/me/documents/${doc.id}`);
    loadDocuments();
  }

  async function handleUnshare(doc, doctorId) {
    await api.delete(`/patients/me/documents/${doc.id}/share/${doctorId}`);
    loadDocuments();
  }

  return (
    <div className="min-h-screen bg-page">
      <Header name={me?.full_name} role="patient" />

      <main className="max-w-2xl mx-auto px-6 py-10">
        <button
          onClick={() => navigate("/patient")}
          className="flex items-center gap-1.5 text-sm text-ink/60 hover:text-primary border border-line hover:border-primary/40 rounded-lg px-3 py-1.5 mb-6 transition"
        >
          <span className="text-base leading-none">←</span> Back to timeline
        </button>

        <div className="flex items-start justify-between mb-1">
          <div>
            <h1 className="font-display text-2xl text-ink mb-1">Medical Records</h1>
            <p className="text-sm text-ink/50">All your uploaded documents, in one folder.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            {selected.size > 0 && (
              <button
                onClick={() => setShareMode("selected")}
                className="bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg px-4 py-2 transition"
              >
                Share selected ({selected.size})
              </button>
            )}
            {documents.length > 0 && (
              <button
                onClick={() => setShareMode("all")}
                className="bg-white border border-line hover:border-primary/40 text-ink/70 text-sm font-medium rounded-lg px-4 py-2 transition"
              >
                Share all
              </button>
            )}
            <button
              onClick={() => setShowUpload((s) => !s)}
              className="bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg px-4 py-2 transition"
            >
              {showUpload ? "Cancel" : "+ Upload"}
            </button>
          </div>
        </div>

        {showUpload && (
          <form onSubmit={handleUpload} className="bg-white border border-line rounded-2xl p-6 mb-6 space-y-4">
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
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{uploadError}</p>
            )}
            <button
              type="submit"
              disabled={uploading || !file}
              className="w-full bg-primary hover:bg-primary-dark text-white rounded-lg py-2.5 font-medium text-sm transition disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Upload to Medical Records"}
            </button>
          </form>
        )}

        {loading && <p className="text-sm text-ink/40 py-8">Loading…</p>}

        {!loading && documents.length === 0 && (
          <div className="text-center py-16 border border-dashed border-line rounded-2xl mt-6">
            <p className="text-ink/50 text-sm">No documents uploaded yet.</p>
          </div>
        )}

        {!loading && documents.length > 0 && (
          <ul className="space-y-2 mt-6">
            {documents.map((doc) => (
              <li key={doc.id} className="bg-white border border-line rounded-xl overflow-hidden shadow-sm">
                <div className="flex items-start gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(doc.id)}
                    onChange={() => toggleSelect(doc.id)}
                    className="mt-1 accent-primary"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-3 mb-0.5">
                      <span className="text-[11px] font-mono uppercase tracking-wide text-primary/70">
                        {DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}
                      </span>
                      <span className="text-[11px] font-mono text-ink/35">
                        {new Date(doc.uploaded_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <p
                        className="text-sm text-ink cursor-pointer hover:text-primary hover:underline"
                        onClick={() => handleViewFile(doc)}
                      >
                        {doc.original_filename}
                      </p>
                      <button
                        onClick={() => toggleExplanation(doc)}
                        className="text-xs text-primary/60 hover:text-primary shrink-0"
                      >
                        {expandedId === doc.id ? "Hide explanation" : "View explanation"}
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {doc.shared_with.length === 0 && (
                        <span className="text-xs text-ink/35">Not shared with any doctor</span>
                      )}
                      {doc.shared_with.map((s) => (
                        <span
                          key={s.doctor_id}
                          className="inline-flex items-center gap-1.5 text-xs bg-sage/10 text-ink/70 rounded-full px-2 py-0.5"
                        >
                          {s.doctor_name}
                          <button
                            onClick={(ev) => { ev.stopPropagation(); handleUnshare(doc, s.doctor_id); }}
                            className="text-ink/30 hover:text-red-500"
                            title="Unshare"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(doc)}
                    className="text-xs font-medium text-red-500 hover:text-white hover:bg-red-500 border border-red-200 hover:border-red-500 rounded-md px-2 py-0.5 transition shrink-0"
                  >
                    Delete
                  </button>
                </div>

                {expandedId === doc.id && (
                  <div className="px-4 py-3 bg-page/50 border-t border-line">
                    <DocumentExplanation documentId={doc.id} explanation={explanations[doc.id]} readOnly />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>

      {shareMode && (
        <ShareModal
          mode={shareMode}
          documentIds={shareMode === "selected" ? Array.from(selected) : null}
          doctors={doctors}
          onClose={() => setShareMode(null)}
          onShared={() => { setShareMode(null); setSelected(new Set()); loadDocuments(); }}
        />
      )}
    </div>
  );
}

function ShareModal({ mode, documentIds, doctors, onClose, onShared }) {
  const [doctorId, setDoctorId] = useState(doctors[0]?.doctor_id || "");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!doctorId) return;
    setSending(true);
    setError("");
    try {
      await api.post("/patients/me/share-records", {
        doctor_id: doctorId,
        document_ids: documentIds,
        note: note.trim() || null,
      });
      onShared();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not share — try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-ink/20 flex items-center justify-center p-4 z-50">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-lg">
        <h2 className="font-display text-lg text-ink">
          {mode === "all" ? "Share all records" : "Share selected records"}
        </h2>

        {doctors.length === 0 ? (
          <p className="text-sm text-ink/50">
            No connected doctors yet — grant a doctor access first from Share Access.
          </p>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Doctor</label>
              <select
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
              >
                {doctors.map((d) => (
                  <option key={d.doctor_id} value={d.doctor_id}>{d.doctor_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Note (optional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="e.g. please review before our appointment"
                className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition resize-none"
              />
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={sending}
                className="flex-1 bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg py-2 transition disabled:opacity-50"
              >
                {sending ? "Sharing…" : "Share"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-ink/50 hover:text-primary px-3"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {doctors.length === 0 && (
          <button type="button" onClick={onClose} className="text-sm text-ink/50 hover:text-primary">
            Close
          </button>
        )}
      </form>
    </div>
  );
}