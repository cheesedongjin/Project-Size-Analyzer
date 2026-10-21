import { DEFAULT_IGNORE, makeIgnore, parsePatterns } from '../shared/ignore.js';
import { CATEGORY_LABELS } from '../shared/analyzer.js';
import { LANGUAGES } from '../shared/languages.js';
import { STACK_CATEGORIES } from '../shared/stack.js';
import { generateInsights } from '../shared/insights.js';
import { esc, fmt, initTooltips, donut, legend, stackBar, barList, columns, gauge, punchcard, squarify } from './charts.js';
import { HELP, GLOSSARY } from './help.js';

const STATIC_HOST = !/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname);

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const CAT_COLORS = { source: '#5b7cfa', test: '#47c2a8', markup: '#e0719e', docs: '#f0b04b', data: '#9b8cf0', generated: '#8a93a6', asset: '#c58a5b', other: '#5d6675' };
const HEALTH_COLORS = { A: '#3fb37f', B: '#7cc576', C: '#e6b23a', D: '#f08a4b', F: '#e5534b' };
const GRADE_COLORS = { XS: '#47c2a8', S: '#5bb974', M: '#e6b23a', L: '#f08a4b', XL: '#e5534b', XXL: '#b03a8f' };
const langColor = (name) => LANGUAGES[name]?.color || '#6e7681';

const state = {
  mode: 'github',
  report: null,
  tab: 'overview',
  upload: null,
  abort: null,
  worker: null,
  lang: { metric: 'code', scope: 'code' },
  tm: { path: '', metric: 'code' },
  files: { q: '', lang: '', cat: '', sort: 'code', asc: false, limit: 200 },
  todoTag: '',
  nodeMap: new Map(),
};

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장소 사용 불가 시 무시 */ } },
};

// ───────────────────────── 초기화 ─────────────────────────
initTooltips();
initTheme();
initInputs();
renderRecent();
autoRunFromQuery();

function initTheme() {
  $('#theme-toggle').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('psa-theme', next); } catch { /* 무시 */ }
  });
}

function initInputs() {
  const saved = store.get('psa-options', null);
  $('#opt-ignore').value = (saved?.ignore || DEFAULT_IGNORE).join(', ');
  $('#opt-gitignore').checked = saved?.useGitignore ?? true;
  $('#opt-history').checked = saved?.history ?? true;
  $('#opt-maxsize').value = saved?.maxFileMB ?? 2;
  $('#opt-reset').addEventListener('click', () => {
    $('#opt-ignore').value = DEFAULT_IGNORE.join(', ');
    $('#opt-gitignore').checked = true;
    $('#opt-history').checked = true;
    $('#opt-maxsize').value = 2;
  });

  $$('.seg').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  // GitHub Pages 등 정적 호스팅에서는 서버가 없으므로 브라우저 폴더 분석만 허용
  if (STATIC_HOST) $$('.seg').forEach((b) => { if (b.dataset.mode !== 'upload') { b.disabled = true; b.title = '로컬에서 npm start로 서버를 실행해야 사용할 수 있습니다.'; } });
  setMode(STATIC_HOST ? 'upload' : store.get('psa-mode', 'github'));
  $$('[data-example]').forEach((b) => b.addEventListener('click', () => { $('#gh-url').value = b.dataset.example; $('#gh-branch').value = ''; }));

  const dz = $('#dropzone'), input = $('#folder-input');
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => {
    const list = [...input.files];
    if (!list.length) return;
    const root = list[0].webkitRelativePath.split('/')[0];
    const ig = makeIgnore(parsePatterns($('#opt-ignore').value));
    const files = [];
    for (const f of list) {
      const rel = f.webkitRelativePath.split('/').slice(1).join('/');
      if (rel && !ig.path(rel)) files.push({ path: rel, file: f });
    }
    setUpload(root, files, list.length - files.length);
  });
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', async (e) => {
    e.preventDefault();
    dz.classList.remove('drag');
    const entry = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry?.()).find((x) => x && x.isDirectory);
    if (!entry) { showError('폴더를 끌어다 놓아 주세요.'); return; }
    $('#dropzone-status').textContent = '폴더 읽는 중…';
    const ig = makeIgnore(parsePatterns($('#opt-ignore').value));
    const files = await readDirEntry(entry, '', ig);
    setUpload(entry.name, files, 0);
  });

  $('#analyze-form').addEventListener('submit', (e) => { e.preventDefault(); start(); });
  $('#cancel-btn').addEventListener('click', cancel);
  $('#new-analysis').addEventListener('click', () => {
    $('#results').hidden = true;
    $('#input-section').hidden = false;
    history.replaceState(null, '', location.pathname);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  $('#export-json').addEventListener('click', exportJson);
  $('#export-md').addEventListener('click', exportMarkdown);
}

function setMode(mode) {
  state.mode = mode;
  store.set('psa-mode', mode);
  $$('.seg').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  $$('.mode-panel').forEach((p) => { p.hidden = p.dataset.mode !== mode; });
  $('#opt-gitignore').closest('label').style.opacity = mode === 'upload' ? 0.45 : 1;
  $('#opt-history').closest('label').style.opacity = mode === 'upload' ? 0.45 : 1;
}

function setUpload(name, files, skipped) {
  state.upload = { name, files };
  const dz = $('#dropzone');
  dz.classList.add('ready');
  $('#dropzone-status').textContent = `📁 ${name} — ${files.length.toLocaleString()}개 파일 선택됨${skipped ? ` (제외 규칙으로 ${skipped.toLocaleString()}개 제외)` : ''}`;
}

async function readDirEntry(dirEntry, prefix, ig) {
  const out = [];
  const readAll = (reader) => new Promise((resolve, reject) => {
    const all = [];
    const next = () => reader.readEntries((batch) => { if (!batch.length) resolve(all); else { all.push(...batch); next(); } }, reject);
    next();
  });
  const entries = await readAll(dirEntry.createReader());
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory) {
      if (!ig.dir(e.name, rel)) out.push(...await readDirEntry(e, rel, ig));
    } else if (!ig.file(e.name, rel)) {
      const file = await new Promise((res, rej) => e.file(res, rej));
      out.push({ path: rel, file });
    }
  }
  return out;
}

function autoRunFromQuery() {
  const q = new URLSearchParams(location.search);
  if (q.get('repo')) { setMode('github'); $('#gh-url').value = q.get('repo'); $('#gh-branch').value = q.get('branch') || ''; start(); }
  else if (q.get('path')) { setMode('local'); $('#local-path').value = q.get('path'); start(); }
}

// ───────────────────────── 분석 실행 ─────────────────────────
function readOptions() {
  const o = {
    ignore: parsePatterns($('#opt-ignore').value),
    useGitignore: $('#opt-gitignore').checked,
    history: $('#opt-history').checked,
    maxFileMB: Math.min(50, Math.max(0.1, Number($('#opt-maxsize').value) || 2)),
  };
  store.set('psa-options', o);
  return o;
}

async function start() {
  hideError();
  const options = readOptions();
  let payload;
  if (state.mode === 'github') {
    const url = $('#gh-url').value.trim();
    if (!url) return showError('저장소 주소를 입력하세요.');
    payload = { source: 'github', url, branch: $('#gh-branch').value.trim(), options };
  } else if (state.mode === 'local') {
    const path = $('#local-path').value.trim();
    if (!path) return showError('폴더 경로를 입력하세요.');
    payload = { source: 'local', path, options };
  } else if (!state.upload?.files.length) {
    return showError('분석할 폴더를 먼저 선택하세요.');
  }

  setBusy(true);
  const t0 = Date.now();
  try {
    let report;
    if (state.mode === 'upload') {
      report = await runInWorker(state.upload.files, options.maxFileMB * 1024 * 1024);
      report.meta = { source: 'upload', name: state.upload.name, target: `${state.upload.name} (브라우저에서 선택)`, analyzedAt: Date.now(), durationMs: Date.now() - t0 };
    } else {
      report = await runOnServer(payload);
      const q = payload.source === 'github' ? `?repo=${encodeURIComponent(payload.url)}${payload.branch ? `&branch=${encodeURIComponent(payload.branch)}` : ''}` : `?path=${encodeURIComponent(payload.path)}`;
      history.replaceState(null, '', q);
    }
    state.report = report;
    saveRecent(report, payload);
    showResults();
  } catch (e) {
    if (e.name !== 'AbortError') showError(e.message || String(e));
  } finally {
    setBusy(false);
  }
}

function setBusy(on) {
  $('#analyze-btn').disabled = on;
  $('#progress-section').hidden = !on;
  if (on) { setProgress('준비 중…', 2); $('#progress-section').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
}

function setProgress(msg, pct) {
  $('#progress-msg').textContent = msg;
  if (pct != null) $('#progress-fill').style.width = `${Math.max(2, Math.min(100, pct))}%`;
}

function cancel() {
  state.abort?.abort();
  if (state.worker) { state.worker.terminate(); state.worker = null; state.workerReject?.(Object.assign(new Error('취소됨'), { name: 'AbortError' })); }
  setBusy(false);
}

async function runOnServer(payload) {
  state.abort = new AbortController();
  let res;
  try {
    res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: state.abort.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error('서버에 연결할 수 없습니다. "npm start"로 서버가 실행 중인지 확인하세요.');
  }
  if (!res.ok) throw new Error(await res.text());
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.type === 'progress') setProgress(msg.message, msg.pct);
      else if (msg.type === 'error') throw new Error(msg.message);
      else if (msg.type === 'result') { setProgress('결과 표시 중…', 100); return msg.report; }
    }
  }
  throw new Error('서버 응답이 중간에 끊겼습니다.');
}

function runInWorker(files, maxFileBytes) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    state.worker = w;
    state.workerReject = reject;
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') setProgress(m.message, m.pct);
      else if (m.type === 'result') { w.terminate(); state.worker = null; resolve(m.report); }
      else if (m.type === 'error') { w.terminate(); state.worker = null; reject(new Error(m.message)); }
    };
    w.onerror = (e) => { w.terminate(); state.worker = null; reject(new Error(e.message || '워커 오류')); };
    w.postMessage({ files, maxFileBytes });
  });
}

function showError(msg) {
  const box = $('#error-box');
  box.textContent = `⚠ ${msg}`;
  box.hidden = false;
}
function hideError() { $('#error-box').hidden = true; }

// ───────────────────────── 최근 분석 ─────────────────────────
function saveRecent(r, payload) {
  if (!payload) return;
  const list = store.get('psa-recent', []).filter((x) => !(x.source === payload.source && (x.url || x.path) === (payload.url || payload.path) && (x.branch || '') === (payload.branch || '')));
  list.unshift({ source: payload.source, url: payload.url, path: payload.path, branch: payload.branch, name: r.meta.name, code: r.summary.code, grade: r.score.sizeGrade, at: Date.now() });
  store.set('psa-recent', list.slice(0, 8));
  renderRecent();
}

function renderRecent() {
  const list = store.get('psa-recent', []);
  const el = $('#recent');
  el.hidden = !list.length;
  if (!list.length) return;
  el.innerHTML = `<h4>최근 분석</h4><div class="recent-list">${list.map((x, i) => `
    <button class="recent-item" data-i="${i}" data-tip="${esc(x.url || x.path)}">
      <span class="grade" style="background:${GRADE_COLORS[x.grade] || 'var(--muted)'};min-width:30px;height:22px;font-size:12px">${esc(x.grade)}</span>
      <span>${esc(x.name)}${x.branch ? ` <span class="hint">@${esc(x.branch)}</span>` : ''}</span>
      <span class="hint">${fmt.compact(x.code)}줄 · ${fmt.date(x.at)}</span>
    </button>`).join('')}</div>`;
  $$('.recent-item', el).forEach((b) => b.addEventListener('click', () => {
    const x = list[Number(b.dataset.i)];
    if (x.source === 'github') { setMode('github'); $('#gh-url').value = x.url; $('#gh-branch').value = x.branch || ''; }
    else { setMode('local'); $('#local-path').value = x.path; }
    start();
  }));
}

