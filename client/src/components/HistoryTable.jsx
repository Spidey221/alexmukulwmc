import { DEST_LABEL, DEST_PILL_CLASS } from '../destinations.js';

function formatTimestamp(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function HistoryTable({ decisions, onRowClick }) {
  if (decisions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
        No decisions evaluated yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
          <thead className="bg-slate-50/80 font-semibold text-slate-600">
            <tr>
              <th className="px-4 py-3" scope="col">Data size (MB)</th>
              <th className="px-4 py-3" scope="col">Compute (MI)</th>
              <th className="px-4 py-3" scope="col">Congestion</th>
              <th className="px-4 py-3" scope="col">Battery priority</th>
              <th className="px-4 py-3" scope="col">Recommended</th>
              <th className="px-4 py-3" scope="col">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {decisions.map((row) => {
              const dest = row.recommended.toLowerCase();
              return (
                <tr
                  key={row.id}
                  onClick={() => onRowClick(row)}
                  className="cursor-pointer transition-colors hover:bg-slate-50/60"
                  title="Click to reload this scenario"
                >
                  <td className="px-4 py-3 tabular-nums text-slate-700">{row.data_size_mb}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-700">{row.compute_demand_mi}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-700">{Math.round(row.congestion_level * 100)}%</td>
                  <td className="px-4 py-3 tabular-nums text-slate-700">{Math.round(row.battery_priority * 100)}%</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold ${DEST_PILL_CLASS[dest]}`}
                    >
                      {DEST_LABEL[dest].toUpperCase()}
                    </span>
                    {row.all_infeasible && <span className="ml-1.5 text-[11px] text-amber-600">⚠</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{formatTimestamp(row.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
