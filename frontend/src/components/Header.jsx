import { useNavigate } from "react-router-dom";

export default function Header({ name, role }) {
  const navigate = useNavigate();

  function handleLogout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("role");
    navigate("/login");
  }

  return (
    <header className="border-b border-line bg-white">
      <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-xl text-primary tracking-tight">HealthThread</span>
          {role && (
            <span className="text-xs font-mono uppercase tracking-wide text-sage bg-sage/10 px-2 py-0.5 rounded-full">
              {role}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {name && <span className="text-sm text-ink/70">{name}</span>}
          <button
            onClick={handleLogout}
            className="text-sm text-ink/60 hover:text-white hover:bg-primary border border-line hover:border-primary px-3 py-1.5 rounded-lg transition-colors"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}