// ───────────────────────── 결과 화면 ─────────────────────────
const TABS = [
  { id: 'overview', label: '개요', render: renderOverview },
  { id: 'insights', label: '인사이트', render: renderInsights, count: (r) => r.insights.items.filter((i) => i.level === 'bad' || i.level === 'warn').length },
  { id: 'languages', label: '언어', render: renderLanguages, count: (r) => r.summary.allLanguages },
  { id: 'structure', label: '구조', render: renderStructure },
  { id: 'complexity', label: '복잡도', render: renderComplexity },
  { id: 'functions', label: '함수', render: renderFunctions, count: (r) => r.functions.count },
  { id: 'maintain', label: '유지보수성 · 중복', render: renderMaintainability },
  { id: 'quality', label: '품질', render: renderQuality },
  { id: 'stack', label: '기술 스택 · 의존성', render: renderStack, count: (r) => r.stack.length },
  { id: 'history', label: '히스토리', render: renderHistory, count: (r) => r.git?.commits },
  { id: 'files', label: '파일', render: renderFiles, count: (r) => r.files.length },
  { id: 'glossary', label: '지표 설명', render: renderGlossary },
];

function showResults() {
  const r = state.report;
  state.nodeMap = new Map();
  const walk = (n) => { state.nodeMap.set(n.path, n); for (const c of n.children || []) if (c.t === 'd') walk(c); };
  walk(r.tree);
  r.tree.name = r.meta.name;
  r.insights = generateInsights(r);
  state.tm.path = '';
  state.files = { q: '', lang: '', cat: '', sort: 'code', asc: false, limit: 200 };
  state.todoTag = '';

  const m = r.meta;
  const srcLabel = { github: 'GitHub', local: '로컬 폴더', upload: '브라우저 폴더' }[m.source];
  $('#result-source').textContent = srcLabel;
  $('#result-name').textContent = m.name;
  const metaBits = [];
  if (m.source === 'github') metaBits.push(`<a href="${esc(m.target)}" target="_blank" rel="noopener">${esc(m.target)}</a>`);
  else metaBits.push(`<span class="mono">${esc(m.target)}</span>`);
  if (m.branch || m.commit) metaBits.push(`${esc(m.branch || '')}${m.commit ? ` @ <span class="mono">${esc(m.commit)}</span>` : ''}`);
  metaBits.push(`${fmt.dateTime(m.analyzedAt)} 분석 · ${(m.durationMs / 1000).toFixed(1)}초`);
  $('#result-meta').innerHTML = metaBits.join(' · ');

  $('#input-section').hidden = true;
  $('#results').hidden = false;
  renderTabs();
  selectTab('overview');
  window.scrollTo({ top: 0 });
}

function renderTabs() {
  const r = state.report;
  $('#tabs').innerHTML = TABS.map((t) => {
    const c = t.count?.(r);
    return `<button class="tab" data-tab="${t.id}">${t.label}${c ? `<span class="count">${fmt.compact(c)}</span>` : ''}</button>`;
  }).join('');
  $$('.tab').forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.tab)));
}

