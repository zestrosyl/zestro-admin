import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Skeleton } from '../ui/Feedback';

export interface ChartPoint {
  label: string;
  value: number;
}

const MARGIN = { top: 14, right: 14, bottom: 30, left: 48 };

/** Round the axis maximum up to a friendly number so gridlines land on clean values. */
function niceMax(max: number): { max: number; step: number } {
  if (max <= 0) return { max: 4, step: 1 };
  const rough = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const frac = rough / pow;
  const stepBase = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10;
  const step = stepBase * pow;
  return { max: step * Math.ceil(max / step), step };
}

/** Monotone cubic interpolation so the curve never overshoots the data. */
function smoothPath(pts: Array<[number, number]>): string {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : '';
  const n = pts.length;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    slope.push((pts[i + 1][1] - pts[i][1]) / dx[i]);
  }
  const tan: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    tan.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  }
  tan.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tan[i] = 0;
      tan[i + 1] = 0;
    } else {
      const a = tan[i] / slope[i];
      const b = tan[i + 1] / slope[i];
      const h = Math.hypot(a, b);
      if (h > 3) {
        const t = 3 / h;
        tan[i] = t * a * slope[i];
        tan[i + 1] = t * b * slope[i];
      }
    }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const cx = dx[i] / 3;
    d += ` C${pts[i][0] + cx},${pts[i][1] + tan[i] * cx} ${pts[i + 1][0] - cx},${pts[i + 1][1] - tan[i + 1] * cx} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

/**
 * Dependency-free responsive area chart. It reads the theme through CSS variables,
 * supports mouse, touch and keyboard (arrow keys) inspection and exposes the data
 * to assistive technology as a hidden table.
 */
export const AreaChart: React.FC<{
  data: ChartPoint[];
  formatValue: (value: number) => string;
  formatAxis?: (value: number) => string;
  seriesName: string;
  height?: number;
}> = ({ data, formatValue, formatAxis, seriesName, height = 260 }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const gradientId = useId().replace(/:/g, '');

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geometry = useMemo(() => {
    const innerW = Math.max(width - MARGIN.left - MARGIN.right, 10);
    const innerH = height - MARGIN.top - MARGIN.bottom;
    const { max, step } = niceMax(Math.max(...data.map((d) => d.value), 0));
    const x = (i: number) => MARGIN.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
    const y = (v: number) => MARGIN.top + innerH - (v / max) * innerH;
    const ticks: number[] = [];
    for (let v = 0; v <= max + step / 2; v += step) ticks.push(v);
    const pts = data.map((d, i) => [x(i), y(d.value)] as [number, number]);
    return { innerW, innerH, ticks, x, y, pts, line: smoothPath(pts) };
  }, [data, width, height]);

  if (!data.length) return null;
  if (!width) {
    return (
      <div ref={wrapRef} style={{ height }}>
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  const { ticks, x, y, pts, line, innerH } = geometry;
  const baseY = MARGIN.top + innerH;
  const area = `${line} L${pts[pts.length - 1][0]},${baseY} L${pts[0][0]},${baseY} Z`;
  const axis = formatAxis ?? formatValue;

  const onPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    let dist = Infinity;
    pts.forEach(([cx], i) => {
      const d = Math.abs(cx - px);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    setActive(best);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setActive((a) => (a === null ? 0 : Math.min(a + 1, data.length - 1)));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setActive((a) => (a === null ? data.length - 1 : Math.max(a - 1, 0)));
    } else if (e.key === 'Escape') {
      setActive(null);
    }
  };

  const tip = active !== null ? { px: pts[active][0], py: pts[active][1], d: data[active] } : null;
  const tipLeft = tip ? Math.min(Math.max(tip.px, 64), width - 64) : 0;

  return (
    <div ref={wrapRef} className="relative" style={{ height }}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${seriesName}, ${data.length} points. Use left and right arrow keys to inspect values.`}
        tabIndex={0}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        className="touch-pan-y rounded-lg text-primary focus-visible:outline-primary"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.16" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} stroke="rgb(var(--c-line))" strokeDasharray={t === 0 ? undefined : '3 4'} />
            <text x={MARGIN.left - 10} y={y(t)} textAnchor="end" dominantBaseline="middle" className="tabular fill-ink-3 text-[11px]">
              {axis(t)}
            </text>
          </g>
        ))}

        {data.map((d, i) => (
          <text
            key={d.label}
            x={x(i)}
            y={height - 8}
            textAnchor="middle"
            className={`text-[11px] ${active === i ? 'fill-ink font-semibold' : 'fill-ink-3'}`}
          >
            {d.label}
          </text>
        ))}

        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />

        {tip && <line x1={tip.px} x2={tip.px} y1={MARGIN.top} y2={baseY} stroke="rgb(var(--c-line-strong))" />}

        {pts.map(([cx, cy], i) => (
          <circle
            key={data[i].label}
            cx={cx}
            cy={cy}
            r={active === i ? 5 : 3.25}
            fill="rgb(var(--c-surface))"
            stroke="currentColor"
            strokeWidth="2"
            style={{ transition: 'r 120ms ease' }}
          />
        ))}
      </svg>

      {tip && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-raised"
          style={{ left: tipLeft, top: Math.max(tip.py - 62, 0) }}
        >
          <p className="text-ink-3">{tip.d.label}</p>
          <p className="tabular mt-0.5 text-sm font-semibold text-ink">{formatValue(tip.d.value)}</p>
        </div>
      )}

      <table className="sr-only">
        <caption>{seriesName}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              <td>{formatValue(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
