import { DEST_COLOR, DEST_LABEL, DESTS } from '../destinations.js';

function extractWhy(explanation) {
  const idx = explanation.indexOf('Why:');
  if (idx === -1) return null;
  return explanation
    .slice(idx)
    .split('\n\n')[0]
    .replace(/\s*\n\s*/g, ' ');
}

function extractWarning(explanation) {
  const lines = explanation.split('\n');
  const idx = lines.findIndex((l) => l.startsWith('⚠'));
  if (idx === -1) return null;
  const next = lines[idx + 1];
  const wraps = next !== undefined && next !== '' && !next.startsWith('⚠');
  return wraps ? `${lines[idx]} ${next}` : lines[idx];
}

export default function RecommendationPanel({ result, batteryPriority }) {
  if (!result) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400">
        The recommendation will appear here after you evaluate a task.
      </div>
    );
  }

  const winnerDest = result.recommended.toLowerCase();
  const color = DEST_COLOR[winnerDest];
  const why = extractWhy(result.explanation);
  // Branch C's "⚠ ALL THREE OPTIONS MISS..." line is already the distinct
  // full-width banner (BranchCBanner) above this panel; only Branch B's
  // exclusion warning belongs inline here, or it'd be shown twice.
  const warning = result.all_infeasible ? null : extractWarning(result.explanation);

  return (
    <div className="flex h-full flex-col justify-between space-y-3.5 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div>
        <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">
          {result.all_infeasible ? 'Recommended (best available)' : 'Recommended'}
        </span>
        <div className="mt-1.5 text-4xl font-extrabold leading-none tracking-tight" style={{ color }}>
          {result.recommended}
        </div>
      </div>

      {warning && (
        <div className="rounded-lg border border-amber-200/90 bg-[#fffbeb] p-2.5 text-xs leading-relaxed text-[#d97706]">
          <span className="font-semibold">⚠</span> {warning.replace(/^⚠\s*/, '')}
        </div>
      )}

      <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-100 bg-slate-50/50 text-xs">
        {DESTS.map((dest) => (
          <div
            key={dest}
            className={`flex items-center justify-between gap-2 px-3 py-2 ${
              dest === winnerDest ? 'bg-white font-medium text-slate-800' : 'text-slate-500'
            }`}
          >
            <span className="font-semibold" style={{ color: dest === winnerDest ? color : undefined }}>
              {DEST_LABEL[dest]}
            </span>
            <span className="tabular-nums text-slate-600">{result[dest].latency_ms.toFixed(1)} ms</span>
            <span className="tabular-nums text-slate-600">{result[dest].energy_mj.toFixed(1)} mJ</span>
            {result[dest].deadline_violated ? (
              <span className="inline-flex rounded bg-[#fef2f2] px-1.5 py-0.5 text-[10px] font-semibold text-[#dc2626]">
                MISSED
              </span>
            ) : (
              <span className="inline-flex rounded bg-[#f0fdf4] px-1.5 py-0.5 text-[10px] font-semibold text-[#15803d]">
                OK
              </span>
            )}
          </div>
        ))}
      </div>

      <WeightingBar batteryPriority={batteryPriority} color={color} />

      {why && (
        <div className="border-t border-slate-100 pt-2 text-xs leading-normal text-slate-600">
          <span className="font-semibold text-slate-800">Why:</span> {why.replace(/^Why:\s*/, '')}
        </div>
      )}
    </div>
  );
}

function WeightingBar({ batteryPriority, color }) {
  // Plain arithmetic on the input the user already set (not a recomputation
  // of the decision itself), so this stays correct even for Branch C, whose
  // explanation template has no "Weighting used" line to parse.
  const energyPct = Math.round(100 * batteryPriority);
  const latencyPct = 100 - energyPct;

  return (
    <div className="space-y-1.5">
      <div className="text-[11px] text-slate-500">
        Weighting: {latencyPct}% latency · {energyPct}% energy
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full bg-slate-700" style={{ width: `${latencyPct}%` }} />
        <div className="h-full" style={{ width: `${energyPct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
