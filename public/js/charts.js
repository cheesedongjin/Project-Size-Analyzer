// 의존성 없는 SVG/HTML 차트 모음. 모든 툴팁은 data-tip(텍스트)로 처리.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const fmt = {
  num: (n) => Math.round(n || 0).toLocaleString('ko-KR'),
  compact(n) {
    n = n || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return Math.round(n).toLocaleString('ko-KR');
  },
  bytes(b) {
    b = b || 0;
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return `${b.toFixed(i === 0 ? 0 : b < 10 ? 2 : 1)} ${u[i]}`;
  },
  pct: (v, d = 1) => `${((v || 0) * 100).toFixed(d)}%`,
  date: (t) => (t ? new Date(t).toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' }) : '-'),
  dateTime: (t) => (t ? new Date(t).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : '-'),
  duration(days) {
    if (days < 60) return `${days}일`;
    if (days < 730) return `${(days / 30.4).toFixed(1)}개월`;
    return `${(days / 365.25).toFixed(1)}년`;
  },
};

// ── 툴팁 (전역 위임)
let tipEl;
export function initTooltips() {
  tipEl = document.createElement('div');
  tipEl.className = 'tooltip';
  document.body.appendChild(tipEl);
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t) { tipEl.classList.remove('show'); return; }
    tipEl.textContent = t.getAttribute('data-tip');
    tipEl.classList.add('show');
  });
  document.addEventListener('mousemove', (e) => {
    if (!tipEl.classList.contains('show')) return;
    const pad = 14, w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + w > innerWidth - 8) x = e.clientX - w - pad;
    if (y + h > innerHeight - 8) y = e.clientY - h - pad;
    tipEl.style.transform = `translate(${x}px, ${y}px)`;
  });
  document.addEventListener('scroll', () => tipEl.classList.remove('show'), true);
}

// ── 도넛 차트
export function donut(items, { size = 200, thickness = 30, centerValue = '', centerLabel = '' } = {}) {
  const total = items.reduce((a, i) => a + i.value, 0) || 1;
  const r = size / 2 - 2, ri = r - thickness, cx = size / 2, cy = size / 2;
  let a0 = -Math.PI / 2;
  const paths = items.filter((i) => i.value > 0).map((it) => {
    const frac = it.value / total;
    const a1 = a0 + frac * Math.PI * 2 - (frac >= 1 ? 1e-4 : 0);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad, ang) => `${(cx + rad * Math.cos(ang)).toFixed(2)} ${(cy + rad * Math.sin(ang)).toFixed(2)}`;
    const d = `M${p(r, a0)} A${r} ${r} 0 ${large} 1 ${p(r, a1)} L${p(ri, a1)} A${ri} ${ri} 0 ${large} 0 ${p(ri, a0)}Z`;
    a0 = a1 + (frac >= 1 ? 1e-4 : 0);
    return `<path d="${d}" fill="${esc(it.color)}" data-tip="${esc(`${it.label}: ${it.display ?? fmt.num(it.value)} (${fmt.pct(frac)})`)}"/>`;
  }).join('');
  return `<svg class="donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img">
    <circle cx="${cx}" cy="${cy}" r="${r - thickness / 2}" fill="none" stroke="var(--track)" stroke-width="${thickness}"/>
    ${paths}
    <text x="50%" y="48%" class="donut-value">${esc(centerValue)}</text>
    <text x="50%" y="62%" class="donut-label">${esc(centerLabel)}</text>
  </svg>`;
}

// ── 범례
export function legend(items, total, { formatter = fmt.num, max = 12 } = {}) {
  total = total || items.reduce((a, i) => a + i.value, 0) || 1;
  const shown = items.slice(0, max);
  const rest = items.slice(max).reduce((a, i) => a + i.value, 0);
  const row = (color, label, value) => `<li><span class="dot" style="background:${esc(color)}"></span><span class="lg-label">${esc(label)}</span><span class="lg-value">${formatter(value)}</span><span class="lg-pct">${fmt.pct(value / total)}</span></li>`;
  return `<ul class="legend">${shown.map((i) => row(i.color, i.label, i.value)).join('')}${rest > 0 ? row('var(--muted)', `기타 ${items.length - max}개`, rest) : ''}</ul>`;
}

// ── 비율 누적 막대 (GitHub 언어 막대 스타일)
export function stackBar(items, { height = 10 } = {}) {
  const total = items.reduce((a, i) => a + i.value, 0) || 1;
  return `<div class="stackbar" style="height:${height}px">${items.filter((i) => i.value / total > 0.001).map((i) =>
    `<span style="flex:${i.value};background:${esc(i.color)}" data-tip="${esc(`${i.label}: ${fmt.pct(i.value / total)}`)}"></span>`).join('')}</div>`;
}

// ── 가로 막대 목록
export function barList(items, { formatter = fmt.num, color = 'var(--accent)', max } = {}) {
  const m = max ?? Math.max(...items.map((i) => i.value), 1);
  return `<div class="barlist">${items.map((i) => `
    <div class="bl-row" ${i.tip ? `data-tip="${esc(i.tip)}"` : ''}>
      <div class="bl-label" title="${esc(i.label)}">${i.dot ? `<span class="dot" style="background:${esc(i.dot)}"></span>` : ''}${esc(i.label)}</div>
      <div class="bl-track"><div class="bl-fill" style="width:${Math.max(0.5, (i.value / m) * 100)}%;background:${esc(i.color || color)}"></div></div>
      <div class="bl-value">${formatter(i.value)}</div>
    </div>`).join('')}</div>`;
}