function selectTab(id) {
  state.tab = id;
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
  const el = $('#tab-content');
  TABS.find((t) => t.id === id).render(el, state.report);
  $$('[data-goto]', el).forEach((b) => b.addEventListener('click', () => { selectTab(b.dataset.goto); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
}

const kpi = (label, value, sub = '', color, help = '') => `<div class="kpi${color ? ' accent' : ''}" ${color ? `style="--kpi-color:${color}"` : ''}><div class="k-label">${label}${infoIcon(help)}</div><div class="k-value">${value}</div><div class="k-sub">${sub}</div></div>`;
const mini = (label, value, help = '') => `<div class="mini"><div class="m-label">${label}${infoIcon(help)}</div><div class="m-value">${value}</div></div>`;
// help: HELP 사전의 키 또는 직접 쓴 설명 — 제목 옆 ⓘ에 마우스를 올리면 표시
const infoIcon = (help) => {
  const text = HELP[help] || help;
  return text ? `<span class="qhelp" data-tip="${esc(text)}" tabindex="0" aria-label="설명">?</span>` : '';
};
const card = (title, body, sub = '', help = '') => `<div class="card"><h3><span class="h-title">${title}${infoIcon(help)}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</h3>${body}</div>`;
const explain = (text) => `<p class="explain">${text}</p>`;
const langTag = (name) => (name ? `<span class="lang-tag"><span class="dot" style="background:${esc(langColor(name))}"></span>${esc(name)}</span>` : '<span class="hint">바이너리</span>');
const pathCell = (p) => { const i = p.lastIndexOf('/'); return `<td class="path">${i >= 0 ? `<span class="dir">${esc(p.slice(0, i + 1))}</span>` : ''}${esc(p.slice(i + 1))}</td>`; };
const cxPill = (cx) => `<span class="cx-pill cx-${cx <= 20 ? 1 : cx <= 50 ? 2 : cx <= 100 ? 3 : 4}">${fmt.num(cx)}</span>`;
const codeLangsOf = (r) => r.languages.filter((l) => (l.type === 'programming' || l.type === 'markup') && l.code > 0);

function toggleHtml(name, options, current) {
  return `<div class="toggle" data-toggle="${name}">${options.map(([v, l]) => `<button data-v="${v}" class="${v === current ? 'active' : ''}">${l}</button>`).join('')}</div>`;
}
function bindToggle(el, name, fn) {
  $$(`[data-toggle="${name}"] button`, el).forEach((b) => b.addEventListener('click', () => fn(b.dataset.v)));
}

// ── 개요
function renderOverview(el, r) {
  const s = r.summary, sc = r.score;
  const codeLangs = codeLangsOf(r);
  const codeTotal = codeLangs.reduce((a, l) => a + l.code, 0) || 1;
  const top = codeLangs[0];

  const catItems = Object.entries(r.categories).map(([k, v]) => ({ label: CATEGORY_LABELS[k] || k, value: v.lines || 0, files: v.files, color: CAT_COLORS[k] })).filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const topDirs = r.tree.children.filter((c) => c.t === 'd' && c.code > 0).sort((a, b) => b.code - a.code).slice(0, 10);
  const rootFiles = r.tree.children.filter((c) => c.t === 'f').reduce((a, c) => a + c.code, 0);

  const h = r.insights.health;
  const counts = { bad: 0, warn: 0, info: 0, good: 0 };
  for (const i of r.insights.items) counts[i.level]++;

  el.innerHTML = `<div class="stack">
    <div class="kpis">
      ${kpi('코드 줄 수', fmt.num(s.code), `전체 ${fmt.num(s.lines)}줄 · 주석 ${fmt.compact(s.comment)} · 공백 ${fmt.compact(s.blank)}`, 'var(--accent)', 'code')}
      ${kpi('파일', fmt.num(s.files), `폴더 ${fmt.num(s.dirs)}개 · 바이너리 ${fmt.num(s.binaryFiles)}개`, 'var(--accent-2)', 'files')}
      ${kpi('용량', fmt.bytes(s.bytes), `평균 ${fmt.num(s.avgLinesPerFile)}줄/파일 · 최대 깊이 ${s.maxDepth}`, '#f0b04b', 'size')}
      ${kpi('언어', `${s.languages}개`, top ? `주 언어 ${esc(top.name)} ${fmt.pct(top.code / codeTotal)}` : '-', top ? top.color : undefined, 'langs')}
      ${kpi('규모 등급', `<span class="grade" style="background:${GRADE_COLORS[sc.sizeGrade]}">${sc.sizeGrade}</span>`, sc.sizeLabel, undefined, 'grade')}
      ${kpi('복잡도 지수', `${sc.overall}<span class="hint" style="font-size:14px"> / 100</span>`, sc.label, 'var(--bad)', 'complexityIndex')}
      ${kpi('코드 건강도', `<span class="grade" style="background:${HEALTH_COLORS[h.grade]}">${h.grade}</span> <span style="font-size:18px">${Math.round(h.overall)}</span>`, `${h.parts.length}개 영역 평균`, HEALTH_COLORS[h.grade], 'health')}
      ${kpi('함수', fmt.num(r.functions.count), `평균 ${r.functions.avgLength.toFixed(0)}줄 · 복잡도 ${r.functions.avgCx.toFixed(1)}`, '#9b8cf0', 'fnDetect')}
    </div>

    <div class="grid g-2-1">
      ${card('프로젝트 요약', `<div class="profile">${r.insights.profile.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
        <div class="insight-counts">
          <button class="ic bad" data-goto="insights">위험 ${counts.bad}</button><button class="ic warn" data-goto="insights">주의 ${counts.warn}</button>
          <button class="ic info" data-goto="insights">참고 ${counts.info}</button><button class="ic good" data-goto="insights">좋음 ${counts.good}</button>
        </div>`, '', 'profile')}
      ${card('코드 건강도', healthBars(h), `${h.grade} · ${Math.round(h.overall)}점`, 'health')}
    </div>

    ${card('언어 구성', `${stackBar(codeLangs.map((l) => ({ label: l.name, value: l.code, color: l.color })), { height: 12 })}
      <div class="lang-legend">${codeLangs.slice(0, 10).map((l) => `<span><span class="dot" style="background:${esc(l.color)}"></span><b>${esc(l.name)}</b><span class="hint">${fmt.pct(l.code / codeTotal)}</span></span>`).join('')}</div>`, '프로그래밍·마크업 언어의 코드 줄 수 기준', 'langMix')}

    <div class="grid g2">
      ${card('복잡도 지수', `${gauge(sc.overall, { label: sc.label })}${scoreParts(sc)}${explain('규모와 구조가 얼마나 크고 복잡한지 나타내는 지수로, 품질 점수는 아닙니다. 막대에 마우스를 올리면 세부 점수 계산을 볼 수 있습니다.')}`, '0 = 단순 · 100 = 매우 복잡', 'complexityIndex')}
      ${card('파일 구성', `<div class="donut-wrap">${donut(catItems.map((i) => ({ ...i, display: `${fmt.num(i.value)}줄 · ${fmt.num(i.files)}개 파일` })), { centerValue: fmt.compact(s.lines), centerLabel: '전체 줄' })}${legend(catItems, null, { formatter: fmt.compact })}</div>`, '분류별 줄 수', 'categories')}
    </div>

    <div class="grid g2">
      ${card('최상위 폴더', topDirs.length ? barList([
        ...topDirs.map((d) => ({ label: `${d.name}/`, value: d.code, dot: langColor(d.lang), tip: `${d.path}/\n코드 ${fmt.num(d.code)}줄 · ${fmt.num(d.files)}개 파일 · ${fmt.bytes(d.size)}` })),
        ...(rootFiles ? [{ label: '(루트 파일)', value: rootFiles, color: 'var(--muted)' }] : []),
      ], { formatter: fmt.compact }) : '<div class="empty">하위 폴더가 없습니다</div>', '코드 줄 수', 'topDirs')}
      ${card('개발 노력 추정', `<div class="mini-stats">
          ${mini('추정 공수', `${r.cocomo.effortPM.toFixed(1)} 인·월`)}
          ${mini('추정 기간', `${r.cocomo.scheduleMonths.toFixed(1)} 개월`)}
          ${mini('평균 인원', `${r.cocomo.people.toFixed(1)} 명`)}
          ${mini('KLOC', r.cocomo.kloc.toFixed(1))}
          ${mini('Halstead 예상 시간', `${fmt.compact(r.maintainability.halstead.timeHours)} 시간`, 'halstead')}
          ${mini('Halstead 예상 결함', fmt.compact(r.maintainability.halstead.bugs), 'halstead')}
        </div>
        ${explain('COCOMO는 코드 줄 수, Halstead는 연산자·피연산자 수를 바탕으로 한 고전적인 추정 모델입니다. "처음부터 다시 만든다면"을 가정한 규모 감각으로만 활용하세요.')}`, 'COCOMO · Halstead', 'cocomo')}
    </div>

    ${r.github || r.git ? `<div class="grid g2">${r.github ? card('GitHub 저장소', repoCard(r.github)) : ''}${r.git ? card('커밋 히스토리 요약', `<div class="mini-stats">
        ${mini('커밋', fmt.num(r.git.commits))}${mini('기여자', fmt.num(r.git.contributors))}
        ${mini('프로젝트 기간', fmt.duration(r.git.ageDays))}${mini('마지막 커밋', fmt.date(r.git.lastCommit))}
      </div><div style="margin-top:14px">${columns(r.git.monthly.slice(-36).map((m) => ({ label: m.month, short: m.month.slice(2).replace('-', '.'), value: m.count })), { height: 140 })}</div>`, '최근 36개월') : ''}</div>` : ''}

    ${r.warnings.length ? `<div class="note warnings">${r.warnings.map(esc).join('<br>')}</div>` : ''}
  </div>`;
}

function scoreParts(sc) {
  return `<div class="score-parts">${sc.parts.map((p) => `
    <div class="sp-row" data-tip="${esc(`${p.label}: ${p.value}\n점수 ${Math.round(p.score)} × 가중치 ${p.weight}`)}">
      <span>${p.label}</span>
      <div class="bl-track"><div class="bl-fill" style="width:${Math.max(1, p.score)}%;background:var(--accent)"></div></div>
      <span class="num">${Math.round(p.score)}</span>
      <span class="hint">${esc(p.value)}</span>
    </div>`).join('')}</div>`;
}

function repoCard(g) {
  return `<div class="repo-card">
    ${g.avatar ? `<img src="${esc(g.avatar)}" alt="">` : ''}
    <div style="min-width:0">
      <a href="${esc(g.htmlUrl)}" target="_blank" rel="noopener"><b>${esc(g.fullName)}</b></a>${g.archived ? ' <span class="dev-badge">archived</span>' : ''}${g.fork ? ' <span class="dev-badge">fork</span>' : ''}
      ${g.description ? `<div class="desc">${esc(g.description)}</div>` : '<div style="height:10px"></div>'}
      <div class="mini-stats">
        ${mini('★ 스타', fmt.compact(g.stars))}${mini('포크', fmt.compact(g.forks))}
        ${mini('오픈 이슈', fmt.compact(g.openIssues))}${g.contributors != null ? mini('기여자', fmt.compact(g.contributors)) : mini('워처', fmt.compact(g.watchers))}
      </div>
      <div class="hint" style="margin-top:10px">라이선스 ${esc(g.license || '없음')} · 생성 ${fmt.date(g.createdAt)} · 최근 푸시 ${fmt.date(g.pushedAt)} · 기본 브랜치 ${esc(g.defaultBranch)}</div>
      ${g.topics?.length ? `<div class="topics">${g.topics.map((t) => `<span class="topic">${esc(t)}</span>`).join('')}</div>` : ''}
    </div>
  </div>`;
}

// ── 언어
function renderLanguages(el, r) {
  const { metric, scope } = state.lang;
  const base = scope === 'code' ? codeLangsOf(r) : r.languages;
  const key = metric === 'bytes' ? 'bytes' : metric === 'files' ? 'files' : 'code';
  const langs = [...base].sort((a, b) => b[key] - a[key]).filter((l) => l[key] > 0);
  const total = langs.reduce((a, l) => a + l[key], 0) || 1;
  const f = metric === 'bytes' ? fmt.bytes : fmt.num;
  const items = langs.map((l) => ({ label: l.name, value: l[key], color: l.color, display: f(l[key]) }));
  const typeLabel = { programming: '프로그래밍', markup: '마크업', data: '데이터', prose: '문서', other: '기타' };

  el.innerHTML = `<div class="stack">
    <div class="toolbar">
      ${toggleHtml('lmetric', [['code', '코드 줄 수'], ['bytes', '용량'], ['files', '파일 수']], metric)}
      ${toggleHtml('lscope', [['code', '프로그래밍·마크업'], ['all', '모든 텍스트 파일']], scope)}
    </div>
    <div class="grid g-1-2">
      ${card('비율', `<div style="display:flex;justify-content:center;margin-bottom:16px">${donut(items, { size: 220, centerValue: String(langs.length), centerLabel: '개 언어' })}</div>${legend(items, total, { formatter: f, max: 10 })}`)}
      ${card('언어별 상세', `<div class="table-wrap"><table class="data">
        <thead><tr><th>언어</th><th>유형</th><th class="num">파일</th><th class="num">코드</th><th class="num">주석</th><th class="num">공백</th><th class="num">용량</th><th class="num">주석 비율</th><th class="num">분기 수</th><th class="num">비율</th></tr></thead>
        <tbody>${langs.map((l) => `<tr>
          <td>${langTag(l.name)}</td><td class="hint">${typeLabel[l.type] || l.type}</td>
          <td class="num">${fmt.num(l.files)}</td><td class="num"><b>${fmt.num(l.code)}</b></td><td class="num">${fmt.num(l.comment)}</td><td class="num">${fmt.num(l.blank)}</td>
          <td class="num">${fmt.bytes(l.bytes)}</td><td class="num">${l.code + l.comment ? fmt.pct(l.comment / (l.code + l.comment)) : '-'}</td>
          <td class="num">${l.cx ? fmt.num(l.cx) : '-'}</td><td class="num">${fmt.pct(l[key] / total)}</td></tr>`).join('')}</tbody>
      </table></div>`)}
    </div>
    ${card('확장자별 분포', `<div class="table-wrap scroll"><table class="data">
      <thead><tr><th>확장자</th><th class="num">파일</th><th class="num">줄 수</th><th class="num">용량</th><th style="width:40%">용량 비율</th></tr></thead>
      <tbody>${r.extensions.slice(0, 60).map((x) => `<tr><td class="mono">${esc(x.ext)}</td><td class="num">${fmt.num(x.files)}</td><td class="num">${x.lines ? fmt.num(x.lines) : '-'}</td><td class="num">${fmt.bytes(x.bytes)}</td>
        <td><div class="bl-track"><div class="bl-fill" style="width:${Math.max(0.5, (x.bytes / (r.summary.bytes || 1)) * 100)}%;background:var(--accent-2)"></div></div></td></tr>`).join('')}</tbody>
    </table></div>`, `${r.extensions.length}종`)}
  </div>`;
  bindToggle(el, 'lmetric', (v) => { state.lang.metric = v; renderLanguages(el, r); });
  bindToggle(el, 'lscope', (v) => { state.lang.scope = v; renderLanguages(el, r); });
}

// ── 구조
const metricOf = (n, m) => (m === 'size' ? n.size : m === 'files' ? (n.t === 'd' ? n.files : 1) : n.code);

function renderStructure(el, r) {
  const st = r.structure;
  el.innerHTML = `<div class="stack">
    <div class="card">
      <div class="tm-toolbar">
        <div class="crumbs" id="tm-crumbs"></div>${infoIcon('treemap')}<span class="spacer" style="flex:1"></span>
        ${toggleHtml('tmmetric', [['code', '코드 줄 수'], ['size', '용량'], ['files', '파일 수']], state.tm.metric)}
      </div>
      <div class="treemap" id="treemap"></div>
      <p class="hint" style="margin:10px 0 0">색상은 파일(폴더는 가장 많이 쓰인) 언어입니다. 폴더를 클릭하면 안으로 들어갑니다.</p>
    </div>
    ${modulesCard(r)}
    <div class="grid g2">
      ${card('파일 길이 분포', columns(st.fileLengths.map((b) => ({ label: b.label, value: b.count })), { height: 180, labelEvery: 1, color: 'var(--accent-2)', tip: (i) => `${i.label}줄: ${fmt.num(i.value)}개 파일` }) + explain(`텍스트 파일 ${fmt.num(st.fileLengths.reduce((a, b) => a + b.count, 0))}개 중 500줄을 넘는 파일은 ${fmt.num(st.fileLengths.slice(4).reduce((a, b) => a + b.count, 0))}개입니다. 긴 파일은 여러 책임이 섞여 있을 가능성이 큽니다.`), '파일당 줄 수', 'fileLengths')}
      ${card('폴더 깊이 분포', columns(st.depthDist.map((b) => ({ label: b.label, value: b.count })), { height: 180, labelEvery: 1, color: '#9b8cf0', tip: (i) => `깊이 ${i.label}: ${fmt.num(i.value)}개 파일` }) + explain(`파일의 평균 깊이는 ${st.avgDepth.toFixed(1)}단계, 가장 깊은 파일은 <span class="mono">${esc(st.deepestPath)}</span>입니다.`), '루트로부터 폴더 단계', 'depthDist')}
    </div>
    <div class="grid g2">
      ${card('폴더 통계', `<div class="mini-stats">
          ${mini('폴더 수', fmt.num(r.summary.dirs))}
          ${mini('폴더당 평균 파일', st.avgFilesPerDir.toFixed(1))}
          ${mini('최대 깊이', r.summary.maxDepth)}
          ${mini('평균 깊이', st.avgDepth.toFixed(1))}
          ${mini('경유 폴더', fmt.num(st.emptyishDirs), '파일 없이 하위 폴더 하나만 가진 폴더입니다. Java 패키지(com/example/…)처럼 의도된 경우가 많지만, 과하면 탐색이 번거롭습니다.')}
        </div>`)}
      ${card('파일이 가장 많은 폴더', `<div class="table-wrap"><table class="data"><thead><tr><th>폴더</th><th class="num">파일</th><th class="num">하위 폴더</th></tr></thead>
        <tbody>${st.crowded.map((d) => `<tr><td class="path">${esc(d.path)}</td><td class="num">${fmt.num(d.files)}</td><td class="num">${fmt.num(d.subdirs)}</td></tr>`).join('')}</tbody></table></div>`, '직접 포함한 파일 기준', 'crowded')}
    </div>
    ${card('디렉터리 트리', `<div class="tree"><div class="tree-head"><span>이름</span><span>비중 (코드)</span><span class="num">코드</span><span class="num">용량</span><span class="num">파일</span></div><div id="tree-root"></div></div>`, `폴더 ${fmt.num(r.summary.dirs)}개 · 최대 깊이 ${r.summary.maxDepth}`)}
  </div>`;
  bindToggle(el, 'tmmetric', (v) => { state.tm.metric = v; $$('[data-toggle="tmmetric"] button', el).forEach((b) => b.classList.toggle('active', b.dataset.v === v)); drawTreemap(); });
  drawTreemap();
  const root = $('#tree-root');
  root.innerHTML = treeRows(r.tree, 0);
  root.addEventListener('click', (e) => {
    const row = e.target.closest('.tree-row.dir');
    if (!row) return;
    const kids = row.nextElementSibling;
    if (!kids.dataset.loaded) { kids.innerHTML = treeRows(state.nodeMap.get(row.dataset.path), Number(row.dataset.depth) + 1); kids.dataset.loaded = '1'; }
    const open = row.classList.toggle('open');
    kids.hidden = !open;
  });
}

function treeRows(node, depth) {
  const kids = [...node.children].sort((a, b) => (b.t === 'd') - (a.t === 'd') || b.code - a.code || b.size - a.size);
  const max = Math.max(1, node.code);
  const shown = kids.slice(0, 300);
  return shown.map((c) => {
    const pad = `style="padding-left:${depth * 18}px"`;
    const bar = `<div class="tree-bar"><div style="width:${(c.code / max) * 100}%;background:${esc(langColor(c.lang))}"></div></div>`;
    if (c.t === 'd') {
      return `<div class="tree-row dir" data-path="${esc(c.path)}" data-depth="${depth}"><div class="tree-name" ${pad}><span class="caret">▸</span>📁 <span class="nm">${esc(c.name)}</span></div>${bar}<span class="num">${fmt.num(c.code)}</span><span class="num">${fmt.bytes(c.size)}</span><span class="num">${fmt.num(c.files)}</span></div><div class="tree-kids" hidden></div>`;
    }
    return `<div class="tree-row" data-tip="${esc(`${c.path}\n${c.lang || '바이너리'} · ${fmt.num(c.lines)}줄 · 복잡도 ${c.cx}`)}"><div class="tree-name" ${pad}><span class="caret"></span><span class="dot" style="background:${esc(c.lang ? langColor(c.lang) : 'var(--muted)')}"></span><span class="nm">${esc(c.name)}</span></div>${bar}<span class="num">${c.code ? fmt.num(c.code) : '-'}</span><span class="num">${fmt.bytes(c.size)}</span><span class="num"></span></div>`;
  }).join('') + (kids.length > shown.length ? `<div class="tree-row"><div class="tree-name hint" style="padding-left:${depth * 18 + 20}px">… 외 ${kids.length - shown.length}개 항목</div></div>` : '');
}

function drawTreemap() {
  const box = $('#treemap');
  if (!box) return;
  const m = state.tm.metric;
  let node = state.nodeMap.get(state.tm.path) || state.report.tree;

  const parts = state.tm.path ? state.tm.path.split('/') : [];
  $('#tm-crumbs').innerHTML = `<button data-p="">${esc(state.report.tree.name)}</button>` + parts.map((p, i) => `<span>/</span><button data-p="${esc(parts.slice(0, i + 1).join('/'))}">${esc(p)}</button>`).join('');
  $$('#tm-crumbs button').forEach((b) => b.addEventListener('click', () => { state.tm.path = b.dataset.p; drawTreemap(); }));

  const W = box.clientWidth, H = box.clientHeight;
  const itemsOf = (n, limit) => n.children.map((c) => ({ node: c, value: metricOf(c, m) })).filter((i) => i.value > 0).sort((a, b) => b.value - a.value).slice(0, limit);
  const tip = (n) => `${n.path || state.report.tree.name}${n.t === 'd' ? '/' : ''}\n코드 ${fmt.num(n.code)}줄 · ${fmt.bytes(n.size)}${n.t === 'd' ? ` · 파일 ${fmt.num(n.files)}개` : ` · ${n.lang || '바이너리'}`}`;
  let html = '';
  const place = (n, x, y, w, h, level) => {
    const color = esc(n.lang ? langColor(n.lang) : '#6e7681');
    const style = `left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;width:${Math.max(0, w).toFixed(1)}px;height:${Math.max(0, h).toFixed(1)}px;--c:${color}`;
    if (n.t === 'd' && level === 0 && w > 70 && h > 44) {
      html += `<div class="tm-node tm-dir" style="${style}" data-p="${esc(n.path)}" data-tip="${esc(tip(n))}"><div class="tm-title">${esc(n.name)}/</div></div>`;
      for (const r of squarify(itemsOf(n, 150), x + 2, y + 19, w - 4, h - 21)) place(r.item.node, r.x, r.y, r.w, r.h, 1);
    } else {
      const isDir = n.t === 'd';
      html += `<div class="tm-node tm-file" style="${style}${isDir ? ';background:color-mix(in srgb, var(--c) 60%, var(--card))' : ''}" ${isDir ? `data-p="${esc(n.path)}"` : ''} data-tip="${esc(tip(n))}">${w > 46 && h > 18 ? `<div class="tm-title">${esc(n.name)}${isDir ? '/' : ''}</div>` : ''}</div>`;
    }
  };
  const items = itemsOf(node, 300);
  if (!items.length) { box.innerHTML = '<div class="empty">표시할 항목이 없습니다</div>'; return; }
  for (const r of squarify(items, 0, 0, W, H)) place(r.item.node, r.x, r.y, r.w, r.h, 0);
  box.innerHTML = html;
  box.onclick = (e) => {
    const t = e.target.closest('[data-p]');
    if (t) { state.tm.path = t.dataset.p; drawTreemap(); }
  };
}

let resizeTimer;
addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (state.tab === 'structure') drawTreemap(); }, 150); });

