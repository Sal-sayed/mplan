// Sparkline — a tiny inline trend line (SVG polyline + end dot), matching the
// design target's stat-tile / table sparklines. Deterministic and dependency-free
// (the large Monitor chart uses recharts; these micro-charts are raw SVG, as the
// mockup itself draws them). `color` defaults to currentColor so it inherits.
interface SparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
  dot?: boolean;
  className?: string;
}

export function Sparkline({ data, color = 'currentColor', width = 88, height = 32, dot = true, className = '' }: SparklineProps) {
  if (!data || data.length < 2) return null;
  const pad = 3;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = (width - pad * 2) / (data.length - 1);
  const points = data.map((v, i) => {
    const x = pad + i * step;
    const y = pad + (height - pad * 2) * (1 - (v - min) / span);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const [lx, ly] = points[points.length - 1].split(',');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={`overflow-visible ${className}`} aria-hidden>
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {dot ? <circle cx={lx} cy={ly} r={2.6} fill={color} /> : null}
    </svg>
  );
}
