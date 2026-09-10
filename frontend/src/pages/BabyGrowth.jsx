import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api.js";
import Header from "../components/Header.jsx";
import { Baby, Plus, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

function ageLabel(months) {
  if (months < 1) return "Newborn";
  if (months < 24) return `${Math.round(months)} mo`;
  return `${Math.floor(months / 12)}y ${Math.round(months % 12)}mo`;
}

export default function BabyGrowth() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);

  const [babies, setBabies] = useState([]);
  const [selectedBabyId, setSelectedBabyId] = useState(null);
  const [babiesLoading, setBabiesLoading] = useState(true);

  const [showCreateBaby, setShowCreateBaby] = useState(false);
  const [babyName, setBabyName] = useState("");
  const [babyDob, setBabyDob] = useState("");
  const [babySex, setBabySex] = useState("male");
  const [creatingBaby, setCreatingBaby] = useState(false);

  const [entries, setEntries] = useState([]);
  const [entriesLoading, setEntriesLoading] = useState(false);

  const [showAddEntry, setShowAddEntry] = useState(false);
  const [entryDate, setEntryDate] = useState("");
  const [entryWeight, setEntryWeight] = useState("");
  const [entryHeight, setEntryHeight] = useState("");
  const [entryHeadCirc, setEntryHeadCirc] = useState("");
  const [entryNotes, setEntryNotes] = useState("");
  const [addingEntry, setAddingEntry] = useState(false);
  const [entryError, setEntryError] = useState("");

  const selectedBaby = babies.find((b) => b.id === selectedBabyId);

  useEffect(() => {
    api.get("/auth/me").then((res) => setMe(res.data));
    loadBabies();
  }, []);

  function loadBabies() {
    setBabiesLoading(true);
    api
      .get("/patients/me/babies")
      .then((res) => {
        setBabies(res.data);
        if (res.data.length > 0) setSelectedBabyId(res.data[0].id);
        else setShowCreateBaby(true);
      })
      .finally(() => setBabiesLoading(false));
  }

  useEffect(() => {
    if (!selectedBabyId) return;
    setEntriesLoading(true);
    api
      .get(`/patients/me/babies/${selectedBabyId}/growth`)
      .then((res) => setEntries(res.data))
      .finally(() => setEntriesLoading(false));
  }, [selectedBabyId]);

  async function handleCreateBaby(e) {
    e.preventDefault();
    setCreatingBaby(true);
    try {
      const res = await api.post("/patients/me/babies", {
        name: babyName,
        date_of_birth: babyDob,
        sex: babySex,
      });
      setBabies((prev) => [res.data, ...prev]);
      setSelectedBabyId(res.data.id);
      setShowCreateBaby(false);
      setBabyName("");
      setBabyDob("");
    } finally {
      setCreatingBaby(false);
    }
  }

  async function handleAddEntry(e) {
    e.preventDefault();
    setAddingEntry(true);
    setEntryError("");
    try {
      const res = await api.post(`/patients/me/babies/${selectedBabyId}/growth`, {
        recorded_at: entryDate,
        weight_kg: entryWeight ? parseFloat(entryWeight) : null,
        height_cm: entryHeight ? parseFloat(entryHeight) : null,
        head_circ_cm: entryHeadCirc ? parseFloat(entryHeadCirc) : null,
        notes: entryNotes || null,
      });
      setEntries((prev) => [...prev, res.data].sort((a, b) => a.age_months - b.age_months));
      setShowAddEntry(false);
      setEntryDate("");
      setEntryWeight("");
      setEntryHeight("");
      setEntryHeadCirc("");
      setEntryNotes("");
    } catch (err) {
      setEntryError(err.response?.data?.detail || "Couldn't save that entry.");
    } finally {
      setAddingEntry(false);
    }
  }

  const chartData = entries.map((e) => ({
    age_months: e.age_months,
    ageLabel: ageLabel(e.age_months),
    weight_kg: e.weight_kg,
    height_cm: e.height_cm,
  }));

  return (
    <div className="min-h-screen bg-page">
      <Header name={me?.full_name} role="patient" />

      <main className="max-w-2xl mx-auto px-6 py-10">
        <button
          onClick={() => navigate("/patient")}
          className="flex items-center gap-1.5 text-sm text-ink/60 hover:text-primary border border-line hover:border-primary/40 rounded-lg px-3 py-1.5 mb-5 transition"
        >
          <span className="text-base leading-none">←</span> Back to dashboard
        </button>

        <div className="flex items-center gap-2.5 mb-1">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary">
            <Baby size={16} strokeWidth={2} />
          </span>
          <h1 className="font-display text-2xl text-ink">Growth Tracking</h1>
        </div>
        <p className="text-sm text-ink/50 mb-8 ml-[42px]">
          Weight and length against approximate age-based norms.
        </p>

        {babiesLoading && <p className="text-sm text-ink/40">Loading…</p>}

        {!babiesLoading && babies.length > 0 && (
          <div className="flex items-center justify-between mb-6">
            {babies.length > 1 ? (
              <select
                value={selectedBabyId}
                onChange={(e) => setSelectedBabyId(e.target.value)}
                className="border border-line rounded-lg px-3 py-2 text-sm bg-white"
              >
                {babies.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            ) : (
              <p className="text-sm font-medium text-ink">{selectedBaby?.name}</p>
            )}
            <button
              onClick={() => setShowCreateBaby(true)}
              className="text-xs text-primary/70 hover:text-primary transition"
            >
              + Add another baby
            </button>
          </div>
        )}

        {showCreateBaby && (
          <form
            onSubmit={handleCreateBaby}
            className="bg-white border border-line rounded-2xl p-6 mb-6 space-y-4"
          >
            <p className="text-sm font-medium text-ink">Add a baby profile</p>
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1.5">Name</label>
              <input
                type="text"
                value={babyName}
                onChange={(e) => setBabyName(e.target.value)}
                required
                className="w-full border border-line rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Date of birth</label>
                <input
                  type="date"
                  value={babyDob}
                  onChange={(e) => setBabyDob(e.target.value)}
                  required
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/60 mb-1.5">Sex</label>
                <select
                  value={babySex}
                  onChange={(e) => setBabySex(e.target.value)}
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-ink/40">
              Sex is used only to select the right growth reference curve.
            </p>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creatingBaby}
                className="bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg px-4 py-2 transition disabled:opacity-50"
              >
                {creatingBaby ? "Saving…" : "Save"}
              </button>
              {babies.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowCreateBaby(false)}
                  className="text-sm text-ink/50 hover:text-ink transition px-2"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}

        {selectedBaby && !showCreateBaby && (
          <>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setShowAddEntry((s) => !s)}
                className="flex items-center gap-1.5 bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg px-4 py-2 transition"
              >
                {showAddEntry ? "Cancel" : (<><Plus size={15} /> Log a Measurement</>)}
              </button>
            </div>

            {showAddEntry && (
              <form
                onSubmit={handleAddEntry}
                className="bg-white border border-line rounded-2xl p-6 mb-6 space-y-4"
              >
                <div>
                  <label className="block text-xs font-medium text-ink/60 mb-1.5">Date</label>
                  <input
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    required
                    className="w-full border border-line rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-ink/60 mb-1.5">Weight (kg)</label>
                    <input
                      type="number" step="0.01" value={entryWeight}
                      onChange={(e) => setEntryWeight(e.target.value)}
                      className="w-full border border-line rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-ink/60 mb-1.5">Length (cm)</label>
                    <input
                      type="number" step="0.1" value={entryHeight}
                      onChange={(e) => setEntryHeight(e.target.value)}
                      className="w-full border border-line rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-ink/60 mb-1.5">Head (cm)</label>
                    <input
                      type="number" step="0.1" value={entryHeadCirc}
                      onChange={(e) => setEntryHeadCirc(e.target.value)}
                      className="w-full border border-line rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink/60 mb-1.5">Notes (optional)</label>
                  <input
                    type="text" value={entryNotes}
                    onChange={(e) => setEntryNotes(e.target.value)}
                    className="w-full border border-line rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                {entryError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    {entryError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={addingEntry}
                  className="w-full bg-primary hover:bg-primary-dark text-white rounded-lg py-2.5 font-medium text-sm transition disabled:opacity-50"
                >
                  {addingEntry ? "Saving…" : "Save Measurement"}
                </button>
              </form>
            )}

            {entriesLoading && <p className="text-sm text-ink/40">Loading measurements…</p>}

            {!entriesLoading && entries.length === 0 && (
              <div className="text-center py-12 border border-dashed border-line rounded-2xl mb-6">
                <p className="text-ink/50 text-sm">No measurements logged yet.</p>
              </div>
            )}

            {!entriesLoading && entries.length > 0 && (
              <>
                {chartData.some((d) => d.weight_kg != null) && (
                  <div className="bg-white border border-line rounded-2xl p-5 mb-4">
                    <p className="text-xs font-mono uppercase tracking-wide text-ink/50 mb-3">Weight (kg)</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis dataKey="ageLabel" tick={{ fontSize: 11 }} stroke="#94A3B8" />
                        <YAxis tick={{ fontSize: 11 }} stroke="#94A3B8" />
                        <Tooltip />
                        <Line type="monotone" dataKey="weight_kg" stroke="#0F4C75" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {chartData.some((d) => d.height_cm != null) && (
                  <div className="bg-white border border-line rounded-2xl p-5 mb-6">
                    <p className="text-xs font-mono uppercase tracking-wide text-ink/50 mb-3">Length (cm)</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis dataKey="ageLabel" tick={{ fontSize: 11 }} stroke="#94A3B8" />
                        <YAxis tick={{ fontSize: 11 }} stroke="#94A3B8" />
                        <Tooltip />
                        <Line type="monotone" dataKey="height_cm" stroke="#7FB8A4" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="space-y-2">
                  {[...entries].reverse().map((e) => (
                    <div key={e.id} className="bg-white border border-line rounded-xl px-4 py-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-mono text-ink/40">
                          {new Date(e.recorded_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                          {"  ·  "}{ageLabel(e.age_months)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-4 text-sm">
                        {e.weight_kg != null && (
                          <span className="flex items-center gap-1.5 text-ink">
                            {e.weight_percentile != null && e.weight_percentile < 3 || e.weight_percentile > 97 ? (
                              <AlertTriangle size={13} className="text-amber-500" />
                            ) : (
                              <CheckCircle2 size={13} className="text-sage-DEFAULT" />
                            )}
                            {e.weight_kg} kg
                            {e.weight_percentile != null && (
                              <span className="text-xs text-ink/40">({e.weight_percentile_label})</span>
                            )}
                          </span>
                        )}
                        {e.height_cm != null && (
                          <span className="flex items-center gap-1.5 text-ink">
                            {e.height_percentile != null && e.height_percentile < 3 || e.height_percentile > 97 ? (
                              <AlertTriangle size={13} className="text-amber-500" />
                            ) : (
                              <CheckCircle2 size={13} className="text-sage-DEFAULT" />
                            )}
                            {e.height_cm} cm
                            {e.height_percentile != null && (
                              <span className="text-xs text-ink/40">({e.height_percentile_label})</span>
                            )}
                          </span>
                        )}
                      </div>
                      {e.notes && <p className="text-xs text-ink/50 mt-1.5">{e.notes}</p>}
                    </div>
                  ))}
                </div>

                <p className="text-xs text-ink/35 mt-6 leading-relaxed">
                  Percentiles here are an approximate estimate for demonstration, not the official
                  WHO Child Growth Standards. Always discuss growth concerns with a pediatrician.
                </p>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}