import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', LC_ALL: 'C' };

export function runGit(args, { cwd, onStderr, maxBytes = 512 * 1024 * 1024, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-c', 'core.quotepath=false', '-c', 'core.longpaths=true', ...args], { cwd, env: GIT_ENV, windowsHide: true, signal });
    const out = [];
    let size = 0;
    let err = '';
    child.stdout.on('data', (b) => {
      size += b.length;
      if (size > maxBytes) { child.kill(); return; }
      out.push(b);
    });
    child.stderr.on('data', (b) => {
      const s = b.toString();
      err = (err + s).slice(-4000);
      if (onStderr) onStderr(s);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(out).toString('utf8'));
      else {
        const lines = err.split(/[\r\n]+/).filter((l) => l.trim() && !/^(remote: )?(Counting|Compressing|Receiving|Resolving|Enumerating|Updating files)/.test(l));
        reject(new Error(lines.slice(-4).join('\n') || `git ${args[0]} 실패 (code ${code})`));
      }
    });
  });
}

export async function isGitRepo(dir) {
  try {
    const r = await runGit(['rev-parse', '--is-inside-work-tree'], { cwd: dir });
    return r.trim() === 'true';
  } catch { return false; }
}

/** "owner/repo", GitHub URL(트리/브랜치 포함), 기타 https git URL 해석 */
export function parseRepoInput(input) {
  const s = String(input || '').trim().replace(/\.git$/, '').replace(/\/+$/, '');
  let m = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(s);
  if (m) return { url: `https://github.com/${m[1]}/${m[2]}.git`, owner: m[1], repo: m[2], github: true, name: `${m[1]}/${m[2]}` };
  m = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/(?:tree|blob)\/(.+))?$/i.exec(s);
  if (m) return { url: `https://github.com/${m[1]}/${m[2]}.git`, owner: m[1], repo: m[2], github: true, branch: m[3] ? decodeURIComponent(m[3]) : undefined, name: `${m[1]}/${m[2]}` };
  if (/^https:\/\/[^\s]+$/i.test(s)) {
    const name = s.replace(/^https:\/\/[^/]+\//, '');
    return { url: s, github: false, name };
  }
  throw new Error('저장소 주소를 해석할 수 없습니다. "owner/repo" 또는 https://github.com/owner/repo 형식으로 입력하세요.');
}

export async function cloneRepo(info, { branch, history, onProgress, signal }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'psa-'));
  const args = ['clone', '--progress', '--single-branch', '--no-tags'];
  if (history) args.push('--filter=blob:none'); else args.push('--depth', '1');
  if (branch) args.push('--branch', branch);
  args.push('--', info.url, dir);
  let last = 0;
  try {
    await runGit(args, {
      signal,
      onStderr: (s) => {
        const now = Date.now();
        const line = s.split(/[\r\n]+/).filter(Boolean).pop();
        if (line && now - last > 250) { last = now; onProgress?.(line.replace(/^remote:\s*/, '').trim()); }
      },
    });
  } catch (e) {
    await removeDir(dir);
    if (/not found|could not read Username|Authentication failed|403/i.test(e.message)) throw new Error('저장소를 찾을 수 없거나 비공개 저장소입니다.');
    if (/Remote branch .* not found/i.test(e.message)) throw new Error(`브랜치 "${branch}"를 찾을 수 없습니다.`);
    throw e;
  }
  return dir;
}

export async function removeDir(dir) {
  try { await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* 임시 폴더 정리 실패는 무시 */ }
}

export async function headInfo(dir) {
  try {
    const [branch, sha, date] = await Promise.all([
      runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir }),
      runGit(['rev-parse', '--short', 'HEAD'], { cwd: dir }),
      runGit(['log', '-1', '--format=%ct'], { cwd: dir }),
    ]);
    return { branch: branch.trim(), commit: sha.trim(), commitDate: Number(date.trim()) * 1000 };
  } catch { return null; }
}

export async function listGitFiles(dir) {
  const out = await runGit(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: dir });
  return [...new Set(out.split('\0').filter(Boolean))];
}