// ── 복잡도
function renderComplexity(el, r) {
  const c = r.complexity, sc = r.score;
  const fileTable = (rows) => `<div class="table-wrap"><table class="data">
    <thead><tr><th>파일</th><th>언어</th><th class="num">코드</th><th class="num">복잡도</th><th class="num">함수</th><th class="num">함수당</th><th class="num">중첩</th></tr></thead>
    <tbody>${rows.map((f) => `<tr>${pathCell(f.path)}<td>${langTag(f.lang)}</td><td class="num">${fmt.num(f.code)}</td><td class="num">${cxPill(f.cx)}</td><td class="num">${fmt.num(f.fn)}</td><td class="num">${f.fn ? ((f.cx - 1 + f.fn) / f.fn).toFixed(1) : '-'}</td><td class="num">${f.nest}</td></tr>`).join('')}</tbody>
  </table></div>`;
  const byLang = [...c.byLanguage].sort((a, b) => b.density - a.density);

  el.innerHTML = `<div class="stack">
    <div class="grid g-1-2">
      ${card('복잡도 지수', `${gauge(sc.overall, { label: sc.label })}${scoreParts(sc)}`, '', 'complexityIndex')}
      ${card('복잡도 지표', `<div class="mini-stats">
          ${mini('총 분기 수', fmt.num(c.total), 'cyclomatic')}
          ${mini('함수 수', fmt.num(r.functions.count), 'fnDetect')}
          ${mini('함수당 평균 복잡도', r.functions.avgCx.toFixed(1), 'fnRisk')}
          ${mini('100줄당 분기', c.density.toFixed(1), 'density')}
          ${mini('평균 중첩 깊이', c.avgNesting.toFixed(1), 'nesting')}
          ${mini('최대 중첩 깊이', c.maxNesting, 'nesting')}
        </div>
        <h3 style="margin-top:20px">파일별 순환 복잡도 분포 <span class="sub">${fmt.num(c.analyzedFiles)}개 파일</span></h3>
        ${columns(c.histogram.map((h) => ({ label: h.label, value: h.count })), { height: 170, labelEvery: 1, tip: (i) => `복잡도 ${i.label}: ${fmt.num(i.value)}개 파일` })}
        ${explain(`파일 단위 합계입니다. 파일 안 함수별 복잡도는 <button class="linkish" data-goto="functions">함수 탭</button>에서 볼 수 있습니다.`)}`, '', 'fileCx')}
    </div>
    <div class="grid g2">
      ${card('언어별 분기 밀도', byLang.length ? barList(byLang.map((l) => ({ label: l.name, value: l.density, dot: l.color, color: l.color, tip: `${l.name}\n분기 ${fmt.num(l.cx)} · 코드 ${fmt.num(l.code)}줄 · 함수 ${fmt.num(l.fn)}` })), { formatter: (v) => v.toFixed(1) }) : '<div class="empty">분석 가능한 언어가 없습니다</div>', '100줄당 분기 수', 'density')}
      ${card('중첩이 가장 깊은 파일', fileTable(c.deepest), '', 'nesting')}
    </div>
    ${card('복잡도가 가장 높은 파일', c.top.length ? fileTable(c.top) : '<div class="empty">분석 가능한 파일이 없습니다</div>', '상위 25개', 'fileCx')}
    <div class="note">복잡도는 각 언어의 분기 키워드(if, for, while, case, catch, &amp;&amp;, || 등)를 세어 계산한 <b>근사 순환 복잡도</b>입니다. 문자열·주석은 제외하지만 실제 파서를 쓰지 않으므로 참고용으로 활용하세요. 생성·최소화된 파일은 제외됩니다.</div>
  </div>`;
}

// ── 공통 조각
function healthBars(h) {
  const col = (v) => (v >= 80 ? 'var(--good)' : v >= 60 ? '#7cc576' : v >= 40 ? 'var(--warn)' : v >= 20 ? '#f08a4b' : 'var(--bad)');
  return `<div class="health">${h.parts.map((p) => `
    <div class="hb-row" data-tip="${esc(`${p.label}: ${Math.round(p.score)}점\n${p.detail}`)}">
      <span>${p.label}</span>
      <div class="bl-track"><div class="bl-fill" style="width:${Math.max(1, p.score)}%;background:${col(p.score)}"></div></div>
      <span class="num">${Math.round(p.score)}</span>
    </div>`).join('')}</div>`;
}

function modulesCard(r) {
  const mods = r.modules.filter((m) => m.code > 0).slice(0, 25);
  if (mods.length < 2) return '';
  const total = r.summary.code || 1;
  const miCell = (v) => (v == null ? '<span class="hint">-</span>' : `<span class="mi-pill ${miClass(v)}">${v.toFixed(0)}</span>`);
  return card('모듈(최상위 폴더)별 비교', `<div class="table-wrap"><table class="data">
    <thead><tr><th>모듈</th><th>주 언어</th><th class="num">파일</th><th class="num">코드</th><th style="min-width:110px">비중</th><th class="num">함수</th><th class="num">분기 밀도</th><th class="num">MI</th><th class="num">주석</th><th class="num">테스트</th><th class="num">중복</th></tr></thead>
    <tbody>${mods.map((m) => `<tr>
      <td class="path">${esc(m.name)}${m.name.startsWith('(') ? '' : '/'}</td><td>${m.lang ? langTag(m.lang) : '<span class="hint">-</span>'}</td>
      <td class="num">${fmt.num(m.files)}</td><td class="num">${fmt.num(m.code)}</td>
      <td><div class="bl-track"><div class="bl-fill" style="width:${Math.max(0.5, (m.code / total) * 100)}%;background:${esc(langColor(m.lang))}"></div></div></td>
      <td class="num">${m.fn ? fmt.num(m.fn) : '-'}</td><td class="num">${m.density ? m.density.toFixed(1) : '-'}</td><td class="num">${miCell(m.mi)}</td>
      <td class="num">${m.code ? fmt.pct(m.commentRatio, 0) : '-'}</td><td class="num">${m.testRatio ? fmt.pct(m.testRatio, 0) : '-'}</td><td class="num">${m.dupRatio ? fmt.pct(m.dupRatio, 1) : '-'}</td>
    </tr>`).join('')}</tbody></table></div>
    ${explain('어느 영역이 크고, 복잡하고, 테스트가 부족한지 한눈에 비교할 수 있습니다. MI가 낮고(빨강) 분기 밀도가 높은 모듈이 리팩터링 우선 후보입니다.')}`, `${r.modules.length}개`, 'modules');
}

const miClass = (v) => (v >= 60 ? 'mi-good' : v >= 40 ? 'mi-ok' : v >= 20 ? 'mi-warn' : 'mi-bad');
const fnRef = (f) => `<td><div class="fn-name">${esc(f.name)}</div><div class="todo-loc">${esc(f.path)}:${f.line}</div></td>`;
const fnCxPill = (cx) => `<span class="cx-pill cx-${cx <= 10 ? 1 : cx <= 20 ? 2 : cx <= 50 ? 3 : 4}">${cx}</span>`;

