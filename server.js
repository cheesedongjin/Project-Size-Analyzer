import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from './shared/analyzer.js';
import { DEFAULT_IGNORE } from './shared/ignore.js';
import { collectFiles } from './lib/scan.js';
import { parseRepoInput, cloneRepo, removeDir, isGitRepo, analyzeHistory, headInfo } from './lib/git.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4580;
const HOST = process.env.HOST || '127.0.0.1';

const STATIC = { '/shared/': path.join(ROOT, 'shared'), '/': path.join(ROOT, 'public') };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.png': 'image/png' };

// DNS 리바인딩 방지: 로컬 호스트 이름으로 들어온 요청만 허용
const ALLOWED_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

const server = http.createServer(async (req, res) => {
  try {
    if (!ALLOWED_HOST.test(req.headers.host || '')) return send(res, 403, 'Forbidden');
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'POST' && url.pathname === '/api/analyze') return await handleAnalyze(req, res);
    if (req.method === 'GET' && url.pathname === '/api/config') {
      return send(res, 200, JSON.stringify({ defaultIgnore: DEFAULT_IGNORE, cwd: process.cwd(), githubToken: !!process.env.GITHUB_TOKEN }), 'application/json');
    }
    if (req.method === 'GET' || req.method === 'HEAD') return await serveStatic(url.pathname, res);
    send(res, 405, 'Method Not Allowed');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, 'Internal Server Error');
  }
});

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

async function serveStatic(pathname, res) {
  const prefix = Object.keys(STATIC).find((p) => pathname.startsWith(p));
  const base = STATIC[prefix];
  let rel = decodeURIComponent(pathname.slice(prefix.length)) || 'index.html';
  const file = path.resolve(base, rel);
  if (!file.startsWith(base + path.sep)) return send(res, 403, 'Forbidden');
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    send(res, 404, 'Not Found');
  }
}

async function readJson(req) {
  if (!/application\/json/.test(req.headers['content-type'] || '')) throw new Error('Content-Type은 application/json이어야 합니다.');
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('요청이 너무 큽니다.');
  }
  return JSON.parse(body || '{}');
}

async function handleAnalyze(req, res) {
  let body;
  try { body = await readJson(req); } catch (e) { return send(res, 400, e.message); }

  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
  const abort = new AbortController();
  res.on('close', () => abort.abort());
  const emit = (obj) => { if (!res.writableEnded) res.write(JSON.stringify(obj) + '\n'); };
  const progress = (message, pct) => emit({ type: 'progress', message, pct });

  const started = Date.now();
  let tempDir = null;
  try {
    const options = body.options || {};
    const ignore = Array.isArray(options.ignore) ? options.ignore.map(String) : DEFAULT_IGNORE;
    const maxFileBytes = Math.max(0.1, Math.min(50, Number(options.maxFileMB) || 2)) * 1024 * 1024;
    const wantHistory = options.history !== false;
    let dir, meta, ghPromise = null;

    if (body.source === 'github') {
      const info = parseRepoInput(body.url);
      const branch = (body.branch || '').trim() || info.branch;
      if (branch && !/^[\w./-]+$/.test(branch)) throw new Error('브랜치 이름이 올바르지 않습니다.');
      if (info.github) ghPromise = githubMeta(info.owner, info.repo).catch(() => null);
      progress(`${info.name} 저장소 복제 중…`, 5);
      tempDir = dir = await cloneRepo(info, { branch, history: wantHistory, signal: abort.signal, onProgress: (m) => progress(`복제 중: ${m}`, 10) });
      meta = { source: 'github', name: info.name, target: info.url.replace(/\.git$/, ''), branch };
    } else if (body.source === 'local') {
      const p = String(body.path || '').trim().replace(/^"|"$/g, '');
      if (!p) throw new Error('분석할 폴더 경로를 입력하세요.');
      dir = path.resolve(p);
      const st = await fs.stat(dir).catch(() => null);
      if (!st || !st.isDirectory()) throw new Error(`폴더를 찾을 수 없습니다: ${dir}`);
      meta = { source: 'local', name: path.basename(dir) || dir, target: dir };
    } else {
      throw new Error('알 수 없는 분석 대상입니다.');
    }

    if (abort.signal.aborted) return;
    progress('파일 목록 수집 중…', 30);
    const { files, warnings } = await collectFiles(dir, {
      ignore,
      useGitignore: options.useGitignore !== false,
      maxFileBytes,
      onProgress: (m) => progress(m, 40),
    });
    if (abort.signal.aborted) return;
    if (!files.length) throw new Error('분석할 파일이 없습니다. 제외 규칙을 확인하세요.');

    progress(`${files.length.toLocaleString()}개 파일 분석 중…`, 60);
    const report = analyze(files, { onProgress: (i, n) => { if (i && i % 5000 === 0) progress(`코드 분석 중… ${i.toLocaleString()} / ${n.toLocaleString()}`, 60 + (i / n) * 20); } });
    report.warnings.push(...warnings);

    if (await isGitRepo(dir)) {
      Object.assign(meta, await headInfo(dir));
      if (wantHistory) {
        progress('커밋 히스토리 분석 중…', 85);
        try {
          const hist = await analyzeHistory(dir, {});
          if (hist) report.git = finalizeHistory(hist, report);
        } catch (e) {
          report.warnings.push(`히스토리 분석 실패: ${e.message}`);
        }
      }
    }
    if (ghPromise) {
      progress('GitHub 저장소 정보 가져오는 중…', 95);
      report.github = await ghPromise;
    }

    meta.analyzedAt = Date.now();
    meta.durationMs = Date.now() - started;
    report.meta = meta;
    emit({ type: 'result', report });
  } catch (e) {
    if (!abort.signal.aborted) emit({ type: 'error', message: e.message || String(e) });
  } finally {
    if (tempDir) await removeDir(tempDir);
    res.end();
  }
}

