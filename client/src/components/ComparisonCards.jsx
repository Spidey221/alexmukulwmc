import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DEST_COLOR, DEST_LABEL, DESTS } from '../destinations.js';
import useAnimatedNumber from '../hooks/useAnimatedNumber.js';
import LatencyBreakdownPopover from './LatencyBreakdownPopover.jsx';

const POPOVER_HEIGHT_ESTIMATE = 190;

function DeadlineBadge({ violated }) {
  return violated ? (
    <span className="inline-flex items-center rounded border border-red-200 bg-[#fef2f2] px-1.5 py-0.5 text-[10px] font-semibold text-[#dc2626]">
      MISSED
    </span>
  ) : (
    <span className="inline-flex items-center rounded border border-green-200 bg-[#f0fdf4] px-1.5 py-0.5 text-[10px] font-semibold text-[#15803d]">
      OK
    </span>
  );
}

function Card({ dest, data, isWinner, registerRef }) {
  const localRef = useRef(null);
  const [popover, setPopover] = useState(null); // null | 'top' | 'bottom'
  const animatedLatency = useAnimatedNumber(data.latency_ms);
  const animatedEnergy = useAnimatedNumber(data.energy_mj);
  const animatedCost = useAnimatedNumber(data.cost);

  function openPopover() {
    const rect = localRef.current?.getBoundingClientRect();
    const placement = rect && rect.top < POPOVER_HEIGHT_ESTIMATE + 16 ? 'bottom' : 'top';
    setPopover(placement);
  }
  function closePopover() {
    setPopover(null);
  }

  const color = DEST_COLOR[dest];

  return (
    <div
      ref={(el) => {
        localRef.current = el;
        registerRef?.(dest, el);
      }}
      tabIndex={0}
      onMouseEnter={openPopover}
      onMouseLeave={closePopover}
      onFocus={openPopover}
      onBlur={closePopover}
      className={`relative flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-xs outline-none transition-opacity duration-motion motion-reduce:transition-none ${
        !isWinner && data.deadline_violated ? 'opacity-70' : 'opacity-100'
      }`}
      style={isWinner ? { backgroundColor: `${color}0d` } : undefined}
    >
      {popover && <LatencyBreakdownPopover breakdown={data.breakdown} latencyMs={data.latency_ms} placement={popover} />}

      <div className="flex items-center justify-between pb-1">
        <span className="text-xs font-semibold" style={{ color: isWinner ? color : '#334155' }}>
          {DEST_LABEL[dest]}
        </span>
        {isWinner && (
          <span
            className="rounded-full border px-2 py-0.5 text-[11px] font-medium"
            style={{ color, borderColor: `${color}55`, backgroundColor: `${color}1a` }}
          >
            ✓ Recommended
          </span>
        )}
      </div>

      <div className="mt-1.5">
        <div className="text-2xl font-bold tracking-tight tabular-nums text-slate-900">
          {animatedLatency.toFixed(1)} <span className="text-xs font-normal text-slate-500">ms</span>
        </div>
        <div className="mt-0.5 text-xs tabular-nums text-slate-600">{animatedEnergy.toFixed(1)} mJ</div>
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-2.5">
        <span className="text-[11px] tabular-nums text-slate-500">cost {animatedCost.toFixed(3)}</span>
        <DeadlineBadge violated={data.deadline_violated} />
      </div>
    </div>
  );
}

export default function ComparisonCards({ result }) {
  const containerRef = useRef(null);
  const cardEls = useRef({});
  const [ring, setRing] = useState(null);
  const recommended = result?.recommended;

  const measureRing = useCallback(() => {
    if (!recommended) {
      setRing(null);
      return;
    }
    const dest = recommended.toLowerCase();
    const cardEl = cardEls.current[dest];
    const containerEl = containerRef.current;
    if (!cardEl || !containerEl) return;
    const cardBox = cardEl.getBoundingClientRect();
    const containerBox = containerEl.getBoundingClientRect();
    setRing({
      left: cardBox.left - containerBox.left,
      top: cardBox.top - containerBox.top,
      width: cardBox.width,
      height: cardBox.height,
      color: DEST_COLOR[dest],
    });
  }, [recommended]);

  useLayoutEffect(() => {
    measureRing();
  }, [measureRing]);

  // Card heights can shift after this first measurement -- e.g. the Inter
  // webfont finishing its async load and reflowing text metrics, or a
  // window resize -- so keep the ring glued to the actual card box rather
  // than trusting a one-time measurement.
  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measureRing());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [measureRing]);

  if (!result) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-400">
        Evaluate a task to see the Local / Edge / Cloud comparison.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative grid grid-cols-1 gap-3.5 sm:grid-cols-3">
      {ring && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-xl border-2 transition-all duration-motion ease-out motion-reduce:transition-none"
          style={{
            left: ring.left,
            top: ring.top,
            width: ring.width,
            height: ring.height,
            borderColor: ring.color,
          }}
        />
      )}
      {DESTS.map((dest) => (
        <Card
          key={dest}
          dest={dest}
          data={result[dest]}
          isWinner={result.recommended === dest.toUpperCase()}
          registerRef={(d, el) => {
            cardEls.current[d] = el;
          }}
        />
      ))}
    </div>
  );
}
