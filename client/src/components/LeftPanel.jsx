import { PRESETS, INPUT_RANGES } from '../presets.js';

const SLIDER_CONFIG = [
  { field: 'data_size_mb', label: 'Data size', unit: 'MB', step: 0.05, percent: false },
  { field: 'compute_demand_mi', label: 'Compute demand', unit: 'MI', step: 50, percent: false },
  { field: 'deadline_ms', label: 'Deadline', unit: 'ms', step: 10, percent: false },
  { field: 'congestion_level', label: 'Network congestion', unit: '', step: 0.01, percent: true },
  { field: 'battery_priority', label: 'Battery priority', unit: '', step: 0.01, percent: true },
];

function formatValue(value, unit, percent) {
  if (percent) return `${Math.round(value * 100)}%`;
  return `${value} ${unit}`;
}

function formatBound(value, unit, percent) {
  if (percent) return `${Math.round(value * 100)}%`;
  return `${value} ${unit}`;
}

export default function LeftPanel({ inputs, onFieldChange, presetIndex, onPresetChange, onEvaluate, saving, isSaved }) {
  return (
    <aside className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">Task parameters</h2>
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-slate-700" htmlFor="preset-select">
          Preset scenario
        </label>
        <select
          id="preset-select"
          value={presetIndex}
          onChange={(e) => onPresetChange(e.target.value)}
          className="w-full rounded-lg border-slate-200 bg-slate-50/50 py-2 pl-3 pr-8 text-xs font-medium text-slate-800 shadow-xs focus:border-slate-400 focus:ring-0"
        >
          <option value="custom">Custom</option>
          {PRESETS.map((preset, i) => (
            <option key={preset.name} value={i}>
              {preset.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-4 pt-1">
        {SLIDER_CONFIG.map(({ field, label, unit, step, percent }) => {
          const { min, max } = INPUT_RANGES[field];
          return (
            <div key={field} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">{label}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-800 tabular-nums">
                  {formatValue(inputs[field], unit, percent)}
                </span>
              </div>
              {field === 'battery_priority' && (
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Latency-focused</span>
                  <span>Energy-focused</span>
                </div>
              )}
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={inputs[field]}
                onChange={(e) => onFieldChange(field, Number(e.target.value))}
                className="h-1.5 w-full rounded-lg bg-slate-200"
                aria-label={label}
              />
              {field !== 'battery_priority' && (
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>{formatBound(min, unit, percent)}</span>
                  <span>{formatBound(max, unit, percent)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-3">
        <p className="text-center text-[11px] text-slate-400" aria-live="polite">
          {isSaved ? 'Saved to history' : 'Preview — not saved'}
        </p>
        <button
          onClick={onEvaluate}
          disabled={saving}
          type="button"
          className="w-full cursor-pointer rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-medium text-white shadow-xs transition-colors duration-150 hover:bg-slate-800 active:bg-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Evaluate & save'}
        </button>
      </div>
    </aside>
  );
}