function finalizeHistory(hist, report) {
  const { churn, coupling, ...rest } = hist;
  if (!churn) return rest;
  const byPath = new Map(report.files.map((f) => [f.path, f]));
  const changed = [];
  const ownerFiles = new Map();
  const dirs = new Map();
  let single = 0;
  for (const [p, c] of churn) {
    const f = byPath.get(p);
    if (!f || f.gen || f.min || f.bin) continue;
    const [owner, ownerChanges] = [...c.authors.entries()].sort((a, b) => b[1] - a[1])[0];
    changed.push({ path: p, changes: c.changes, cx: f.cx, code: f.code, lang: f.lang, authors: c.authors.size, owner, ownership: ownerChanges / c.changes });
    if (c.authors.size === 1) single++;
    ownerFiles.set(owner, (ownerFiles.get(owner) || 0) + 1);
    // 최상위 폴더별 소유권
    const top = p.includes('/') ? p.slice(0, p.indexOf('/')) : '(루트 파일)';
    let d = dirs.get(top);
    if (!d) dirs.set(top, (d = { name: top, changes: 0, files: 0, authors: new Map() }));
    d.changes += c.changes; d.files++;
    for (const [a, n] of c.authors) d.authors.set(a, (d.authors.get(a) || 0) + n);
  }
  rest.mostChanged = [...changed].sort((a, b) => b.changes - a.changes).slice(0, 20);
  // 핫스팟: 변경 횟수 × 복잡도 (자주 바뀌면서 복잡한 파일)
  rest.hotspots = changed.filter((f) => f.cx > 0).map((f) => ({ ...f, score: f.changes * f.cx })).sort((a, b) => b.score - a.score).slice(0, 20);
  rest.changedFiles = changed.length;
  rest.singleAuthorFiles = single;
  // 파일 소유 기준 버스 팩터: 변경된 파일의 50%를 주로 맡은 최소 인원
  let acc = 0, fileBus = 0;
  for (const n of [...ownerFiles.values()].sort((a, b) => b - a)) { acc += n; fileBus++; if (acc >= changed.length / 2) break; }
  rest.fileBusFactor = changed.length ? fileBus : 0;
  rest.ownership = [...dirs.values()].sort((a, b) => b.changes - a.changes).slice(0, 15).map((d) => {
    const [owner, n] = [...d.authors.entries()].sort((a, b) => b[1] - a[1])[0];
    return { name: d.name, changes: d.changes, files: d.files, authors: d.authors.size, owner, share: n / d.changes };
  });
  rest.knowledgeSilos = changed.filter((f) => f.authors === 1 && f.changes >= 3 && f.code >= 100).sort((a, b) => b.code - a.code).slice(0, 15);
  // 시간적 결합도: 함께 변경된 횟수 / 둘 중 적게 변경된 파일의 변경 횟수
  rest.coupling = (coupling || [])
    .filter((c) => byPath.has(c.a) && byPath.has(c.b))
    .map((c) => ({ ...c, degree: c.count / Math.min(churn.get(c.a).changes, churn.get(c.b).changes) }))
    .sort((x, y) => y.count * y.degree - x.count * x.degree)
    .slice(0, 25);
  return rest;
}

async function githubMeta(owner, repo) {
  const headers = { 'User-Agent': 'project-size-analyzer', Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const opt = { headers, signal: AbortSignal.timeout(10000) };
  const [r, c] = await Promise.all([fetch(base, opt), fetch(`${base}/contributors?per_page=1&anon=1`, opt)]);
  if (!r.ok) return null;
  const j = await r.json();
  // Link 헤더의 마지막 페이지 번호 = 전체 기여자 수
  let contributors = null;
  if (c.ok) {
    const link = c.headers.get('link') || '';
    const m = /[?&]page=(\d+)>;\s*rel="last"/.exec(link);
    contributors = m ? Number(m[1]) : (await c.json()).length;
  }
  return {
    fullName: j.full_name, description: j.description, htmlUrl: j.html_url, homepage: j.homepage,
    stars: j.stargazers_count, forks: j.forks_count, watchers: j.subscribers_count, openIssues: j.open_issues_count,
    license: j.license?.spdx_id && j.license.spdx_id !== 'NOASSERTION' ? j.license.spdx_id : j.license?.name || null,
    createdAt: j.created_at, pushedAt: j.pushed_at, defaultBranch: j.default_branch, topics: j.topics || [],
    archived: j.archived, fork: j.fork, sizeKB: j.size, avatar: j.owner?.avatar_url, contributors,
  };
}

server.listen(PORT, HOST, () => {
  console.log(`\n  Project Size Analyzer 실행 중 →  http://localhost:${PORT}\n`);
});
