/* =============================================================================
 * CHARTS — tiny dependency-free SVG chart builders. Each returns an SVG string.
 * Colors come from CSS custom properties (see styles.css) so light & dark modes
 * are handled by the stylesheet, not here.
 * ===========================================================================*/
(function (global) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const NICE = (max) => {
    if (max <= 0) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(max)));
    const n = max / pow;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return step * pow;
  };

  /* ---- Line chart: series over ordered points ---------------------------- */
  function line(points, opts = {}) {
    const W = 560, H = 240, P = { t: 16, r: 16, b: 34, l: 40 };
    if (!points.length)
      return `<div class="chart-empty">No matches scouted yet.</div>`;
    const yMax = NICE(Math.max(1, ...points.map((p) => p.y)));
    const iw = W - P.l - P.r, ih = H - P.t - P.b;
    const x = (i) => P.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
    const y = (v) => P.t + ih - (v / yMax) * ih;

    const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
      const gy = P.t + ih - f * ih;
      return `<line x1="${P.l}" y1="${gy}" x2="${W - P.r}" y2="${gy}" class="grid"/>
        <text x="${P.l - 6}" y="${gy + 4}" class="axis" text-anchor="end">${Math.round(f * yMax)}</text>`;
    }).join("");

    const path = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.y)}`).join(" ");
    const dots = points.map((p, i) =>
      `<circle cx="${x(i)}" cy="${y(p.y)}" r="4" class="dot">
         <title>${esc(p.label)}: ${p.y} pts</title></circle>`).join("");
    const xlabels = points.map((p, i) =>
      `<text x="${x(i)}" y="${H - 12}" class="axis" text-anchor="middle">${esc(p.label)}</text>`).join("");

    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Match score trend">
      ${grid}
      <path d="${path}" class="line"/>
      ${dots}${xlabels}
    </svg>`;
  }

  /* ---- Horizontal bars: labeled values (phase breakdown, metric profile) -- */
  function bars(items, opts = {}) {
    if (!items.length) return `<div class="chart-empty">No data.</div>`;
    const W = 560, rowH = 30, P = { t: 8, r: 60, b: 8, l: 130 };
    const H = P.t + P.b + items.length * rowH;
    const iw = W - P.l - P.r;
    const vMax = NICE(Math.max(1, ...items.map((d) => d.value)));
    const rows = items.map((d, i) => {
      const cy = P.t + i * rowH;
      // Each bar can carry its own `max` (e.g. a rating out of 5) so its length
      // reflects its share of ITS OWN scale — a 5/5 fills the bar just like 100%.
      const scaleMax = d.max || vMax;
      const w = (d.value / scaleMax) * iw;
      const color = d.color || `var(--series-${(i % 8) + 1})`;
      return `
        <text x="${P.l - 8}" y="${cy + 20}" class="axis" text-anchor="end">${esc(d.label)}</text>
        <rect x="${P.l}" y="${cy + 8}" width="${Math.max(2, w)}" height="14" rx="4"
              fill="${color}"><title>${esc(d.label)}: ${round(d.value)}</title></rect>
        <text x="${P.l + Math.max(2, w) + 6}" y="${cy + 20}" class="val">${round(d.value)}${d.suffix || ""}</text>`;
    }).join("");
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(opts.title || "bars")}">${rows}</svg>`;
  }

  const round = (n) => (Math.abs(n % 1) < 0.05 ? Math.round(n) : n.toFixed(1));

  global.FTC = global.FTC || {};
  global.FTC.Charts = { line, bars };
})(typeof window !== "undefined" ? window : globalThis);
