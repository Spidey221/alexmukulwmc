import { DEST_COLOR, DEST_LABEL, DESTS } from '../destinations.js';

const X0 = 50;
const X1 = 740;
const Y0 = 34;
const Y1 = 200;
const BAND_Y = 8;
const BAND_H = 12;

function niceMax(rawMax) {
  if (!Number.isFinite(rawMax) || rawMax <= 0) return 100;
  const exponent = Math.floor(Math.log10(rawMax));
  const fraction = rawMax / Math.pow(10, exponent);
  let niceFraction;
  if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;
  return niceFraction * Math.pow(10, exponent);
}

// Contiguous runs of the same (recommended, all_infeasible) across the
// sweep -- computed from the actual response, never hardcoded.
function buildBands(points) {
  const bands = [];
  let startIdx = 0;
  for (let i = 1; i <= points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const changed = !curr || curr.recommended !== prev.recommended || curr.all_infeasible !== prev.all_infeasible;
    if (changed) {
      bands.push({
        from: points[startIdx].congestion_level,
        lastPoint: prev.congestion_level,
        recommended: prev.recommended,
        all_infeasible: prev.all_infeasible,
      });
      startIdx = i;
    }
  }
  return bands.map((band, i) => ({
    ...band,
    to: i < bands.length - 1 ? bands[i + 1].from : 1,
  }));
}

export default function CongestionChart({ sweep, currentCongestion, currentResult, taskSummary }) {
  if (!sweep || sweep.points.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900">Latency vs. network congestion</h3>
        <div className="mt-4 flex h-[220px] items-center justify-center text-sm text-slate-400">
          Loading chart…
        </div>
      </div>
    );
  }

  const { points, deadline_ms } = sweep;
  const rawMax = Math.max(deadline_ms, ...points.flatMap((p) => DESTS.map((d) => p[d].latency_ms))) * 1.08;
  const maxVal = niceMax(rawMax);

  const x = (c) => X0 + c * (X1 - X0);
  const y = (v) => Y1 - (Math.min(v, maxVal) / maxVal) * (Y1 - Y0);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxVal * f));
  const xTicks = [0, 0.25, 0.5, 0.75, 1];

  const bands = buildBands(points);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="mb-4 flex flex-col justify-between gap-1 sm:flex-row sm:items-baseline">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Latency vs. network congestion</h3>
          {taskSummary && <p className="mt-0.5 text-xs text-slate-500">Current task: {taskSummary}</p>}
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-600">
          {DESTS.map((d) => (
            <span key={d} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: DEST_COLOR[d] }} />
              {DEST_LABEL[d]}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="w-3 border-b-2 border-dashed border-red-500" />
            Deadline
          </span>
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <div className="h-[260px] min-w-[640px]">
          <svg className="h-full w-full overflow-visible" viewBox="0 0 760 224" preserveAspectRatio="none">
            {yTicks.map((v) => (
              <line key={v} x1={X0} x2={X1} y1={y(v)} y2={y(v)} stroke="#f1f5f9" strokeWidth="1" />
            ))}

            {bands.map((band, i) => {
              const bx = x(band.from);
              const bw = x(band.to) - bx;
              const color = band.all_infeasible ? '#d97706' : DEST_COLOR[band.recommended.toLowerCase()];
              const bg = band.all_infeasible ? '#fffbeb' : `${color}14`;
              const border = band.all_infeasible ? '#fde68a' : `${color}55`;
              const fromPct = Math.round(band.from * 100);
              const toPct = Math.round(band.to * 100);
              const label = band.all_infeasible
                ? `ALL MISS DEADLINE — ${band.recommended} FALLBACK`
                : `${band.recommended} RECOMMENDED (${fromPct}%–${toPct}%)`;
              return (
                <g key={i}>
                  <rect x={bx} y={BAND_Y} width={bw} height={BAND_H} rx="3" fill={bg} stroke={border} strokeWidth="0.8" />
                  {bw > 90 && (
                    <text
                      x={bx + bw / 2}
                      y={BAND_Y + 8.5}
                      fontSize="8.5"
                      fontWeight="600"
                      textAnchor="middle"
                      fill={color}
                    >
                      {label}
                    </text>
                  )}
                </g>
              );
            })}

            {yTicks.map((v) => (
              <text key={v} x={X0 - 9} y={y(v) + 3} fontSize="10" textAnchor="end" fill="#94a3b8">
                {v} ms
              </text>
            ))}
            {xTicks.map((f) => (
              <text key={f} x={x(f)} y={Y1 + 17} fontSize="10" textAnchor="middle" fill="#94a3b8">
                {Math.round(f * 100)}%
              </text>
            ))}

            <line x1={X0} x2={X1} y1={y(deadline_ms)} y2={y(deadline_ms)} stroke="#ef4444" strokeDasharray="4 4" strokeWidth="1.5" />
            <rect x={X1 - 70} y={y(deadline_ms) - 17} width="70" height="15" rx="3" fill="#fef2f2" stroke="#fecaca" strokeWidth="1" />
            <text x={X1 - 35} y={y(deadline_ms) - 6} fontSize="9" fontWeight="600" textAnchor="middle" fill="#dc2626">
              Deadline {deadline_ms}ms
            </text>

            {DESTS.map((dest) => (
              <polyline
                key={dest}
                points={points.map((p) => `${x(p.congestion_level)},${y(p[dest].latency_ms)}`).join(' ')}
                fill="none"
                stroke={DEST_COLOR[dest]}
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}

            {currentCongestion !== undefined && (
              <>
                <line
                  x1={x(currentCongestion)}
                  x2={x(currentCongestion)}
                  y1={Y0 - 14}
                  y2={Y1}
                  stroke="#64748b"
                  strokeDasharray="3 3"
                  strokeWidth="1.2"
                />
                <rect x={x(currentCongestion) - 23} y={Y1 + 3} width="46" height="14" rx="2" fill="#0f172a" />
                <text x={x(currentCongestion)} y={Y1 + 13} fontSize="8.5" fontWeight="600" textAnchor="middle" fill="#ffffff">
                  Current
                </text>
                {currentResult &&
                  DESTS.map((dest) => (
                    <circle
                      key={dest}
                      cx={x(currentCongestion)}
                      cy={y(currentResult[dest].latency_ms)}
                      r="4.5"
                      fill={DEST_COLOR[dest]}
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  ))}
              </>
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}
