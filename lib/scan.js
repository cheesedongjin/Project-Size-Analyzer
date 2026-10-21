import fs from 'node:fs/promises';
import path from 'node:path';
import { makeIgnore } from '../shared/ignore.js';
import { isBinaryName } from '../shared/languages.js';
import { isGitRepo, listGitFiles } from './git.js';

/**
 * 폴더의 파일 목록과 내용을 읽어 analyzer 입력 형태로 반환
 * opts: { ignore: string[], useGitignore, maxFileBytes, maxFiles, onProgress }
 */
export async function collectFiles(root, opts) {
  const ig = makeIgnore(opts.ignore || []);
  const maxFiles = opts.maxFiles || 200_000;
  const warnings = [];
  let rels;

  if (opts.useGitignore && (await isGitRepo(root))) {
    opts.onProgress?.('git ls-files로 추적 파일 목록을 가져오는 중…');
    rels = (await listGitFiles(root)).filter((p) => !ig.path(p));
  } else {
    opts.onProgress?.('폴더를 탐색하는 중…');
    rels = await walk(root, ig, maxFiles + 1, opts.onProgress);
  }
  if (rels.length > maxFiles) {
    warnings.push(`파일이 너무 많아 처음 ${maxFiles.toLocaleString()}개만 분석했습니다.`);
    rels = rels.slice(0, maxFiles);
  }

  const results = new Array(rels.length);
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < rels.length) {
      const i = next++;
      results[i] = await readOne(root, rels[i], opts.maxFileBytes);
      if (++done % 500 === 0) opts.onProgress?.(`파일 읽는 중… ${done.toLocaleString()} / ${rels.length.toLocaleString()}`);
    }
  };
  await Promise.all(Array.from({ length: 32 }, worker));
  return { files: results.filter(Boolean), warnings };
}

async function walk(root, ig, limit, onProgress) {
  const out = [];
  const stack = [''];
  while (stack.length && out.length < limit) {
    const rel = stack.pop();
    let entries;
    try { entries = await fs.readdir(path.join(root, rel), { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (!ig.dir(e.name, r)) stack.push(r); }
      else if (e.isFile() && !ig.file(e.name, r)) out.push(r);
    }
    if (out.length % 2000 < entries.length) onProgress?.(`폴더 탐색 중… ${out.length.toLocaleString()}개 파일 발견`);
  }
  return out;
}

async function readOne(root, rel, maxBytes) {
  const full = path.join(root, rel);
  let st;
  try { st = await fs.lstat(full); } catch { return null; }
  if (!st.isFile()) return null;
  const base = { path: rel.replace(/\\/g, '/'), size: st.size };
  if (isBinaryName(rel)) return { ...base, content: null, binary: true };
  if (st.size > maxBytes) return { ...base, content: null, binary: true, skipped: 'too-large' };
  let buf;
  try { buf = await fs.readFile(full); } catch { return null; }
  const probe = buf.subarray(0, 8000);
  if (probe.includes(0)) return { ...base, content: null, binary: true };
  return { ...base, content: buf.toString('utf8') };
}