// ── 인사이트
const LEVEL_LABEL = { bad: '위험', warn: '주의', info: '참고', good: '좋음' };
const LEVEL_ICON = { bad: '⛔', warn: '⚠️', info: 'ℹ️', good: '✅' };
function renderInsights(el, r) {
  const ins = r.insights;
  const filter = state.insightLevel || '';
  const counts = { bad: 0, warn: 0, info: 0, good: 0 };
  for (const i of ins.items) counts[i.level]++;
  const items = ins.items.filter((i) => !filter || i.level === filter);
  const areas = [...new Set(items.map((i) => i.area))];
  el.innerHTML = `<div class="stack">
    <div class="grid g-2-1">
      ${card('프로젝트 요약', `<div class="profile">${ins.profile.map((p) => `<p>${esc(p)}</p>`).join('')}</div>`, '', 'profile')}
      ${card('코드 건강도', `<div class="health-head"><span class="grade big" style="background:${HEALTH_COLORS[ins.health.grade]}">${ins.health.grade}</span><div><div class="k-value">${Math.round(ins.health.overall)}<span class="hint" style="font-size:14px"> / 100</span></div><div class="hint">품질 관점 종합 점수</div></div></div>${healthBars(ins.health)}`, '', 'health')}
    </div>
    <div class="card">
      <h3><span class="h-title">발견 사항과 권장 조치${infoIcon('insightList')}</span>
        ${toggleHtml('ilevel', [['', `전체 ${ins.items.length}`], ['bad', `위험 ${counts.bad}`], ['warn', `주의 ${counts.warn}`], ['info', `참고 ${counts.info}`], ['good', `좋음 ${counts.good}`]], filter)}
      </h3>
      ${items.length ? areas.map((a) => `<div class="ins-area"><div class="ins-area-title">${esc(a)}</div>${items.filter((i) => i.area === a).map((i) => `
        <div class="insight ${i.level}">
          <div class="ins-icon">${LEVEL_ICON[i.level]}</div>
          <div class="ins-body">
            <div class="ins-title"><span class="lvl ${i.level}">${LEVEL_LABEL[i.level]}</span>${esc(i.title)}</div>
            ${i.detail ? `<div class="ins-detail">${esc(i.detail)}</div>` : ''}
            ${i.action ? `<div class="ins-action"><b>권장:</b> ${esc(i.action)}</div>` : ''}
          </div>
        </div>`).join('')}</div>`).join('') : '<div class="empty">해당하는 항목이 없습니다</div>'}
    </div>
  </div>`;
  bindToggle(el, 'ilevel', (v) => { state.insightLevel = v; renderInsights(el, r); });
}

// ── 함수
function renderFunctions(el, r) {
  const f = r.functions;
  if (!f.count) { el.innerHTML = card('함수 분석', '<div class="empty">함수를 탐지할 수 있는 언어의 소스 파일이 없습니다.</div>', '', 'fnDetect'); return; }
  const riskColors = { low: '#3fb37f', moderate: '#7cc576', high: '#e6b23a', 'very-high': '#f08a4b', untestable: '#e5534b' };
  const riskItems = f.risk.map((b) => ({ label: b.label, value: b.count, color: riskColors[b.level], display: `${fmt.num(b.count)}개 함수` }));
  const table = (rows, focus) => `<div class="table-wrap scroll"><table class="data"><thead><tr><th>함수</th><th class="num">길이</th><th class="num">복잡도</th><th class="num">매개변수</th></tr></thead>
    <tbody>${rows.map((x) => `<tr>${fnRef(x)}<td class="num">${focus === 'len' ? `<b>${x.length}</b>` : x.length}</td><td class="num">${fnCxPill(x.cx)}</td><td class="num">${focus === 'params' ? `<b>${x.params}</b>` : x.params}</td></tr>`).join('')}</tbody></table></div>`;
  el.innerHTML = `<div class="stack">
    <div class="kpis">
      ${kpi('소스 함수', fmt.num(f.count), `테스트 함수 ${fmt.num(f.testFunctions || 0)}개 별도`, 'var(--accent)', 'fnDetect')}
      ${kpi('평균 길이', `${f.avgLength.toFixed(1)}줄`, `중앙값 ${f.medianLength}줄 · 상위 10% ${f.p90Length}줄+`, 'var(--accent-2)', 'fnLength')}
      ${kpi('평균 복잡도', f.avgCx.toFixed(2), `중앙값 ${f.medianCx} · 최대 ${f.maxCx}`, '#f0b04b', 'fnRisk')}
      ${kpi('복잡도 10 초과', fmt.num(f.over10), `${fmt.pct(f.over10 / f.count)} · 20 초과 ${fmt.num(f.over20)}개`, f.over20 ? 'var(--bad)' : 'var(--good)', 'fnRisk')}
      ${kpi('100줄 넘는 함수', fmt.num(f.long100), `50줄 초과 ${fmt.num(f.long50)}개`, f.long100 ? 'var(--warn)' : 'var(--good)', 'fnLength')}
      ${kpi('매개변수 6개+', fmt.num(f.manyParams), `평균 ${f.avgParams.toFixed(1)}개`, f.manyParams ? 'var(--warn)' : 'var(--good)', 'fnParams')}
    </div>
    <div class="grid g3">
      ${card('복잡도 위험도', `<div style="display:flex;justify-content:center;margin-bottom:12px">${donut(riskItems, { size: 180, thickness: 26, centerValue: fmt.pct((f.risk[0].count + f.risk[1].count) / f.count, 0), centerLabel: '10 이하' })}</div>${legend(riskItems, f.count)}`, '순환 복잡도 구간', 'fnRisk')}
      ${card('함수 길이 분포', columns(f.lengthBuckets.map((b) => ({ label: b.label, value: b.count })), { height: 200, labelEvery: 1, color: 'var(--accent-2)', tip: (i) => `${i.label}줄: ${fmt.num(i.value)}개 함수` }), '줄 수', 'fnLength')}
      ${card('매개변수 수 분포', columns(f.paramBuckets.map((b) => ({ label: b.label, value: b.count })), { height: 200, labelEvery: 1, color: '#9b8cf0', tip: (i) => `${i.label}: ${fmt.num(i.value)}개 함수` }), '', 'fnParams')}
    </div>
    ${explain(`함수 ${fmt.num(f.count)}개 중 <b>${fmt.pct(f.risk[0].count / f.count, 0)}</b>가 복잡도 5 이하의 단순한 함수입니다. 복잡도가 높은 함수는 분기가 많아 테스트 케이스가 많이 필요하고 수정할 때 실수하기 쉽습니다. 길이와 복잡도가 모두 높은 함수부터 분리하는 것이 효과적입니다.`)}
    <div class="grid g2">
      ${card('복잡도가 가장 높은 함수', table(f.topComplex), `상위 ${f.topComplex.length}개`, 'fnRisk')}
      ${card('가장 긴 함수', table(f.topLong, 'len'), `상위 ${f.topLong.length}개`, 'fnLength')}
    </div>
    ${f.topParams.length ? card('매개변수가 많은 함수', table(f.topParams, 'params'), '', 'fnParams') : ''}
    <div class="note">${esc(HELP.fnDetect)}</div>
  </div>`;
}