const niceMax = (v) => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

// ── 세로 막대(시계열/히스토그램)
export function columns(items, { height = 220, color = 'var(--accent)', labelEvery, tip = (i) => `${i.label}: ${fmt.num(i.value)}` } = {}) {
  if (!items.length) return '<div class="empty">데이터 없음</div>';
  const W = 800, H = height, padL = 44, padB = 26, padT = 10, padR = 8;
  const max = niceMax(Math.max(...items.map((i) => i.value)));
  const bw = (W - padL - padR) / items.length;
  const every = labelEvery || Math.max(1, Math.ceil(items.length / 12));
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const y = padT + (H - padT - padB) * (1 - f);
    return `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" class="gl"/><text x="${padL - 6}" y="${y + 4}" class="axis" text-anchor="end">${fmt.compact(max * f)}</text>`;
  }).join('');
  const bars = items.map((it, i) => {
    const h = ((H - padT - padB) * it.value) / max;
    const x = padL + i * bw;
    const label = i % every === 0 ? `<text x="${x + bw / 2}" y="${H - 8}" class="axis" text-anchor="middle">${esc(it.short ?? it.label)}</text>` : '';
    return `<rect x="${(x + Math.min(2, bw * 0.15)).toFixed(2)}" y="${(H - padB - h).toFixed(2)}" width="${Math.max(1, bw - Math.min(4, bw * 0.3)).toFixed(2)}" height="${Math.max(0, h).toFixed(2)}" rx="2" fill="${esc(it.color || color)}"/>
      <rect x="${x.toFixed(2)}" y="${padT}" width="${bw.toFixed(2)}" height="${H - padT - padB}" fill="transparent" data-tip="${esc(tip(it))}"/>${label}`;
  }).join('');
  return `<svg class="columns" viewBox="0 0 ${W} ${H}" width="100%">${grid}${bars}</svg>`;
}

// ── 반원 게이지
export function gauge(value, { label = '', size = 220 } = {}) {
  const r = size / 2 - 14, cx = size / 2, cy = size / 2 + 4;
  const a = Math.PI * (1 - Math.max(0, Math.min(100, value)) / 100);
  const x = cx + r * Math.cos(a), y = cy - r * Math.sin(a);
  const col = value < 20 ? 'var(--good)' : value < 40 ? '#7cc576' : value < 60 ? 'var(--warn)' : value < 80 ? '#f08a4b' : 'var(--bad)';
  return `<svg class="gauge" viewBox="0 0 ${size} ${size / 2 + 22}" width="${size}">
    <path d="M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}" class="gauge-track"/>
    ${value > 0 ? `<path d="M${cx - r} ${cy} A${r} ${r} 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}" stroke="${col}" class="gauge-fill"/>` : ''}
    <text x="${cx}" y="${cy - 14}" class="gauge-value">${Math.round(value)}</text>
    <text x="${cx}" y="${cy + 14}" class="gauge-label">${esc(label)}</text>
  </svg>`;
}

// ── 요일×시간 히트맵 (월~일, 0~23시)
export function punchcard(grid) {
  const days = ['월', '화', '수', '목', '금', '토', '일'];
  const max = Math.max(1, ...grid.flat());
  let html = '<div class="punch"><div></div>';
  for (let h = 0; h < 24; h++) html += `<div class="ph">${h % 3 === 0 ? h : ''}</div>`;
  grid.forEach((row, d) => {
    html += `<div class="pd">${days[d]}</div>`;
    row.forEach((v, h) => {
      const o = v ? 0.15 + 0.85 * (v / max) : 0;
      html += `<div class="pc" style="--o:${o.toFixed(3)}" data-tip="${days[d]}요일 ${h}시: ${v}커밋"></div>`;
    });
  });
  return html + '</div>';
}

// ── Squarified treemap
function worst(row, side) {
  let s = 0, mx = -Infinity, mn = Infinity;
  for (const r of row) { s += r.v; if (r.v > mx) mx = r.v; if (r.v < mn) mn = r.v; }
  const s2 = s * s, w2 = side * side;
  return Math.max((w2 * mx) / s2, s2 / (w2 * mn));
}

export function squarify(items, x, y, w, h) {
  const total = items.reduce((a, i) => a + i.value, 0);
  if (!total || w <= 0 || h <= 0) return [];
  const scale = (w * h) / total;
  let rest = items.map((i) => ({ item: i, v: i.value * scale }));
  const out = [];
  while (rest.length) {
    const side = Math.min(w, h);
    const row = [rest[0]];
    let i = 1;
    while (i < rest.length && worst([...row, rest[i]], side) <= worst(row, side)) row.push(rest[i++]);
    const s = row.reduce((a, r) => a + r.v, 0);
    if (w >= h) {
      const cw = s / h;
      let cy = y;
      for (const r of row) { const rh = r.v / cw; out.push({ item: r.item, x, y: cy, w: cw, h: rh }); cy += rh; }
      x += cw; w -= cw;
    } else {
      const rh = s / w;
      let cx = x;
      for (const r of row) { const rw = r.v / rh; out.push({ item: r.item, x: cx, y, w: rw, h: rh }); cx += rw; }
      y += rh; h -= rh;
    }
    rest = rest.slice(i);
  }
  return out;
}
