import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api.js";

export default function LoginPage() {
  const [mode, setMode] = useState("login"); // 'login' | 'register'
  const [role, setRole] = useState("patient");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "register") {
        await api.post("/auth/register", { email, password, full_name: fullName, role });
      }
      const { data } = await api.post("/auth/login", { email, password });
      localStorage.setItem("access_token", data.access_token);
      const me = await api.get("/auth/me", {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      localStorage.setItem("role", me.data.role);
      navigate(me.data.role === "doctor" ? "/doctor" : "/patient");
    } catch (err) {
      setError(err.response?.data?.detail || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl text-primary tracking-tight">HealthThread</h1>
          <p className="text-sm text-ink/50 mt-1">Your health history, organized and understood</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white shadow-sm border border-line rounded-2xl p-8 space-y-5"
        >
          <h2 className="font-display text-lg text-ink">
            {mode === "login" ? "Sign in" : "Create your account"}
          </h2>

          {mode === "register" && (
            <>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Full name</label>
                <input
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink/60 mb-2">I am a</label>
                <div className="grid grid-cols-2 gap-2">
                  {["patient", "doctor"].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`py-2 rounded-lg text-sm font-medium capitalize border transition ${
                        role === r
                          ? "bg-primary text-white border-primary"
                          : "bg-white text-ink/60 border-line hover:border-primary/40"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-ink/60 mb-1.5">Email</label>
            <input
              className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink/60 mb-1.5">Password</label>
            <input
              className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary-dark text-white rounded-lg py-2.5 font-medium text-sm transition disabled:opacity-50"
          >
            {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>

          <button
            type="button"
            className="text-sm text-ink/50 hover:text-primary w-full text-center transition"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
          >
            {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}