// ── 유지보수성 · 중복
function renderMaintainability(el, r) {
  const m = r.maintainability, d = r.codeDup, hs = m.halstead;
  const miColors = { bad: '#e5534b', warn: '#e6b23a', ok: '#7cc576', good: '#3fb37f' };
  el.innerHTML = `<div class="stack">
    <div class="kpis">
      ${kpi('평균 유지보수성 지수', m.files ? `<span class="mi-pill ${miClass(m.avgMI)} big">${m.avgMI.toFixed(0)}</span>` : '-', `중앙값 ${m.medianMI.toFixed(0)} · ${fmt.num(m.files)}개 파일`, undefined, 'mi')}
      ${kpi('유지보수 어려움 (MI<10)', fmt.num(m.low), `보통(10–19) ${fmt.num(m.moderate)}개 · 양호 ${fmt.num(m.good)}개`, m.low ? 'var(--bad)' : 'var(--good)', 'mi')}
      ${kpi('소스 코드 중복률', fmt.pct(d.sourceRatio), `테스트 포함 전체 ${fmt.pct(d.ratio)}`, d.sourceRatio > 0.1 ? 'var(--bad)' : d.sourceRatio > 0.04 ? 'var(--warn)' : 'var(--good)', 'codeDup')}
      ${kpi('중복 블록 줄', fmt.num(d.duplicatedLines), `${fmt.num(d.filesWithDup)}개 파일 · ${fmt.num(d.pairCount)}개 파일 쌍`, 'var(--accent)', 'codeDup')}
      ${kpi('Halstead 볼륨', fmt.compact(hs.volume), `평균 난이도 ${hs.difficulty.toFixed(0)}`, '#9b8cf0', 'halstead')}
      ${kpi('Halstead 예상 결함', fmt.compact(hs.bugs), `예상 구현 시간 ${fmt.compact(hs.timeHours)}시간`, 'var(--muted)', 'halstead')}
    </div>
    <div class="grid g-1-2">
      ${card('MI 분포', columns(m.histogram.map((b) => ({ label: b.label, value: b.count, color: miColors[b.level] })), { height: 200, labelEvery: 1, tip: (i) => `MI ${i.label}: ${fmt.num(i.value)}개 파일` }) + explain('오른쪽(높은 점수)에 몰려 있을수록 좋습니다. 20 미만 파일은 함수가 길고 복잡하거나 식별자가 매우 많은 파일입니다.'), '파일 수', 'mi')}
      ${card('유지보수성이 가장 낮은 파일', `<div class="table-wrap scroll"><table class="data"><thead><tr><th>파일</th><th>언어</th><th class="num">코드</th><th class="num">복잡도</th><th class="num">볼륨</th><th class="num">MI</th></tr></thead>
        <tbody>${m.lowest.map((f) => `<tr>${pathCell(f.path)}<td>${langTag(f.lang)}</td><td class="num">${fmt.num(f.code)}</td><td class="num">${cxPill(f.cx)}</td><td class="num">${fmt.compact(f.hv)}</td><td class="num"><span class="mi-pill ${miClass(f.mi)}">${f.mi.toFixed(0)}</span></td></tr>`).join('')}</tbody></table></div>`, '코드 10줄 이상', 'mi')}
    </div>
    ${card('복사-붙여넣기 중복 블록', d.topPairs.length ? `<div class="table-wrap scroll"><table class="data"><thead><tr><th>위치 A</th><th>위치 B</th><th class="num">블록</th><th class="num">중복 줄(추정)</th></tr></thead>
      <tbody>${d.topPairs.map((p) => `<tr><td class="path">${esc(p.a)}<span class="dir">:${p.lineA}</span></td><td class="path">${p.same ? '<span class="dev-badge">같은 파일</span> ' : esc(p.b)}<span class="dir">:${p.lineB}</span></td><td class="num">${p.blocks}</td><td class="num"><b>${fmt.num(p.lines)}</b></td></tr>`).join('')}</tbody></table></div>
      ${explain(`연속 ${d.minLines}줄 이상 동일한 코드 블록입니다. 줄 번호는 처음 발견된 중복 위치입니다. 같은 로직이 여러 곳에 있으면 한 곳만 고치고 나머지를 잊는 버그가 생기기 쉽습니다.`)}` : '<div class="empty">중복 블록이 발견되지 않았습니다 🎉</div>', `${fmt.num(d.analyzedLines)}줄 분석`, 'codeDup')}
    <div class="grid g2">
      ${card('중복이 많은 파일', d.topFiles.length ? `<div class="table-wrap scroll"><table class="data"><thead><tr><th>파일</th><th class="num">중복 줄</th><th class="num">비율</th></tr></thead>
        <tbody>${d.topFiles.map((f) => `<tr>${pathCell(f.path)}<td class="num">${fmt.num(f.dup)}</td><td class="num">${fmt.pct(f.ratio, 0)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">없음</div>', '', 'codeDup')}
      ${card('Halstead 볼륨이 큰 파일', `<div class="table-wrap scroll"><table class="data"><thead><tr><th>파일</th><th class="num">코드</th><th class="num">볼륨</th><th class="num">MI</th></tr></thead>
        <tbody>${m.largestVolume.map((f) => `<tr>${pathCell(f.path)}<td class="num">${fmt.num(f.code)}</td><td class="num">${fmt.compact(f.hv)}</td><td class="num"><span class="mi-pill ${miClass(f.mi)}">${f.mi.toFixed(0)}</span></td></tr>`).join('')}</tbody></table></div>
        ${explain('볼륨은 코드에 담긴 정보량입니다. 볼륨이 큰 파일은 읽고 이해하는 데 시간이 오래 걸립니다.')}`, '', 'halstead')}
    </div>
    <div class="note">${esc(HELP.mi).replace(/\n/g, '<br>')}</div>
  </div>`;
}

// ── 기술 스택 · 의존성
function renderStack(el, r) {
  const hy = r.hygiene;
  const byCat = STACK_CATEGORIES.map((c) => [c, r.stack.filter((s) => s.category === c)]).filter(([, v]) => v.length);
  el.innerHTML = `<div class="stack">
    <div class="grid g-2-1">
      ${card('탐지된 기술 스택', byCat.length ? byCat.map(([c, items]) => `<div class="stack-group"><div class="sg-title">${esc(c)}</div><div class="chips">${items.map((s) => `<span class="tech" data-tip="${esc(`근거: ${s.evidence}`)}">${esc(s.name)}</span>`).join('')}</div></div>`).join('') : '<div class="empty">알려진 프레임워크·도구를 찾지 못했습니다</div>', `${r.stack.length}개`, 'stack')}
      ${card('프로젝트 위생 점검', `<div class="hy-score"><div class="k-value">${hy.passed}<span class="hint" style="font-size:15px"> / ${hy.total}</span></div><div class="bl-track" style="flex:1"><div class="bl-fill" style="width:${hy.score * 100}%;background:${hy.score >= 0.7 ? 'var(--good)' : hy.score >= 0.4 ? 'var(--warn)' : 'var(--bad)'}"></div></div></div>
        <ul class="checklist">${hy.items.map((i) => `<li class="${i.na ? 'na' : i.ok ? 'ok' : 'no'}" data-tip="${esc(i.why + (i.file ? `\n→ ${i.file}` : ''))}"><span class="ck">${i.na ? '–' : i.ok ? '✓' : '✗'}</span>${esc(i.label)}${i.na ? ' <span class="hint">(해당 없음)</span>' : ''}</li>`).join('')}</ul>`, '', 'hygiene')}
    </div>
    <div id="deps-section"></div>
  </div>`;
  renderDeps($('#deps-section', el), r);
}

// ── 지표 설명
function renderGlossary(el) {
  el.innerHTML = `<div class="stack">
    <div class="note">각 화면의 카드 제목 옆 <span class="qhelp" style="pointer-events:none">?</span> 아이콘에 마우스를 올리면 해당 지표의 짧은 설명을 볼 수 있습니다. 아래는 모든 지표의 계산 방식과 해석 기준입니다.</div>
    ${GLOSSARY.map(([title, terms]) => card(title, `<dl class="glossary">${terms.map(([t, d]) => `<dt>${esc(t)}</dt><dd>${d}</dd>`).join('')}</dl>`)).join('')}
  </div>`;
}

// ── 파일 목록
function renderFiles(el, r) {
  const langs = [...new Set(r.files.map((f) => f.lang).filter(Boolean))].sort();
  const cats = Object.keys(r.categories);
  el.innerHTML = `<div class="card">
    <div class="toolbar">
      <input class="input" id="f-q" type="search" placeholder="경로 검색…" value="${esc(state.files.q)}">
      <select class="input" id="f-lang"><option value="">모든 언어</option>${langs.map((l) => `<option ${l === state.files.lang ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <select class="input" id="f-cat"><option value="">모든 분류</option>${cats.map((c) => `<option value="${c}" ${c === state.files.cat ? 'selected' : ''}>${CATEGORY_LABELS[c] || c}</option>`).join('')}</select>
      <span class="spacer"></span>
      <span class="hint" id="f-count"></span>
    </div>
    <div class="table-wrap"><table class="data" id="f-table">
      <thead><tr>
        <th class="sortable" data-k="path">경로</th><th class="sortable" data-k="lang">언어</th><th>분류</th>
        <th class="sortable num" data-k="lines">전체</th><th class="sortable num" data-k="code">코드</th><th class="sortable num" data-k="comment">주석</th>
        <th class="sortable num" data-k="size">용량</th><th class="sortable num" data-k="cx">복잡도</th><th class="sortable num" data-k="fn">함수</th><th class="sortable num" data-k="mi">MI</th><th class="sortable num" data-k="dup">중복</th>
      </tr></thead><tbody></tbody>
    </table></div>
    <div class="more" id="f-more"></div>
  </div>`;
  const update = () => {
    const { q, lang, cat, sort, asc, limit } = state.files;
    const ql = q.toLowerCase();
    let rows = r.files.filter((f) => (!ql || f.path.toLowerCase().includes(ql)) && (!lang || f.lang === lang) && (!cat || f.cat === cat));
    rows.sort((a, b) => {
      const blank = sort === 'path' || sort === 'lang' ? '' : -1;
      const x = a[sort] ?? blank, y = b[sort] ?? blank;
      const d = typeof x === 'string' ? String(x).localeCompare(String(y)) : x - y;
      return asc ? d : -d;
    });
    $('#f-count').textContent = `${fmt.num(rows.length)}개 파일`;
    $$('#f-table th[data-k]').forEach((th) => { th.classList.toggle('sorted', th.dataset.k === sort); th.classList.toggle('asc', th.dataset.k === sort && asc); });
    $('#f-table tbody').innerHTML = rows.slice(0, limit).map((f) => `<tr>${pathCell(f.path)}<td>${langTag(f.lang)}</td><td class="hint">${CATEGORY_LABELS[f.cat] || ''}${f.gen ? ' · 생성됨' : ''}${f.min ? ' · 최소화' : ''}</td>
      <td class="num">${f.lines ? fmt.num(f.lines) : '-'}</td><td class="num">${f.code ? fmt.num(f.code) : '-'}</td><td class="num">${f.comment ? fmt.num(f.comment) : '-'}</td>
      <td class="num">${fmt.bytes(f.size)}</td><td class="num">${f.cx ? cxPill(f.cx) : '-'}</td><td class="num">${f.fn || '-'}</td><td class="num">${f.mi != null ? `<span class="mi-pill ${miClass(f.mi)}">${f.mi.toFixed(0)}</span>` : '-'}</td><td class="num">${f.dup ? fmt.num(f.dup) : '-'}</td></tr>`).join('');
    $('#f-more').innerHTML = rows.length > limit ? `<button class="btn small">더 보기 (${fmt.num(rows.length - limit)}개 남음)</button>` : '';
  };
  let t;
  $('#f-q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { state.files.q = e.target.value; state.files.limit = 200; update(); }, 150); });
  $('#f-lang').addEventListener('change', (e) => { state.files.lang = e.target.value; state.files.limit = 200; update(); });
  $('#f-cat').addEventListener('change', (e) => { state.files.cat = e.target.value; state.files.limit = 200; update(); });
  $$('#f-table th[data-k]').forEach((th) => th.addEventListener('click', () => {
    const k = th.dataset.k;
    if (state.files.sort === k) state.files.asc = !state.files.asc;
    else { state.files.sort = k; state.files.asc = k === 'path' || k === 'lang'; }
    update();
  }));
  $('#f-more').addEventListener('click', () => { state.files.limit += 500; update(); });
  update();
}

// ── 품질
function renderQuality(el, r) {
  const s = r.summary, d = r.duplicates, td = r.todos;
  const ratioColor = (v, good, ok) => (v >= good ? 'var(--good)' : v >= ok ? 'var(--warn)' : 'var(--bad)');
  const catRows = Object.entries(r.categories).sort((a, b) => b[1].lines - a[1].lines);
  const simpleTable = (rows, valueHead, valueFn) => `<div class="table-wrap"><table class="data"><thead><tr><th>파일</th><th>언어</th><th class="num">${valueHead}</th></tr></thead>
    <tbody>${rows.map((f) => `<tr>${pathCell(f.path)}<td>${langTag(f.lang)}</td><td class="num">${valueFn(f)}</td></tr>`).join('')}</tbody></table></div>`;

  el.innerHTML = `<div class="stack">
    <div class="kpis">
      ${kpi('주석 비율', fmt.pct(s.commentRatio), '소스 코드 기준 (주석 / 코드+주석)', ratioColor(s.commentRatio, 0.15, 0.07), 'commentRatio')}
      ${kpi('테스트 코드 비율', fmt.pct(s.testRatio), `테스트 ${fmt.num(r.categories.test?.code || 0)}줄`, ratioColor(s.testRatio, 0.2, 0.08), 'testRatio')}
      ${kpi('TODO / FIXME', fmt.num(td.total), Object.entries(td.counts).map(([k, v]) => `${k} ${v}`).join(' · ') || '없음', td.total ? 'var(--warn)' : 'var(--good)', 'todo')}
      ${kpi('중복 파일', fmt.num(d.files), d.groupCount ? `${d.groupCount}개 그룹 · ${fmt.bytes(d.wastedBytes)} 낭비` : '없음', d.files ? 'var(--warn)' : 'var(--good)', 'identical')}
      ${kpi('1,000줄 넘는 소스', fmt.num(r.longFiles), '분할을 고려해 볼 파일', r.longFiles ? 'var(--warn)' : 'var(--good)')}
      ${kpi('생성/최소화 파일', fmt.num(s.generatedFiles), '잠금 파일, *.min.js 등', 'var(--muted)', '복잡도·함수·중복·유지보수성 계산에서 제외되는 파일입니다.')}
      ${kpi('120자 넘는 줄', fmt.num(s.longLines), s.code ? `코드 줄의 ${fmt.pct(s.longLines / s.code)}` : '', s.longLines / Math.max(1, s.code) > 0.05 ? 'var(--warn)' : 'var(--good)', 'longLines')}
      ${kpi('코드 중복률', fmt.pct(r.codeDup.sourceRatio), '소스 코드 기준', r.codeDup.sourceRatio > 0.1 ? 'var(--bad)' : r.codeDup.sourceRatio > 0.04 ? 'var(--warn)' : 'var(--good)', 'codeDup')}
    </div>
    <div class="grid g2">
      ${card('분류별 구성', `<div class="table-wrap"><table class="data"><thead><tr><th>분류</th><th class="num">파일</th><th class="num">코드</th><th class="num">전체 줄</th><th class="num">용량</th></tr></thead>
        <tbody>${catRows.map(([k, v]) => `<tr><td><span class="lang-tag"><span class="dot" style="background:${CAT_COLORS[k]}"></span>${CATEGORY_LABELS[k] || k}</span></td><td class="num">${fmt.num(v.files)}</td><td class="num">${fmt.num(v.code)}</td><td class="num">${fmt.num(v.lines)}</td><td class="num">${fmt.bytes(v.bytes)}</td></tr>`).join('')}</tbody></table></div>`, '', 'categories')}
      ${card('TODO · FIXME 주석', td.items.length ? `<div class="toolbar">${toggleHtml('todotag', [['', '전체'], ...Object.keys(td.counts).map((k) => [k, `${k} ${td.counts[k]}`])], state.todoTag)}</div><div class="scroll" id="todo-list"></div>` : '<div class="empty">발견된 TODO 주석이 없습니다 🎉</div>', td.total > td.items.length ? `${td.items.length}개 표시` : '', 'todo')}
    </div>
    <div class="grid g2">
      ${card('가장 긴 파일', simpleTable(r.largest.slice(0, 12), '줄 수', (f) => fmt.num(f.lines)), '생성 파일 제외')}
      ${card('가장 큰 파일', simpleTable(r.heaviest.slice(0, 12), '용량', (f) => fmt.bytes(f.size)), '바이너리 포함')}
    </div>
    ${card('중복 파일', d.groups.length ? `<div class="scroll">${d.groups.map((g) => `<div class="dup-group"><div style="display:flex;justify-content:space-between;margin-bottom:6px"><b>${g.paths.length}개 동일 파일</b><span class="hint">${fmt.bytes(g.size)} × ${g.paths.length}</span></div>${g.paths.map((p) => `<span class="mono">${esc(p)}</span>`).join('')}</div>`).join('')}</div>` : '<div class="empty">내용이 완전히 같은 텍스트 파일이 없습니다</div>', d.groupCount > d.groups.length ? `상위 ${d.groups.length}개 그룹` : '', 'identical')}
    ${r.generated.length ? card('생성 · 최소화된 파일', simpleTable(r.generated.slice(0, 30), '용량', (f) => fmt.bytes(f.size)), '복잡도 계산에서 제외됨') : ''}
  </div>`;

  const drawTodos = () => {
    const list = $('#todo-list');
    if (!list) return;
    const items = td.items.filter((t) => !state.todoTag || t.tag === state.todoTag);
    list.innerHTML = items.map((t) => `<div class="todo-item"><span class="tag tag-${esc(t.tag)}">${esc(t.tag)}</span><div><div>${esc(t.text) || '<span class="hint">(내용 없음)</span>'}</div><div class="todo-loc">${esc(t.path)}:${t.line}</div></div></div>`).join('');
  };
  bindToggle(el, 'todotag', (v) => { state.todoTag = v; $$('[data-toggle="todotag"] button', el).forEach((b) => b.classList.toggle('active', b.dataset.v === v)); drawTodos(); });
  drawTodos();
}

// ── 의존성
function renderDeps(el, r) {
  const ds = r.dependencies;
  if (!ds.length) {
    el.innerHTML = card('의존성', '<div class="empty">인식 가능한 패키지 매니페스트를 찾지 못했습니다.<br><span class="hint">지원: package.json, requirements.txt, pyproject.toml, go.mod, Cargo.toml, Gemfile, composer.json, *.csproj, packages.config, pom.xml, build.gradle, pubspec.yaml, Unity Packages/manifest.json</span></div>');
    return;
  }
  const all = ds.flatMap((d) => d.deps);
  const unique = new Set(all.map((x) => x.name));
  const dev = all.filter((x) => x.dev).length;
  const byEco = {};
  for (const d of ds) byEco[d.ecosystem] = (byEco[d.ecosystem] || 0) + d.deps.length;
  const ecoItems = Object.entries(byEco).sort((a, b) => b[1] - a[1]).map(([k, v], i) => ({ label: k, value: v, color: ['#5b7cfa', '#47c2a8', '#f0b04b', '#e0719e', '#9b8cf0', '#c58a5b', '#5bb974'][i % 7] }));

  el.innerHTML = `<div class="stack">
    <div class="kpis">
      ${kpi('매니페스트', fmt.num(ds.length), `${Object.keys(byEco).length}개 생태계`, 'var(--accent)')}
      ${kpi('선언된 의존성', fmt.num(all.length), `고유 패키지 ${fmt.num(unique.size)}개`, 'var(--accent-2)', 'deps')}
      ${kpi('런타임 의존성', fmt.num(all.length - dev), '', '#f0b04b')}
      ${kpi('개발/테스트 의존성', fmt.num(dev), '', 'var(--muted)')}
    </div>
    ${ecoItems.length > 1 ? card('생태계별 의존성 수', barList(ecoItems)) : ''}
    ${ds.map((d, i) => `<details class="card dep-card" ${i < 3 ? 'open' : ''}>
      <summary><span><span class="eco">${esc(d.ecosystem)}</span> <span class="mono hint">${esc(d.file)}</span></span><span class="hint">${d.deps.length}개 · 개발용 ${d.deps.filter((x) => x.dev).length}개</span></summary>
      <div class="table-wrap scroll"><table class="data"><thead><tr><th>패키지</th><th>버전</th></tr></thead>
        <tbody>${d.deps.map((x) => `<tr><td class="mono">${esc(x.name)}${x.dev ? '<span class="dev-badge">dev</span>' : ''}</td><td class="mono hint">${esc(x.version) || '-'}</td></tr>`).join('')}</tbody></table></div>
    </details>`).join('')}
  </div>`;
}

// ── 히스토리
const TYPE_COLORS = { '기능 추가': '#5b7cfa', '버그 수정': '#e5534b', '리팩터링': '#9b8cf0', '문서': '#f0b04b', '테스트': '#47c2a8', '빌드 · 의존성': '#c58a5b', 'CI': '#5d8aa8', '성능': '#e0719e', '유지보수': '#8a93a6', '스타일': '#b0a0d0', '되돌리기': '#a05050', '릴리스': '#5bb974', '병합': '#6e7681', '작업 중': '#999', '기타': '#5d6675' };

function renderHistory(el, r) {
  const g = r.git;
  if (!g && !r.github) {
    const why = r.meta.source === 'upload' ? '브라우저 폴더 선택 모드에서는 Git 히스토리를 읽을 수 없습니다. "로컬 경로" 모드를 사용하세요.' : 'Git 저장소가 아니거나 고급 옵션에서 커밋 히스토리 분석이 꺼져 있습니다.';
    el.innerHTML = card('커밋 히스토리', `<div class="empty">${why}</div>`);
    return;
  }
  const hotTable = (rows, head, val) => `<div class="table-wrap scroll"><table class="data"><thead><tr><th>파일</th><th class="num">변경</th><th class="num">작성자</th><th class="num">복잡도</th>${head ? `<th class="num">${head}</th>` : ''}</tr></thead>
    <tbody>${rows.map((f) => `<tr>${pathCell(f.path)}<td class="num">${fmt.num(f.changes)}</td><td class="num" data-tip="${esc(`주 작성자: ${f.owner} (${fmt.pct(f.ownership, 0)})`)}">${f.authors ?? '-'}</td><td class="num">${f.cx ? cxPill(f.cx) : '-'}</td>${head ? `<td class="num"><b>${val(f)}</b></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  const monthly = g ? (g.monthly.length > 72 ? toQuarters(g.monthly) : g.monthly.map((m) => ({ label: m.month, short: m.month.replace('-', '.'), value: m.count }))) : [];
  const sinceLast = g ? Math.max(0, Math.round((Date.now() - g.lastCommit) / 86400000)) : 0;
  const typeItems = g ? g.commitTypes.map((t) => ({ label: t.type, value: t.count, color: TYPE_COLORS[t.type] || '#6e7681', display: `${fmt.num(t.count)}커밋` })) : [];

  el.innerHTML = `<div class="stack">
    ${r.github ? card('GitHub 저장소', repoCard(r.github)) : ''}
    ${g ? `
    <div class="kpis">
      ${kpi('커밋', fmt.num(g.commits), `머지 커밋 ${fmt.num(g.merges)}개 별도`, 'var(--accent)')}
      ${kpi('기여자', fmt.num(g.contributors), `최근 90일 활동 ${fmt.num(g.recent.authors90)}명`, 'var(--accent-2)')}
      ${kpi('프로젝트 기간', fmt.duration(g.ageDays), `${fmt.date(g.firstCommit)} 시작`, '#f0b04b')}
      ${kpi('마지막 커밋', sinceLast === 0 ? '오늘' : `${fmt.duration(sinceLast)} 전`, fmt.date(g.lastCommit), sinceLast > 365 ? 'var(--bad)' : sinceLast > 90 ? 'var(--warn)' : 'var(--good)')}
      ${kpi('버스 팩터', `${g.busFactor}${g.fileBusFactor ? ` <span class="hint" style="font-size:14px">/ 파일 ${g.fileBusFactor}</span>` : ''}`, '커밋 기준 / 파일 소유 기준', g.busFactor <= 1 ? 'var(--bad)' : g.busFactor === 2 ? 'var(--warn)' : 'var(--good)', 'busFactor')}
      ${kpi('주당 평균 커밋', g.commitsPerWeek.toFixed(1), `활동한 날 ${fmt.num(g.activeDays)}일`, 'var(--muted)')}
    </div>
    <div class="grid g3">
      ${card('최근 활동', `<div class="mini-stats">
          ${mini('최근 30일', `${fmt.num(g.recent.d30)}커밋`)}
          ${mini('최근 90일', `${fmt.num(g.recent.d90)}커밋`)}
          ${mini('최근 1년', `${fmt.num(g.recent.d365)}커밋`)}
          ${mini('최장 공백', fmt.duration(Math.round(g.longestGap.days)))}
        </div>${explain(g.longestGap.days > 30 ? `가장 오래 커밋이 없었던 기간은 ${fmt.date(g.longestGap.from)} ~ ${fmt.date(g.longestGap.to)}입니다.` : '긴 공백 없이 꾸준히 개발되었습니다.')}`, '', 'recent')}
      ${card('커밋 습관', `<div class="mini-stats">
          ${mini('주말 커밋', fmt.pct(g.weekendRatio, 0))}
          ${mini('야간 커밋 (22–6시)', fmt.pct(g.nightRatio, 0))}
          ${mini('평균 메시지 길이', `${g.avgMessageLength.toFixed(0)}자`)}
          ${mini('Conventional Commits', fmt.pct(g.conventionalRatio, 0), 'feat:, fix:, docs: 처럼 유형 접두사를 붙이는 커밋 메시지 규칙을 따르는 비율입니다.')}
        </div>`, '', 'punch')}
      ${card('커밋 유형', `<div class="donut-wrap compact">${donut(typeItems, { size: 150, thickness: 22, centerValue: fmt.compact(g.commits), centerLabel: '커밋' })}${legend(typeItems, g.commits, { max: 7 })}</div>`, '메시지 기반 추정', 'commitTypes')}
    </div>
    ${card(g.monthly.length > 72 ? '분기별 커밋' : '월별 커밋', columns(monthly, { height: 220 }))}
    <div class="grid g2">
      ${card('연도별 추이', `<div class="table-wrap scroll"><table class="data"><thead><tr><th>연도</th><th class="num">커밋</th><th style="width:40%">커밋 비중</th><th class="num">활동 인원</th><th class="num">신규 기여자</th></tr></thead>
        <tbody>${[...g.yearly].reverse().map((y) => `<tr><td>${y.year}</td><td class="num">${fmt.num(y.commits)}</td><td><div class="bl-track"><div class="bl-fill" style="width:${(y.commits / Math.max(...g.yearly.map((x) => x.commits))) * 100}%;background:var(--accent)"></div></div></td><td class="num">${fmt.num(y.authors)}</td><td class="num">${fmt.num(y.newAuthors)}</td></tr>`).join('')}</tbody></table></div>`, '', '해마다 커밋 수, 그 해에 커밋한 사람 수, 그 해에 처음 커밋한 사람 수입니다. 신규 기여자가 꾸준하면 커뮤니티가 건강하다는 신호입니다.')}
      ${card('요일 · 시간대별 커밋', punchcard(g.punch), '작성자 현지 시간', 'punch')}
    </div>
    ${card('주요 기여자', `<div class="table-wrap scroll"><table class="data"><thead><tr><th>기여자</th><th class="num">커밋</th><th style="width:30%">비중</th><th>첫 커밋</th><th>마지막 커밋</th><th class="num">활동 기간</th></tr></thead>
      <tbody>${g.topAuthors.map((a) => `<tr><td>${esc(a.name)}</td><td class="num">${fmt.num(a.commits)}</td><td><div style="display:flex;gap:8px;align-items:center"><div class="bl-track" style="flex:1"><div class="bl-fill" style="width:${(a.commits / g.topAuthors[0].commits) * 100}%;background:var(--accent-2)"></div></div><span class="hint">${fmt.pct(a.commits / g.commits, 0)}</span></div></td><td class="hint">${fmt.date(a.first)}</td><td class="hint">${fmt.date(a.last)}</td><td class="num">${fmt.duration(Math.round((a.last - a.first) / 86400000))}</td></tr>`).join('')}</tbody></table></div>`, `상위 ${g.topAuthors.length}명`, 'busFactor')}
    ${g.hotspots ? `
    <div class="grid g2">
      ${card('핫스팟', g.hotspots.length ? hotTable(g.hotspots, '점수', (f) => fmt.compact(f.score)) : '<div class="empty">데이터 없음</div>', `최근 ${fmt.num(g.churnCommits)}커밋 · 변경 × 복잡도`, 'hotspot')}
      ${card('가장 자주 바뀐 파일', g.mostChanged?.length ? hotTable(g.mostChanged) : '<div class="empty">데이터 없음</div>', `최근 ${fmt.num(g.churnCommits)}커밋`, 'hotspot')}
    </div>
    <div class="grid g2">
      ${card('폴더별 코드 소유권', g.ownership?.length ? `<div class="table-wrap scroll"><table class="data"><thead><tr><th>폴더</th><th class="num">변경</th><th class="num">작성자</th><th>주 작성자</th><th class="num">비율</th></tr></thead>
        <tbody>${g.ownership.map((o) => `<tr><td class="path">${esc(o.name)}</td><td class="num">${fmt.num(o.changes)}</td><td class="num">${fmt.num(o.authors)}</td><td>${esc(o.owner)}</td><td class="num">${fmt.pct(o.share, 0)}</td></tr>`).join('')}</tbody></table></div>
        ${explain(`최근 커밋에서 변경된 파일 ${fmt.num(g.changedFiles)}개 중 <b>${fmt.pct(g.singleAuthorFiles / Math.max(1, g.changedFiles), 0)}</b>는 한 사람만 수정했습니다.`)}` : '<div class="empty">데이터 없음</div>', '', 'ownership')}
      ${card('지식 사일로', g.knowledgeSilos?.length ? `<div class="table-wrap scroll"><table class="data"><thead><tr><th>파일</th><th class="num">코드</th><th class="num">변경</th><th>유일한 작성자</th></tr></thead>
        <tbody>${g.knowledgeSilos.map((f) => `<tr>${pathCell(f.path)}<td class="num">${fmt.num(f.code)}</td><td class="num">${f.changes}</td><td>${esc(f.owner)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">한 사람만 수정한 큰 파일이 없습니다</div>', '100줄 이상 · 3회 이상 변경', 'silos')}
    </div>
    ${card('함께 변경되는 파일 (시간적 결합도)', g.coupling?.length ? `<div class="table-wrap scroll"><table class="data"><thead><tr><th>파일 A</th><th>파일 B</th><th class="num">함께 변경</th><th class="num">결합도</th></tr></thead>
      <tbody>${g.coupling.map((c) => `<tr><td class="path">${esc(c.a)}</td><td class="path">${esc(c.b)}</td><td class="num">${c.count}</td><td class="num"><b>${fmt.pct(c.degree, 0)}</b></td></tr>`).join('')}</tbody></table></div>
      ${explain('결합도 100%는 둘 중 적게 바뀐 파일이 바뀔 때마다 다른 파일도 함께 바뀌었다는 뜻입니다. 테스트와 구현 파일처럼 당연한 쌍도 있지만, 관련 없어 보이는 파일이 함께 바뀐다면 숨은 의존성을 의심해 보세요.')}` : '<div class="empty">3번 이상 함께 바뀐 파일 쌍이 없습니다</div>', `최근 ${fmt.num(g.churnCommits)}커밋`, 'coupling')}
    ` : ''}
    ` : `<div class="note">커밋 히스토리 분석이 꺼져 있어 GitHub 정보만 표시합니다.</div>`}
  </div>`;
}

function toQuarters(months) {
  const q = new Map();
  for (const m of months) {
    const [y, mo] = m.month.split('-').map(Number);
    const k = `${y} Q${Math.floor((mo - 1) / 3) + 1}`;
    q.set(k, (q.get(k) || 0) + m.count);
  }
  return [...q.entries()].map(([label, value]) => ({ label, short: label.replace(/^20/, "'"), value }));
}

// ───────────────────────── 내보내기 ─────────────────────────
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const slug = () => state.report.meta.name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'project';

function exportJson() {
  download(`${slug()}-analysis.json`, JSON.stringify(state.report, null, 2), 'application/json');
}

function exportMarkdown() {
  const r = state.report, s = r.summary, sc = r.score, c = r.complexity;
  const langs = codeLangsOf(r);
  const lt = langs.reduce((a, l) => a + l.code, 0) || 1;
  const row = (cells) => `| ${cells.join(' | ')} |`;
  const code = (t) => '`' + t + '`';
  const md = [
    `# ${r.meta.name} — 프로젝트 분석 리포트`,
    '',
    `- 대상: ${r.meta.target}${r.meta.branch ? ` (${r.meta.branch}${r.meta.commit ? ` @ ${r.meta.commit}` : ''})` : ''}`,
    `- 분석 일시: ${fmt.dateTime(r.meta.analyzedAt)}`,
    '',
    '## 요약',
    '',
    row(['항목', '값']), row(['---', '---']),
    row(['코드 줄 수', fmt.num(s.code)]),
    row(['전체 줄 수 (주석/공백)', `${fmt.num(s.lines)} (${fmt.num(s.comment)} / ${fmt.num(s.blank)})`]),
    row(['파일 / 폴더', `${fmt.num(s.files)} / ${fmt.num(s.dirs)}`]),
    row(['용량', fmt.bytes(s.bytes)]),
    row(['언어 수', String(s.languages)]),
    row(['규모 등급', `${sc.sizeGrade} (${sc.sizeLabel})`]),
    row(['복잡도 지수', `${sc.overall}/100 (${sc.label})`]),
    row(['주석 비율', fmt.pct(s.commentRatio)]),
    row(['테스트 코드 비율', fmt.pct(s.testRatio)]),
    row(['COCOMO 추정', `${r.cocomo.effortPM.toFixed(1)} 인·월, ${r.cocomo.scheduleMonths.toFixed(1)} 개월`]),
    '',
    '## 언어',
    '',
    row(['언어', '파일', '코드', '주석', '비율']), row(['---', '---:', '---:', '---:', '---:']),
    ...langs.map((l) => row([l.name, fmt.num(l.files), fmt.num(l.code), fmt.num(l.comment), fmt.pct(l.code / lt)])),
    '',
    '## 복잡도',
    '',
    `- 총 분기 수 ${fmt.num(c.total)}, 추정 함수 ${fmt.num(c.functions)}개, 함수당 평균 복잡도 ${c.avgPerFunction.toFixed(1)}`,
    `- 100줄당 분기 ${c.density.toFixed(1)}, 평균 중첩 ${c.avgNesting.toFixed(1)}, 최대 중첩 ${c.maxNesting}`,
    '',
    row(['복잡도 상위 파일', '코드', '복잡도']), row(['---', '---:', '---:']),
    ...c.top.slice(0, 10).map((f) => row([`\`${f.path}\``, fmt.num(f.code), fmt.num(f.cx)])),
    '',
    '## 최상위 폴더',
    '',
    row(['폴더', '파일', '코드', '용량']), row(['---', '---:', '---:', '---:']),
    ...r.tree.children.filter((n) => n.t === 'd').sort((a, b) => b.code - a.code).slice(0, 15).map((d) => row([`\`${d.name}/\``, fmt.num(d.files), fmt.num(d.code), fmt.bytes(d.size)])),
  ];
  const f = r.functions, m = r.maintainability, d = r.codeDup, h = r.insights.health;
  const lvl = { bad: '위험', warn: '주의', info: '참고', good: '좋음' };
  md.push('', '## 코드 건강도', '', `**${h.grade}** (${Math.round(h.overall)}/100)`, '', row(['영역', '점수', '근거']), row(['---', '---:', '---']), ...h.parts.map((p) => row([p.label, String(Math.round(p.score)), p.detail])));
  md.push('', '## 요약', '', ...r.insights.profile);
  md.push('', '## 발견 사항', '', ...r.insights.items.map((i) => `- **[${lvl[i.level]}] ${i.title}**${i.detail ? ` — ${i.detail}` : ''}${i.action ? ` _권장: ${i.action}_` : ''}`));
  if (f.count) {
    md.push('', '## 함수', '', `- 함수 ${fmt.num(f.count)}개, 평균 길이 ${f.avgLength.toFixed(1)}줄, 평균 복잡도 ${f.avgCx.toFixed(2)}`, `- 복잡도 10 초과 ${fmt.num(f.over10)}개, 20 초과 ${fmt.num(f.over20)}개, 100줄 초과 ${fmt.num(f.long100)}개`,
      '', row(['복잡도 상위 함수', '위치', '길이', '복잡도']), row(['---', '---', '---:', '---:']), ...f.topComplex.slice(0, 15).map((x) => row([code(x.name), code(`${x.path}:${x.line}`), String(x.length), String(x.cx)])));
  }
  md.push('', '## 유지보수성 · 중복', '', `- 평균 유지보수성 지수 ${m.avgMI.toFixed(0)} (MI<10 파일 ${m.low}개)`, `- Halstead 볼륨 ${fmt.compact(m.halstead.volume)}, 예상 결함 ${fmt.compact(m.halstead.bugs)}`, `- 소스 중복률 ${fmt.pct(d.sourceRatio)}, 전체 중복률 ${fmt.pct(d.ratio)} (${fmt.num(d.duplicatedLines)}줄)`);
  if (r.stack.length) md.push('', '## 기술 스택', '', ...STACK_CATEGORIES.map((c) => [c, r.stack.filter((x) => x.category === c)]).filter(([, v]) => v.length).map(([c, v]) => `- **${c}**: ${v.map((x) => x.name).join(', ')}`));
  md.push('', '## 프로젝트 위생', '', `${r.hygiene.passed}/${r.hygiene.total} 충족`, '', ...r.hygiene.items.map((i) => `- [${i.ok ? 'x' : ' '}] ${i.label}${i.na ? ' (해당 없음)' : ''}`));
  if (r.dependencies.length) {
    md.push('', '## 의존성', '', ...r.dependencies.map((d) => `- **${d.ecosystem}** \`${d.file}\`: ${d.deps.length}개 (개발용 ${d.deps.filter((x) => x.dev).length}개)`));
  }
  if (r.git) {
    md.push('', '## 히스토리', '', `- 커밋 ${fmt.num(r.git.commits)}개, 기여자 ${fmt.num(r.git.contributors)}명`, `- ${fmt.date(r.git.firstCommit)} ~ ${fmt.date(r.git.lastCommit)} (${fmt.duration(r.git.ageDays)})`, `- 버스 팩터 ${r.git.busFactor}, 최근 90일 커밋 ${r.git.recent.d90}개 (${r.git.recent.authors90}명)`, `- 커밋 유형: ${r.git.commitTypes.slice(0, 6).map((t) => `${t.type} ${t.count}`).join(', ')}`);
    if (r.git.hotspots?.length) md.push('', row(['핫스팟', '변경', '복잡도']), row(['---', '---:', '---:']), ...r.git.hotspots.slice(0, 10).map((f) => row([`\`${f.path}\``, String(f.changes), String(f.cx)])));
  }
  md.push('', '---', '_Project Size Analyzer로 생성됨. 복잡도는 휴리스틱 기반 추정치입니다._', '');
  download(`${slug()}-report.md`, md.join('\n'), 'text/markdown');
}
