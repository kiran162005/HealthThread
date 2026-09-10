import { useEffect, useState } from "react";
import api from "../api.js";
import Header from "../components/Header.jsx";
import DocumentExplanation from "../components/DocumentExplanation.jsx";
import ShareAccessPanel from "../components/ShareAccessPanel.jsx";
import SecurityLogPanel from "../components/SecurityLogPanel.jsx";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Stethoscope,
  ScanLine,
  Share2,
  ShieldCheck,
  Upload,
  X,
  History,
  ArrowRight,
  Baby,
} from "lucide-react";

const QUICK_ACTIONS = [
  {
    key: "timeline",
    icon: History,
    label: "Timeline",
    desc: "Your full history, in order",
    path: "/patient/timeline",
  },
  {
    key: "records",
    icon: FileText,
    label: "Medical Records",
    desc: "Everything you've saved",
    path: "/patient/records",
  },
  {
    key: "symptom",
    icon: Stethoscope,
    label: "Symptom Checker",
    desc: "Grounded in your history",
    path: "/patient/symptom-check",
  },
  {
    key: "skin",
    icon: ScanLine,
    label: "Skin Check",
    desc: "Upload a photo, get a read",
    path: "/patient/skin-check",
  },
  {
  key: "baby",
  icon: Baby,
  label: "Baby Growth",
  desc: "Track weight & length",
  path: "/patient/baby-growth",
},
];

export default function PatientDashboard() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);

  const [showUpload, setShowUpload] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showSecurityLog, setShowSecurityLog] = useState(false);
  const [docType, setDocType] = useState("report");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [saveToRecords, setSaveToRecords] = useState(false);

  const [justUploadedId, setJustUploadedId] = useState(null);
  const [explanations, setExplanations] = useState({});

  useEffect(() => {
    api.get("/auth/me").then((res) => setMe(res.data));
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

      <main className="max-w-3xl mx-auto px-6 py-14">
        <div className="mb-10">
          <p className="font-mono text-xs tracking-widest text-primary/60 uppercase mb-3">
            Your health, threaded together
          </p>
          <h1 className="font-display text-3xl text-ink mb-2">
            {me ? `Welcome back, ${me.full_name.split(" ")[0]}` : "Welcome back"}
          </h1>
          <p className="text-ink/50 text-sm max-w-md">
            Everything's organized and ready — pick up wherever you left off.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {QUICK_ACTIONS.map(({ key, icon: Icon, label, desc, path }) => (
            <button
              key={key}
              onClick={() => navigate(path)}
              className="group text-left bg-white border border-line hover:border-primary/40 hover:shadow-md rounded-2xl p-5 transition"
            >
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary mb-4 group-hover:bg-primary group-hover:text-white transition">
                <Icon size={18} strokeWidth={2} />
              </span>
              <p className="text-sm font-medium text-ink mb-1">{label}</p>
              <p className="text-xs text-ink/45 leading-snug">{desc}</p>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 mb-10 pb-10 border-b border-line">
          <div className="flex items-center gap-4">
            <button
              onClick={() => { setShowShare((s) => !s); setShowSecurityLog(false); setShowUpload(false); }}
              className={`flex items-center gap-1.5 text-sm font-medium transition ${
                showShare ? "text-primary" : "text-ink/50 hover:text-primary"
              }`}
            >
              <Share2 size={15} strokeWidth={2} />
              Share Access
            </button>
            <button
              onClick={() => { setShowSecurityLog((s) => !s); setShowShare(false); setShowUpload(false); }}
              className={`flex items-center gap-1.5 text-sm font-medium transition ${
                showSecurityLog ? "text-primary" : "text-ink/50 hover:text-primary"
              }`}
            >
              <ShieldCheck size={15} strokeWidth={2} />
              Security Log
            </button>
          </div>
          <button
            onClick={() => { setShowUpload((s) => !s); setShowShare(false); setShowSecurityLog(false); }}
            className="flex items-center gap-1.5 bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg px-4 py-2.5 transition shrink-0"
          >
            {showUpload ? (
              "Cancel"
            ) : (
              <>
                <Upload size={15} strokeWidth={2} />
                Explain a Document
              </>
            )}
          </button>
        </div>

        {showShare && <ShareAccessPanel onClose={() => setShowShare(false)} />}
        {showSecurityLog && <SecurityLogPanel onClose={() => setShowSecurityLog(false)} />}

        {showUpload && (
          <form
            onSubmit={handleUpload}
            className="bg-white border border-line rounded-2xl p-6 mb-6 space-y-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary shrink-0">
                  <Upload size={16} strokeWidth={2} />
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">Explain a Document</p>
                  <p className="text-xs text-ink/40">
                    Get a plain-language explanation and ask follow-ups.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowUpload(false)}
                className="text-ink/30 hover:text-ink/60 transition shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-ink/40 -mt-1">
              Won't appear in Medical Records unless you choose to save it below.
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
          <div className="bg-white border-2 border-primary/20 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-mono uppercase tracking-wide text-primary/70">
                Just uploaded
              </p>
              <button
                onClick={() => navigate("/patient/timeline")}
                className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition"
              >
                View in timeline <ArrowRight size={12} />
              </button>
            </div>
            <DocumentExplanation
              documentId={justUploadedId}
              explanation={explanations[justUploadedId]}
              onClose={() => setJustUploadedId(null)}
            />
          </div>
        )}
      </main>
    </div>
  );
}