/** 커밋 히스토리 분석: 기여자, 월별 커밋, 요일×시간 분포, 변경 빈도(churn) */
export async function analyzeHistory(dir, { churnCommits = 1500, shallow = false } = {}) {
  const raw = await runGit(['log', '--no-merges', '--format=%at%x09%ad%x09%aN%x09%s', '--date=raw', '--', '.'], { cwd: dir });
  const rows = raw.split('\n').filter(Boolean);
  if (!rows.length) return null;
  let merges = 0;
  try { merges = Number((await runGit(['rev-list', '--merges', '--count', 'HEAD', '--', '.'], { cwd: dir })).trim()) || 0; } catch { /* 무시 */ }

  const authors = new Map();
  const monthly = new Map();
  const yearly = new Map();
  const types = new Map();
  const punch = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const activeDays = new Set();
  const times = [];
  let first = Infinity, last = 0, conventional = 0, msgLen = 0;
  const now = Date.now() / 1000;
  const recent = { d30: 0, d90: 0, d365: 0 };
  const recentAuthors = new Set();

  for (const r of rows) {
    const [ts, rawDate, name, subject = ''] = r.split('\t');
    const t = Number(ts);
    if (!t) continue;
    times.push(t);
    if (t < first) first = t;
    if (t > last) last = t;
    let a = authors.get(name);
    if (!a) authors.set(name, (a = { name, commits: 0, first: t, last: t }));
    a.commits++;
    if (t < a.first) a.first = t;
    if (t > a.last) a.last = t;
    const d = new Date(t * 1000);
    const mk = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    monthly.set(mk, (monthly.get(mk) || 0) + 1);
    let y = yearly.get(d.getUTCFullYear());
    if (!y) yearly.set(d.getUTCFullYear(), (y = { commits: 0, authors: new Set() }));
    y.commits++; y.authors.add(name);
    // 작성자 현지 시간으로 요일/시간 계산
    const tz = /([+-])(\d{2})(\d{2})$/.exec(rawDate || '');
    const off = tz ? (tz[1] === '-' ? -1 : 1) * (Number(tz[2]) * 60 + Number(tz[3])) : 0;
    const local = new Date((t + off * 60) * 1000);
    punch[(local.getUTCDay() + 6) % 7][local.getUTCHours()]++;
    activeDays.add(local.toISOString().slice(0, 10));
    const age = now - t;
    if (age <= 30 * 86400) recent.d30++;
    if (age <= 90 * 86400) { recent.d90++; recentAuthors.add(name); }
    if (age <= 365 * 86400) recent.d365++;
    const ct = classifyCommit(subject);
    if (ct.conventional) conventional++;
    types.set(ct.type, (types.get(ct.type) || 0) + 1);
    msgLen += subject.length;
  }

  // 커밋 간 최장 공백
  times.sort((a, b) => a - b);
  let gap = { days: 0, from: 0, to: 0 };
  for (let i = 1; i < times.length; i++) {
    const g = times[i] - times[i - 1];
    if (g / 86400 > gap.days) gap = { days: g / 86400, from: times[i - 1] * 1000, to: times[i] * 1000 };
  }
  // 버스 팩터(커밋 기준): 전체 커밋의 50%를 만든 최소 인원
  const sortedAuthors = [...authors.values()].sort((a, b) => b.commits - a.commits);
  let acc = 0, busFactor = 0;
  for (const a of sortedAuthors) { acc += a.commits; busFactor++; if (acc >= rows.length / 2) break; }
  const seenAuthors = new Set();
  const years = [...yearly.entries()].sort((a, b) => a[0] - b[0]).map(([year, v]) => {
    const fresh = [...v.authors].filter((n) => !seenAuthors.has(n));
    fresh.forEach((n) => seenAuthors.add(n));
    return { year, commits: v.commits, authors: v.authors.size, newAuthors: fresh.length };
  });
  const totalPunch = rows.length || 1;
  const weekend = punch[5].reduce((a, b) => a + b, 0) + punch[6].reduce((a, b) => a + b, 0);
  const night = punch.reduce((a, row) => a + row.filter((_, h) => h >= 22 || h < 6).reduce((x, y) => x + y, 0), 0);

  // 빈 달도 0으로 채워 연속 시계열 생성
  const months = [];
  if (first !== Infinity) {
    const s = new Date(first * 1000), e = new Date(last * 1000);
    let y = s.getUTCFullYear(), mo = s.getUTCMonth();
    while (y < e.getUTCFullYear() || (y === e.getUTCFullYear() && mo <= e.getUTCMonth())) {
      const k = `${y}-${String(mo + 1).padStart(2, '0')}`;
      months.push({ month: k, count: monthly.get(k) || 0 });
      if (++mo > 11) { mo = 0; y++; }
    }
  }

  // 파일별 변경 빈도·작성자, 함께 바뀌는 파일 쌍(시간적 결합도)
  let churn = null, coupling = null;
  if (churnCommits > 0) {
    try {
      const log = await runGit(['log', '--no-merges', `-n${churnCommits}`, '--name-only', '--relative', '--format=%x00%aN', '--', '.'], { cwd: dir });
      churn = new Map();
      const pairs = new Map();
      let author = null, batch = [];
      const flush = () => {
        if (batch.length >= 2 && batch.length <= 30) {
          batch.sort();
          for (let i = 0; i < batch.length; i++) for (let j = i + 1; j < batch.length; j++) {
            const k = `${batch[i]}\u0001${batch[j]}`;
            pairs.set(k, (pairs.get(k) || 0) + 1);
          }
        }
        batch = [];
      };
      for (const l of log.split('\n')) {
        if (l.startsWith('\0')) { flush(); author = l.slice(1).trim(); continue; }
        const p = l.trim();
        if (!p) continue;
        let c = churn.get(p);
        if (!c) churn.set(p, (c = { changes: 0, authors: new Map() }));
        c.changes++;
        c.authors.set(author, (c.authors.get(author) || 0) + 1);
        batch.push(p);
      }
      flush();
      coupling = [...pairs.entries()].filter(([, n]) => n >= 3).map(([k, n]) => { const [a, b] = k.split('\u0001'); return { a, b, count: n }; });
    } catch { churn = null; }
  }

  return {
    commits: rows.length,
    merges,
    contributors: authors.size,
    firstCommit: first * 1000,
    lastCommit: last * 1000,
    ageDays: Math.round((last - first) / 86400),
    activeDays: activeDays.size,
    monthly: months,
    yearly: years,
    punch,
    weekendRatio: weekend / totalPunch,
    nightRatio: night / totalPunch,
    recent: { ...recent, authors90: recentAuthors.size },
    busFactor,
    longestGap: gap,
    commitsPerWeek: rows.length / Math.max(1, (last - first) / 604800),
    avgMessageLength: msgLen / rows.length,
    conventionalRatio: conventional / rows.length,
    commitTypes: [...types.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count })),
    topAuthors: sortedAuthors.slice(0, 20).map((a) => ({ name: a.name, commits: a.commits, first: a.first * 1000, last: a.last * 1000 })),
    churn,
    coupling,
    churnCommits: Math.min(churnCommits, rows.length),
    shallow,
  };
}

