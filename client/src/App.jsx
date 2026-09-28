import { useCallback, useEffect, useRef, useState } from 'react';
import Header from './components/Header.jsx';
import LeftPanel from './components/LeftPanel.jsx';
import ComparisonCards from './components/ComparisonCards.jsx';
import RecommendationPanel from './components/RecommendationPanel.jsx';
import BranchCBanner from './components/BranchCBanner.jsx';
import CongestionChart from './components/CongestionChart.jsx';
import HistoryTable from './components/HistoryTable.jsx';
import StatsPanel from './components/StatsPanel.jsx';
import Toast from './components/Toast.jsx';
import { DEFAULT_INPUTS, PRESETS } from './presets.js';

const PREVIEW_DEBOUNCE_MS = 150;

function App() {
  const [inputs, setInputs] = useState(DEFAULT_INPUTS);
  const [presetIndex, setPresetIndex] = useState('custom');
  const [result, setResult] = useState(null);
  const [isSaved, setIsSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [unreachable, setUnreachable] = useState(false);
  const [decisions, setDecisions] = useState([]);
  const [stats, setStats] = useState(null);
  const [sweep, setSweep] = useState(null);

  const requestIdRef = useRef(0);
  const sweepRequestIdRef = useRef(0);

  const refreshHistory = useCallback(async () => {
    try {
      const [decisionsRes, statsRes] = await Promise.all([
        fetch('/api/decisions?limit=20'),
        fetch('/api/stats'),
      ]);
      setDecisions(await decisionsRes.json());
      setStats(await statsRes.json());
      setUnreachable(false);
    } catch {
      setUnreachable(true);
    }
  }, []);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  // Runs POST /api/evaluate. `persist: false` is the live-preview path
  // (sliders re-evaluating without saving); the decision logic always runs
  // server-side either way. A monotonic request id discards stale
  // responses so a slow preview can't clobber a just-saved result (or a
  // newer preview).
  const runEvaluate = useCallback(async (currentInputs, persist) => {
    const id = ++requestIdRef.current;
    if (persist) setSaving(true);
    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...currentInputs, persist }),
      });
      const json = await res.json();
      if (id !== requestIdRef.current) return;
      setUnreachable(false);
      if (!res.ok) {
        setError(json.error || 'Request failed');
        return;
      }
      setError(null);
      setResult(json);
      setIsSaved(Boolean(persist && json.persisted));
      if (persist) {
        if (json.warning) setToast(json.warning);
        refreshHistory();
      }
    } catch {
      if (id !== requestIdRef.current) return;
      setUnreachable(true);
    } finally {
      if (persist && id === requestIdRef.current) setSaving(false);
    }
  }, [refreshHistory]);

  const runSweep = useCallback(async (currentInputs) => {
    const id = ++sweepRequestIdRef.current;
    const qs = new URLSearchParams({
      data_size_mb: currentInputs.data_size_mb,
      compute_demand_mi: currentInputs.compute_demand_mi,
      deadline_ms: currentInputs.deadline_ms,
      battery_priority: currentInputs.battery_priority,
    });
    try {
      const res = await fetch(`/api/sweep?${qs.toString()}`);
      if (id !== sweepRequestIdRef.current) return;
      if (res.ok) setSweep(await res.json());
    } catch {
      // Non-critical to the main flow; the server-unreachable banner is
      // already driven by the evaluate path, so the chart just keeps
      // whatever it last had (or stays in its loading state).
    }
  }, []);

  // Live preview: debounced ~150ms re-evaluation on every input change
  // (sliders, presets, or a reloaded history row), plus a matching sweep
  // refetch for the chart. Also covers the initial mount, so the first
  // paint isn't empty.
  useEffect(() => {
    const timer = setTimeout(() => {
      runEvaluate(inputs, false);
      runSweep(inputs);
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    inputs.data_size_mb,
    inputs.compute_demand_mi,
    inputs.deadline_ms,
    inputs.congestion_level,
    inputs.battery_priority,
  ]);

  function handleFieldChange(field, value) {
    setPresetIndex('custom');
    setInputs((prev) => ({ ...prev, [field]: value }));
  }

  function handlePresetChange(value) {
    setPresetIndex(value);
    if (value !== 'custom') {
      setInputs(PRESETS[Number(value)].inputs);
    }
  }

  function handleHistoryRowClick(row) {
    setPresetIndex('custom');
    setInputs({
      data_size_mb: row.data_size_mb,
      compute_demand_mi: row.compute_demand_mi,
      deadline_ms: row.deadline_ms,
      congestion_level: row.congestion_level,
      battery_priority: row.battery_priority,
    });
  }

  function handleEvaluateAndSave() {
    runEvaluate(inputs, true);
  }

  const taskSummary = `${inputs.data_size_mb} MB, ${inputs.compute_demand_mi} MI, ${inputs.deadline_ms} ms deadline`;

  return (
    <div className="min-h-screen bg-[#fbfbfd]">
      <Header />

      {unreachable && (
        <div className="border-b border-red-300 bg-red-50 px-6 py-3 text-sm font-medium text-red-700">
          Can't reach the server. Is the backend running on port 3001?
        </div>
      )}

      <main className="mx-auto w-full max-w-[1440px] px-6 py-6 lg:px-8">
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
          <aside className="xl:col-span-3">
            <LeftPanel
              inputs={inputs}
              onFieldChange={handleFieldChange}
              presetIndex={presetIndex}
              onPresetChange={handlePresetChange}
              onEvaluate={handleEvaluateAndSave}
              saving={saving}
              isSaved={isSaved}
            />
          </aside>

          <div className="space-y-6 xl:col-span-9">
            {error && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                {error}
              </div>
            )}

            <BranchCBanner result={result} />

            <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <ComparisonCards result={result} />
              </div>
              <div className="lg:col-span-5">
                <RecommendationPanel result={result} batteryPriority={inputs.battery_priority} />
              </div>
            </div>

            <CongestionChart
              sweep={sweep}
              currentCongestion={inputs.congestion_level}
              currentResult={result}
              taskSummary={taskSummary}
            />

            <section className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900">History &amp; analytics</h3>
              <StatsPanel stats={stats} />
              <HistoryTable decisions={decisions} onRowClick={handleHistoryRowClick} />
            </section>
          </div>
        </div>
      </main>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

export default App;
