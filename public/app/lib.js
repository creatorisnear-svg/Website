// Shared helpers: DOM building, formatting, API client, charts, overlays.

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

/** el('div.card', {onclick}, [children]) */
export function el(spec, props = {}, children = []) {
  const [tagPart, ...classes] = String(spec).split('.');
  const node = document.createElement(tagPart || 'div');
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = [node.className, v].filter(Boolean).join(' ');
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function money(n, { cents = false } = {}) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0,
  });
}

export function moneyShort(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (Math.abs(v) >= 1000) return `$${Math.round(v / 1000)}k`;
  return `$${Math.round(v)}`;
}

export function pct(n, digits = 0) {
  return `${(Number(n) || 0).toFixed(digits)}%`;
}

export function phoneFmt(raw) {
  const d = String(raw || '').replace(/\D/g, '').replace(/^1/, '');
  if (d.length !== 10) return raw || '';
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

export function dateFmt(iso, { time = false } = {}) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  if (time) { opts.hour = 'numeric'; opts.minute = '2-digit'; }
  return d.toLocaleDateString('en-US', opts);
}

export function monthLabel(key) {
  if (!key) return '';
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short' });
}

export function relTime(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (Math.abs(mins) < 1) return 'just now';
  if (Math.abs(mins) < 60) return mins > 0 ? `${mins}m ago` : `in ${-mins}m`;
  const hrs = Math.round(mins / 60);
  if (Math.abs(hrs) < 24) return hrs > 0 ? `${hrs}h ago` : `in ${-hrs}h`;
  const days = Math.round(hrs / 24);
  if (Math.abs(days) < 30) return days > 0 ? `${days}d ago` : `in ${-days}d`;
  return dateFmt(iso);
}

export function isOverdue(iso) {
  return Boolean(iso) && new Date(iso).getTime() < Date.now();
}

export function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

async function request(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b ?? {}),
  patch: (p, b) => request('PATCH', p, b ?? {}),
  del: (p) => request('DELETE', p),
};

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

export function toast(message, kind = 'ok') {
  const t = el(`div.toast${kind === 'err' ? '.err' : ''}`, { text: message });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), kind === 'err' ? 4200 : 2400);
}

function mountOverlay(node, { center = false } = {}) {
  const overlay = el(`div.overlay${center ? '.center' : ''}`, {
    onclick: (e) => { if (e.target === overlay) close(); },
  }, [node]);
  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
  return close;
}

/** Right-hand drawer, used for lead detail. */
export function drawer({ title, subtitle, body, actions = [] }) {
  let close;
  const head = el('div.drawer-head', {}, [
    el('div', {}, [
      el('h2', { text: title }),
      subtitle ? el('div.sub', { text: subtitle }) : null,
    ]),
    el('button.x', { text: '×', title: 'Close', onclick: () => close() }),
  ]);
  const node = el('div.drawer', {}, [head, el('div.drawer-body', {}, [body, ...actions])]);
  close = mountOverlay(node);
  return { close, node };
}

/** Centered modal with footer buttons. `buttons` receive the close fn. */
export function modal({ title, body, buttons = [], width }) {
  let close;
  const foot = el('div.modal-foot', {}, buttons.map((b) =>
    el(`button.btn${b.variant ? `.btn-${b.variant}` : ''}`, {
      text: b.label,
      onclick: async (ev) => {
        if (b.onClick) {
          ev.target.disabled = true;
          try { await b.onClick(() => close()); } finally { ev.target.disabled = false; }
        } else close();
      },
    }),
  ));
  const node = el('div.modal', width ? { style: { width } } : {}, [
    el('div.modal-head', {}, [el('h2', { text: title }), el('button.x', { text: '×', onclick: () => close() })]),
    el('div.modal-body', {}, [body]),
    buttons.length ? foot : null,
  ]);
  close = mountOverlay(node, { center: true });
  return { close, node };
}

export function confirmDialog(message, onConfirm, { danger = true, confirmLabel = 'Delete' } = {}) {
  modal({
    title: 'Are you sure?',
    body: el('p', { text: message }),
    buttons: [
      { label: 'Cancel' },
      {
        label: confirmLabel,
        variant: danger ? 'danger' : 'primary',
        onClick: async (close) => { await onConfirm(); close(); },
      },
    ],
  });
}

export function copyText(text, label = 'Copied to clipboard') {
  const done = () => toast(label);
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallback());
  } else fallback();
  function fallback() {
    const ta = el('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch { toast('Could not copy', 'err'); }
    ta.remove();
  }
}

// ---------------------------------------------------------------------------
// Form helpers
// ---------------------------------------------------------------------------

export function field(label, input, hint) {
  return el('div.field', {}, [
    el('label', { text: label }),
    input,
    hint ? el('div.small.muted', { text: hint, style: { marginTop: '4px' } }) : null,
  ]);
}

export function input(name, opts = {}) {
  return el('input', { name, id: `f_${name}`, ...opts });
}

export function select(name, options, value, opts = {}) {
  const node = el('select', { name, id: `f_${name}`, ...opts });
  for (const o of options) {
    const v = typeof o === 'string' ? o : o.value;
    const l = typeof o === 'string' ? o : o.label;
    node.appendChild(el('option', { value: v, selected: String(v) === String(value ?? '') }, [l]));
  }
  node.value = value ?? '';
  return node;
}

