import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api.js";
import Header from "../components/Header.jsx";

export default function SymptomChecker() {
  const [messages, setMessages] = useState([]); // [{ role: 'patient'|'agent', text }]
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [sending, setSending] = useState(false);
  const [awaitingFollowUp, setAwaitingFollowUp] = useState(false);
  const [result, setResult] = useState(null); // { confidence, sources_used } once complete
  const [error, setError] = useState("");
  const [me, setMe] = useState(null);

  const bottomRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/auth/me").then((res) => setMe(res.data));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send(text, forceReady = false) {
    setSending(true);
    setError("");

    try {
      const { data } = await api.post("/patients/me/symptom-check", {
        session_id: sessionId,
        message: text,
        force_ready: forceReady,
      });
      setSessionId(data.session_id);

      if (data.status === "need_more_info") {
        setMessages((prev) => [...prev, { role: "agent", text: data.question }]);
        setAwaitingFollowUp(true);
      } else {
        setMessages((prev) => [...prev, { role: "agent", text: data.summary }]);
        setResult({ confidence: data.confidence, sources_used: data.sources_used });
        setAwaitingFollowUp(false);
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Something went wrong — try again.");
    } finally {
      setSending(false);
    }
  }

  function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setMessages((prev) => [...prev, { role: "patient", text }]);
    setInput("");
    send(text, false);
  }

  function handleAnswerNow() {
    if (sending) return;
    const text = input.trim();
    setMessages((prev) => [
      ...prev,
      { role: "patient", text: text || "(No more details — please answer with what you have.)" },
    ]);
    setInput("");
    send(text || "No more details.", true);
  }

  function startNewCheck() {
    setMessages([]);
    setSessionId(null);
    setResult(null);
    setError("");
    setAwaitingFollowUp(false);
  }

  return (
    <div className="min-h-screen bg-page flex flex-col">
      <Header name={me?.full_name} role="patient" />

      <main className="max-w-2xl w-full mx-auto px-6 py-8 flex flex-col flex-1">
        <button
          onClick={() => navigate("/patient")}
          className="self-start flex items-center gap-1.5 text-sm text-ink/60 hover:text-primary border border-line hover:border-primary/40 rounded-lg px-3 py-1.5 mb-5 transition"
        >
          <span className="text-base leading-none">←</span> Back to timeline
        </button>

        <h1 className="font-display text-2xl text-ink mb-1">Symptom Checker</h1>
        <p className="text-sm text-ink/50 mb-6">
          Describe how you're feeling — this reasons using your own health history, not just what you type here.
        </p>

        <div className="flex-1 bg-white border border-line rounded-2xl p-5 mb-4 min-h-[320px] flex flex-col gap-3 overflow-y-auto">
          {messages.length === 0 && (
            <p className="text-sm text-ink/35 m-auto text-center max-w-xs">
              Start by describing a symptom — e.g. "I've had a headache for two days."
            </p>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                m.role === "patient"
                  ? "bg-primary text-white self-end rounded-br-sm"
                  : "bg-page text-ink self-start rounded-bl-sm border border-line"
              }`}
            >
              {m.text}
            </div>
          ))}

          {sending && (
            <div className="self-start bg-page border border-line rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-ink/40">
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 bg-ink/30 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-ink/30 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-ink/30 rounded-full animate-bounce" />
              </span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {result && (
          <div className="bg-sage/10 border border-sage/30 rounded-xl px-4 py-3 mb-4 flex items-center justify-between text-sm">
            <span className="text-ink/70">
              Confidence: <span className="font-medium text-ink">{result.confidence}</span>
              {result.sources_used > 0 && (
                <span className="text-ink/50"> · grounded in {result.sources_used} part{result.sources_used !== 1 ? "s" : ""} of your history</span>
              )}
            </span>
            <button
              onClick={startNewCheck}
              className="text-primary hover:text-primary-dark font-medium shrink-0 ml-3"
            >
              Start new check
            </button>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
            {error}
          </p>
        )}

        {!result && (
          <div className="space-y-2">
            <form onSubmit={handleSend} className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Describe your symptoms…"
                disabled={sending}
                className="flex-1 border border-line rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg px-5 py-2.5 transition disabled:opacity-50 shrink-0"
              >
                Send
              </button>
            </form>

            {awaitingFollowUp && (
              <button
                onClick={handleAnswerNow}
                disabled={sending}
                className="text-xs text-ink/45 hover:text-primary transition disabled:opacity-50"
              >
                Skip follow-ups — just answer with what I've said so far
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}