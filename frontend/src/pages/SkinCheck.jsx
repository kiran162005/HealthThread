import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api.js";
import Header from "../components/Header.jsx";

const CLASS_LABELS = {
  akiec: "Actinic keratosis",
  bcc: "Basal cell carcinoma",
  bkl: "Benign keratosis-like lesion",
  df: "Dermatofibroma",
  mel: "Melanoma",
  nv: "Melanocytic nevus (mole)",
  vasc: "Vascular lesion",
};

export default function SkinCheck() {
  const [me, setMe] = useState(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    api.get("/auth/me").then((res) => setMe(res.data));
  }, []);

  function handleFileChange(e) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setResult(null);
    setError("");
    setPreviewUrl(URL.createObjectURL(selected));
  }

  async function handleCheck() {
    if (!file || checking) return;
    setChecking(true);
    setError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const { data } = await api.post("/patients/me/skin-check", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't process that image — try another.");
    } finally {
      setChecking(false);
    }
  }

  function reset() {
    setFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError("");
  }

  const sortedProbs = result
    ? Object.entries(result.all_probabilities).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className="min-h-screen bg-page">
      <Header name={me?.full_name} role="patient" />

      <main className="max-w-2xl mx-auto px-6 py-8">
        <button
          onClick={() => navigate("/patient")}
          className="flex items-center gap-1.5 text-sm text-ink/60 hover:text-primary border border-line hover:border-primary/40 rounded-lg px-3 py-1.5 mb-5 transition"
        >
          <span className="text-base leading-none">←</span> Back to timeline
        </button>

        <h1 className="font-display text-2xl text-ink mb-1">Skin Check</h1>
        <p className="text-sm text-ink/50 mb-6">
          Upload a clear, well-lit photo of a skin mark for an experimental read. This isn't stored
          in your records and isn't a diagnosis.
        </p>

        <div className="bg-white border border-line rounded-2xl p-5 mb-4">
          {!previewUrl ? (
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-line rounded-xl py-12 cursor-pointer hover:border-primary/40 transition">
              <span className="text-sm text-ink/60 mb-1">Click to choose a photo</span>
              <span className="text-xs text-ink/35">JPG or PNG</span>
              <input
                type="file"
                accept="image/jpeg,image/png"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <img
                src={previewUrl}
                alt="Selected skin photo"
                className="max-h-64 rounded-xl border border-line object-contain"
              />
              {!result && (
                <div className="flex gap-2">
                  <button
                    onClick={handleCheck}
                    disabled={checking}
                    className="bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg px-5 py-2.5 transition disabled:opacity-50"
                  >
                    {checking ? "Analyzing…" : "Analyze photo"}
                  </button>
                  <button
                    onClick={reset}
                    disabled={checking}
                    className="bg-white border border-line hover:border-primary/40 text-ink/70 text-sm font-medium rounded-lg px-4 py-2.5 transition disabled:opacity-50"
                  >
                    Choose different photo
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
            {error}
          </p>
        )}

        {result && (
          <div className="space-y-4">
            <div
              className={`rounded-xl px-4 py-3 border text-sm ${
                result.flagged_for_doctor
                  ? "bg-amber-50 border-amber-200 text-amber-900"
                  : "bg-sage/10 border-sage/30 text-ink/80"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">
                  {CLASS_LABELS[result.predicted_class] || result.predicted_class}
                </span>
                <span className="text-xs opacity-70">
                  {Math.round(result.confidence * 100)}% confidence
                </span>
              </div>
              {result.flagged_for_doctor && (
                <p className="text-xs">
                  This category is worth having a doctor look at in person.
                </p>
              )}
            </div>

            <div className="bg-white border border-line rounded-2xl p-5">
              <p className="text-xs font-medium text-ink/50 mb-3 uppercase tracking-wide">
                Full breakdown
              </p>
              <div className="space-y-2">
                {sortedProbs.map(([code, prob]) => (
                  <div key={code} className="flex items-center gap-3">
                    <span className="text-xs text-ink/60 w-40 shrink-0">
                      {CLASS_LABELS[code] || code}
                    </span>
                    <div className="flex-1 h-2 bg-page rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/70 rounded-full"
                        style={{ width: `${Math.max(prob * 100, 2)}%` }}
                      />
                    </div>
                    <span className="text-xs text-ink/40 w-10 text-right shrink-0">
                      {Math.round(prob * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-ink/40 leading-relaxed">{result.disclaimer}</p>

            <button
              onClick={reset}
              className="text-primary hover:text-primary-dark text-sm font-medium"
            >
              Check another photo
            </button>
          </div>
        )}
      </main>
    </div>
  );
}