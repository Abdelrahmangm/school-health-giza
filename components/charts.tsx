// Small dependency-free SVG charts rendered on the server (no client JavaScript).
const ar = (n: number) => n.toLocaleString("ar-EG", { maximumFractionDigits: 1 });
const short = (n: number) => (n >= 1000 ? ar(Math.round(n / 100) / 10) + " ألف" : ar(n));

/** Smooth path through points (Catmull-Rom → cubic Bézier). */
function smooth(points: [number, number][]) {
  if (points.length < 2) return points.length ? `M${points[0][0]},${points[0][1]}` : "";
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i], p1 = points[i], p2 = points[i + 1], p3 = points[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export function AreaChart({ series, labels, title }: { series: number[]; labels: string[]; title: string }) {
  const W = 320, H = 170, left = 44, bottom = 24, top = 10;
  if (!series.length) return <p className="empty small">لسه مفيش أسابيع معتمدة في الفترة دي.</p>;
  const max = Math.max(...series, 1);
  const nice = Math.ceil(max / 3 / Math.pow(10, Math.floor(Math.log10(max / 3 || 1)))) * Math.pow(10, Math.floor(Math.log10(max / 3 || 1))) * 3;
  const x = (i: number) => left + (series.length === 1 ? (W - left) / 2 : (i * (W - left - 6)) / (series.length - 1));
  const y = (v: number) => top + (H - top - bottom) * (1 - v / nice);
  const pts = series.map((v, i) => [Math.round(x(i)), Math.round(y(v))] as [number, number]);
  const line = smooth(pts);
  const area = `${line} L${pts.at(-1)![0]},${H - bottom} L${pts[0][0]},${H - bottom} Z`;
  const ticks = [nice / 3, (2 * nice) / 3, nice];
  const every = Math.max(1, Math.ceil(labels.length / 5));
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} style={{ direction: "ltr" }}>
      <defs>
        <linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--mustard)" stopOpacity=".28" />
          <stop offset="1" stopColor="var(--mustard)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <text key={t} x={left - 8} y={y(t) + 4} textAnchor="end" className="chart-tick">
          {short(t)}
        </text>
      ))}
      <path d={area} fill="url(#areaFill)" />
      <path d={line} fill="none" stroke="var(--mustard)" strokeWidth="2.2" strokeLinecap="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="2.6" fill="var(--paper)" stroke="var(--mustard)" strokeWidth="1.6">
          <title>{`${labels[i]}: ${ar(series[i])}`}</title>
        </circle>
      ))}
      {labels.map((l, i) =>
        i % every === 0 || i === labels.length - 1 ? (
          <text key={l} x={x(i)} y={H - 6} textAnchor="middle" className="chart-tick">
            {l}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const W = 72, H = 30;
  if (values.length < 2) return <svg className="spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" />;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [Math.round((i * W) / (values.length - 1)), Math.round(H - 3 - (v / max) * (H - 8))] as [number, number]);
  const line = smooth(pts);
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ direction: "ltr" }}>
      <path d={`${line} L${W},${H} L0,${H} Z`} fill="var(--green-soft)" />
      <path d={line} fill="none" stroke="var(--green)" strokeWidth="1.6" />
    </svg>
  );
}

/** Hexagonal radar for up to six rates (percent of screened). */
export function Radar({ items }: { items: { label: string; value: number }[] }) {
  const S = 180, c = S / 2, R = 70;
  const n = 6;
  const data = items.slice(0, n);
  if (data.length < 3) return <p className="empty small">محتاج ٣ مؤشرات على الأقل.</p>;
  const max = Math.max(...data.map((d) => d.value), 0.0001);
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [c + r * Math.cos(a), c + r * Math.sin(a)];
  };
  const ring = (r: number) => Array.from({ length: n }, (_, i) => pt(i, r).map((v) => v.toFixed(1)).join(",")).join(" ");
  const shape = Array.from({ length: n }, (_, i) => pt(i, data[i] ? (0.25 + 0.75 * (data[i].value / max)) * R : 0.25 * R).map((v) => v.toFixed(1)).join(",")).join(" ");
  return (
    <svg className="radar" viewBox={`0 0 ${S} ${S}`} role="img" aria-label={"أعلى المؤشرات: " + data.map((d) => `${d.label} ${ar(d.value)}٪`).join("، ")}>
      {[1, 0.72, 0.44].map((k) => (
        <polygon key={k} points={ring(R * k)} fill="none" stroke="var(--line-strong)" strokeWidth="1" />
      ))}
      <polygon points={shape} fill="var(--teal-soft)" stroke="var(--teal-ink)" strokeWidth="1.4" strokeDasharray="4 3" />
      {data.map((d, i) => {
        const [x, y] = pt(i, R + 14);
        return (
          <text key={d.label} x={x} y={y + 3} textAnchor="middle" className="radar-label">
            {d.label.length > 9 ? d.label.slice(0, 9) + "…" : d.label}
          </text>
        );
      })}
    </svg>
  );
}

/** U-shaped gauge (like the reference) with the value written inside. */
export function Gauge({ value, title, caption }: { value: number | null; title: string; caption: string }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  const W = 260, cx = W / 2, cy = 18, R = 112;
  // Arc from the left top (180°) down through the bottom to the right top (0°): angle = 180 - 180*t.
  const at = (t: number) => {
    const a = Math.PI - Math.PI * t;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  };
  const [ex, ey] = at(v / 100);
  const [sx, sy] = at(0);
  const [fx, fy] = at(1);
  return (
    <div className="gauge" title={caption}>
      <svg viewBox={`0 0 ${W} 140`} aria-hidden="true">
        <path d={`M${sx},${sy} A${R},${R} 0 0 0 ${fx},${fy}`} fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="2" />
        <path d={`M${cx - R + 9},${cy} A${R - 9},${R - 9} 0 0 0 ${cx + R - 9},${cy}`} fill="none" stroke="#fff" strokeOpacity=".9" strokeWidth="2" />
        <path d={`M${sx},${sy} A${R},${R} 0 0 0 ${ex.toFixed(1)},${ey.toFixed(1)}`} fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
        <circle cx={ex} cy={ey} r="8" fill="#fff" />
        <circle cx={ex} cy={ey} r="3.4" fill="var(--mustard-deep)" />
      </svg>
      <div className="gauge-text">
        <UiIconHand />
        <strong>{value === null ? "—" : ar(value) + "٪"}</strong>
        <span>{title}</span>
      </div>
    </div>
  );
}
function UiIconHand() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 15h4l5 3h5a2 2 0 0 0 0-4h-4 M7 15v5 M3 20h4" />
      <ellipse cx="14" cy="6.5" rx="3.2" ry="2" transform="rotate(-25 14 6.5)" />
    </svg>
  );
}
