import { DEST_COLOR, DEST_LABEL, DESTS } from '../destinations.js';
import useAnimatedNumber from '../hooks/useAnimatedNumber.js';

function StatCard({ label, value, suffix, decimals = 0 }) {
  const animated = useAnimatedNumber(value);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <div className="mt-2 text-3xl font-bold tracking-tight tabular-nums text-slate-900">
        {animated.toFixed(decimals)}
        {suffix && <span className="ml-1 text-base font-normal text-slate-400">{suffix}</span>}
      </div>
    </div>
  );
}

export default function StatsPanel({ stats }) {
  if (!stats || stats.total_evaluated === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
        Stats will appear after at least one evaluation.
      </div>
    );
  }

  const maxCount = Math.max(1, stats.distribution.local, stats.distribution.edge, stats.distribution.cloud);

  return (
    <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Total evaluated" value={stats.total_evaluated} decimals={0} />
      <StatCard label="Deadline success rate" value={stats.deadline_success_rate} suffix="%" decimals={1} />
      <StatCard label="Avg. latency" value={stats.avg_latency_ms} suffix="ms" decimals={1} />

      <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <span className="block text-xs font-semibold text-slate-500">Recommendation distribution</span>
        <div className="space-y-2 text-xs">
          {DESTS.map((dest) => {
            const count = stats.distribution[dest] ?? 0;
            const pct = stats.total_evaluated > 0 ? (100 * count) / stats.total_evaluated : 0;
            return (
              <div key={dest}>
                <div className="mb-1 flex justify-between text-[11px]">
                  <span className="font-medium text-slate-700">{DEST_LABEL[dest]}</span>
                  <span className="tabular-nums text-slate-500">
                    {count} ({pct.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full transition-all duration-motion motion-reduce:transition-none"
                    style={{ width: `${(count / maxCount) * 100}%`, backgroundColor: DEST_COLOR[dest] }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
