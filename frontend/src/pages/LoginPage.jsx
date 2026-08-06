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
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
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
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-8 w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold text-slate-800">
          {mode === "login" ? "Sign in" : "Create account"}
        </h1>

        {mode === "register" && (
          <>
            <input
              className="w-full border rounded px-3 py-2"
              placeholder="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1">
                <input type="radio" checked={role === "patient"} onChange={() => setRole("patient")} />
                Patient
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" checked={role === "doctor"} onChange={() => setRole("doctor")} />
                Doctor
              </label>
            </div>
          </>
        )}

        <input
          className="w-full border rounded px-3 py-2"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="w-full border rounded px-3 py-2"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button type="submit" className="w-full bg-slate-800 text-white rounded py-2 font-medium">
          {mode === "login" ? "Sign in" : "Register"}
        </button>

        <button
          type="button"
          className="text-sm text-slate-500 underline w-full text-center"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? "Need an account? Register" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}