// 커밋 메시지 분류: Conventional Commits 접두사 우선, 없으면 키워드로 추정
const CONV_MAP = {
  feat: '기능 추가', feature: '기능 추가', fix: '버그 수정', bugfix: '버그 수정', hotfix: '버그 수정', docs: '문서', doc: '문서',
  style: '스타일', refactor: '리팩터링', perf: '성능', test: '테스트', tests: '테스트', build: '빌드 · 의존성', deps: '빌드 · 의존성',
  ci: 'CI', chore: '유지보수', revert: '되돌리기', release: '릴리스', wip: '작업 중',
};
const KEYWORD_RULES = [
  [/^revert\b/i, '되돌리기'],
  [/\b(fix(e[sd])?|bugs?|hotfix|patch(ed)?|resolve[sd]?|crash|issue|error|broken|regression)\b/i, '버그 수정'],
  [/\b(perf|performance|optimi[sz]e[sd]?|speed ?up|faster)\b/i, '성능'],
  [/\b(refactor(ed|ing)?|clean ?up|restructure|simplif(y|ied)|rename[sd]?|reorgani[sz]e)\b/i, '리팩터링'],
  [/\b(tests?|specs?|coverage)\b/i, '테스트'],
  [/\b(docs?|readme|documentation|comments?|typos?|changelog)\b/i, '문서'],
  [/\b(bump(ed)?|upgrade[sd]?|deps|dependenc(y|ies)|release[sd]?|version|v\d+\.\d+)\b/i, '빌드 · 의존성'],
  [/\b(ci|workflow|pipeline|travis|actions)\b/i, 'CI'],
  [/^merge\b/i, '병합'],
  [/\b(add(s|ed)?|implement(s|ed)?|introduce[sd]?|support(s|ed)?|new|create[sd]?|enable[sd]?|feat)\b/i, '기능 추가'],
];
function classifyCommit(subject) {
  const m = /^(\w+)(\([^)]*\))?!?:\s/.exec(subject);
  if (m && CONV_MAP[m[1].toLowerCase()]) return { type: CONV_MAP[m[1].toLowerCase()], conventional: true };
  for (const [re, type] of KEYWORD_RULES) if (re.test(subject)) return { type, conventional: false };
  return { type: '기타', conventional: false };
}
