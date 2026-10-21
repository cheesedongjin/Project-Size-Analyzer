// 서버(폴더 탐색)와 브라우저(폴더 업로드)가 함께 쓰는 제외 규칙

export const DEFAULT_IGNORE = [
  '.git', '.hg', '.svn', 'node_modules', 'bower_components', 'jspm_packages',
  'dist', 'build', 'out', 'target', 'bin', 'obj', '.next', '.nuxt', '.svelte-kit', '.output',
  '.cache', '.parcel-cache', '.turbo', 'coverage', '.nyc_output',
  '__pycache__', '.venv', 'venv', '.tox', '.mypy_cache', '.pytest_cache', '.ruff_cache', '*.egg-info',
  '.idea', '.vs', '.vscode', '.gradle', 'Pods', 'DerivedData', '.terraform', '.dart_tool',
  'Library', 'Temp', 'Logs', 'UserSettings', 'MemoryCaptures',
  '.DS_Store', 'Thumbs.db',
];

function globToRegExp(glob) {
  const re = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '.*');
  return new RegExp(`^${re}$`, 'i');
}

/**
 * patterns: 항목 이름(정확히 일치하는 폴더/파일명) 또는 glob(*.min.js, docs/**)
 * 반환: { dir(name, relPath), file(name, relPath), path(relPath) }
 */
export function makeIgnore(patterns) {
  const names = new Set();
  const globs = [];
  for (const raw of patterns) {
    const p = raw.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!p || p.startsWith('#')) continue;
    if (/[*?]/.test(p) || p.includes('/')) globs.push({ re: globToRegExp(p), full: p.includes('/') });
    else names.add(p.toLowerCase());
  }
  const hit = (name, rel) => {
    if (names.has(name.toLowerCase())) return true;
    for (const g of globs) if (g.re.test(g.full ? rel : name)) return true;
    return false;
  };
  return {
    dir: hit,
    file: hit,
    // 경로 전체 검사(각 상위 폴더 포함) — git ls-files나 업로드 목록처럼 평면 목록일 때 사용
    path(rel) {
      const parts = rel.split('/');
      for (let i = 0; i < parts.length; i++) {
        if (hit(parts[i], parts.slice(0, i + 1).join('/'))) return true;
      }
      return false;
    },
  };
}

export function parsePatterns(text) {
  return String(text || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
}
