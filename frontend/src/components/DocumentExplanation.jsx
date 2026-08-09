import { useState } from "react";
import api from "../api.js";

export default function DocumentExplanation({ documentId, explanation, onClose }) {
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [qa, setQa] = useState([]); // [{ question, answer }]

  async function handleAsk(e) {
    e.preventDefault();
    if (!question.trim()) return;
    const q = question.trim();
    setQuestion("");
    setAsking(true);
    try {
      const res = await api.post(`/patients/me/documents/${documentId}/ask`, { question: q });
      setQa((prev) => [...prev, { question: q, answer: res.data.answer }]);
    } catch (err) {
      setQa((prev) => [
        ...prev,
        { question: q, answer: err.response?.data?.detail || "Could not answer that — try again." },
      ]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="text-sm text-ink/80 leading-relaxed">
      {explanation?.loading && <span className="text-ink/40">Loading explanation…</span>}
      {explanation?.error && <span className="text-red-600">{explanation.error}</span>}

      {explanation?.text && (
        <>
          <p className="whitespace-pre-line mb-3">{explanation.text}</p>

          {qa.length > 0 && (
            <div className="space-y-2 mb-3">
              {qa.map((item, i) => (
                <div key={i} className="bg-white border border-line rounded-lg px-3 py-2">
                  <p className="text-xs font-medium text-primary mb-1">Q: {item.question}</p>
                  <p className="text-sm text-ink/80 whitespace-pre-line">{item.answer}</p>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleAsk} className="flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a follow-up about this document…"
              className="flex-1 border border-line rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
            />
            <button
              type="submit"
              disabled={asking || !question.trim()}
              className="bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg px-3 py-1.5 transition disabled:opacity-50 shrink-0"
            >
              {asking ? "Asking…" : "Ask"}
            </button>
          </form>

          {onClose && (
            <button
              onClick={onClose}
              className="mt-3 text-xs text-ink/40 hover:text-primary transition"
            >
              Close
            </button>
          )}
        </>
      )}
    </div>
  );
}