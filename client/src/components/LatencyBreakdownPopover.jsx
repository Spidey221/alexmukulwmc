const COMPONENTS = [
  { key: 'upload_ms', label: 'Upload', color: 'bg-blue-600' },
  { key: 'network_ms', label: 'Network', color: 'bg-sky-400' },
  { key: 'congestion_ms', label: 'Congestion delay', color: 'bg-amber-500' },
  { key: 'compute_ms', label: 'Compute', color: 'bg-indigo-500' },
];

export default function LatencyBreakdownPopover({ breakdown, latencyMs, placement }) {
  const total = Math.max(latencyMs, 0.0001);

  return (
    <div
      role="tooltip"
      className={`absolute left-1/2 z-20 w-64 -translate-x-1/2 rounded-xl border border-slate-200/90 bg-white p-3 text-slate-800 shadow-lg ${
        placement === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2'
      }`}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-900">Latency breakdown</span>
        <span className="text-[11px] font-bold tabular-nums text-slate-900">{latencyMs.toFixed(1)} ms</span>
      </div>

      <div className="mb-2 flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
        {COMPONENTS.map(({ key, label, color }) => (
          <div
            key={key}
            className={`h-full ${color}`}
            style={{ width: `${(breakdown[key] / total) * 100}%` }}
            title={`${label}: ${breakdown[key].toFixed(1)}ms`}
          />
        ))}
      </div>

      <div className="space-y-0.5 text-[10px] text-slate-600">
        {COMPONENTS.map(({ key, label, color }) => (
          <div key={key} className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
              {label}
            </span>
            <span className="font-medium tabular-nums text-slate-900">{breakdown[key].toFixed(1)} ms</span>
          </div>
        ))}
      </div>

      <div
        className={`absolute left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-slate-200 bg-white ${
          placement === 'bottom'
            ? '-top-1.5 border-l border-t'
            : '-bottom-1.5 border-b border-r'
        }`}
      />
    </div>
  );
}