export function formValues(root) {
  const out = {};
  for (const n of $$('input,select,textarea', root)) {
    if (!n.name) continue;
    out[n.name] = n.type === 'checkbox' ? n.checked : n.value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Charts (hand-drawn SVG — no library, works offline)
// ---------------------------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

/**
 * Grouped bar chart of monthly revenue.
 * series: [{ month, earned, pending, projected }]
 */
export function revenueChart(series, { height = 210 } = {}) {
  const W = Math.max(560, series.length * 62);
  const H = height;
  const padL = 52;
  const padR = 12;
  const padT = 14;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const max = Math.max(
    1,
    ...series.map((s) => (s.earned || 0) + (s.pending || 0) + (s.projected || 0)),
  );
  const niceMax = Math.ceil(max / 500) * 500 || 500;
  const y = (v) => padT + plotH - (v / niceMax) * plotH;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img' });

  // Gridlines + y labels
  for (let i = 0; i <= 4; i++) {
    const v = (niceMax / 4) * i;
    const yy = y(v);
    svg.appendChild(svgEl('line', { x1: padL, y1: yy, x2: W - padR, y2: yy, stroke: '#e2e7ef', 'stroke-width': 1 }));
    const label = svgEl('text', { x: padL - 8, y: yy + 4, 'text-anchor': 'end', fill: '#93a0b3', 'font-size': 10.5 });
    label.textContent = moneyShort(v);
    svg.appendChild(label);
  }

  const bandW = plotW / Math.max(1, series.length);
  const barW = Math.min(30, bandW * 0.5);

  series.forEach((s, i) => {
    const cx = padL + bandW * i + bandW / 2;
    const x = cx - barW / 2;
    let cursor = padT + plotH;

    const stack = [
      { v: s.earned || 0, fill: '#12855a' },
      { v: s.pending || 0, fill: '#c8a250' },
      { v: s.projected || 0, fill: '#cdd5e2' },
    ];
    for (const seg of stack) {
      if (seg.v <= 0) continue;
      const h = (seg.v / niceMax) * plotH;
      cursor -= h;
      const r = svgEl('rect', { x, y: cursor, width: barW, height: Math.max(1, h), fill: seg.fill, rx: 2 });
      const title = svgEl('title');
      title.textContent = `${s.month}: ${money(seg.v)}`;
      r.appendChild(title);
      svg.appendChild(r);
    }

    const lbl = svgEl('text', { x: cx, y: H - 10, 'text-anchor': 'middle', fill: '#6b788d', 'font-size': 10.5 });
    lbl.textContent = monthLabel(s.month);
    svg.appendChild(lbl);
  });

  svg.appendChild(svgEl('line', { x1: padL, y1: padT + plotH, x2: W - padR, y2: padT + plotH, stroke: '#cdd5e2', 'stroke-width': 1 }));

  return el('div.chart', {}, [
    svg,
    el('div.legend', { html:
      '<span><i style="background:#12855a"></i>Paid to you</span>' +
      '<span><i style="background:#c8a250"></i>Pending (under contract)</span>' +
      '<span><i style="background:#cdd5e2"></i>Projected</span>' }),
  ]);
}

/** Horizontal funnel bars. */
export function funnelChart(stages) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return el('div.funnel', {}, stages
    .filter((s) => s.id !== 'lost')
    .map((s) => el('div.frow', {}, [
      el('div.lbl', { text: s.label }),
      el('div.bar', {}, [el('span', { style: { width: `${Math.max(1.5, (s.count / max) * 100)}%` } })]),
      el('div.n', { html: `${s.count} <em>(${s.pctOfTotal}%)</em>` }),
    ])));
}

/** Simple donut for source mix. */
export function donut(slices, { size = 132, thickness = 20 } = {}) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size });
  let offset = 0;
  for (const s of slices) {
    if (s.value <= 0) continue;
    const frac = s.value / total;
    const circle = svgEl('circle', {
      cx: c, cy: c, r, fill: 'none', stroke: s.color, 'stroke-width': thickness,
      'stroke-dasharray': `${frac * circumference} ${circumference}`,
      'stroke-dashoffset': -offset * circumference,
      transform: `rotate(-90 ${c} ${c})`,
    });
    const title = svgEl('title');
    title.textContent = `${s.label}: ${s.value}`;
    circle.appendChild(title);
    svg.appendChild(circle);
    offset += frac;
  }
  return svg;
}

export const PALETTE = ['#1b3055', '#c8a250', '#2563a8', '#12855a', '#b3701a', '#5b45a8', '#d1443c', '#8896a8'];

// ---------------------------------------------------------------------------
// Shared cell renderers
// ---------------------------------------------------------------------------

export function scoreBadge(lead) {
  return el(`span.score.${lead.temperature || 'cold'}`, { text: String(lead.score ?? 0), title: `Lead score ${lead.score}/100` });
}

export function stagePill(stage, stages) {
  const s = (stages || []).find((x) => x.id === stage);
  return el(`span.stage-pill.stage-${stage}`, { text: s?.label || stage });
}

export function emptyState(icon, title, message, action) {
  return el('div.empty', {}, [
    el('div.big', { text: icon }),
    el('h3', { text: title, style: { marginBottom: '6px' } }),
    el('p', { text: message }),
    action || null,
  ]);
}

export function card(title, opts = {}, body) {
  return el('div.card', {}, [
    title ? el('div.card-head', {}, [
      el('div', {}, [
        el('h3', { text: title }),
        opts.sub ? el('div.sub', { text: opts.sub }) : null,
      ]),
      opts.actions ? el('div.right', {}, [].concat(opts.actions)) : null,
    ]) : null,
    el(`div.card-body${opts.tight ? '.tight' : ''}`, {}, [body]),
  ]);
}

export function table(headers, rows) {
  return el('div.table-wrap', {}, [
    el('table', {}, [
      el('thead', {}, [el('tr', {}, headers.map((h) =>
        el(`th${h.num ? '.num' : ''}`, { text: typeof h === 'string' ? h : h.label })))]),
      el('tbody', {}, rows),
    ]),
  ]);
}
