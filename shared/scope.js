// Report suspicious scope without silently excluding project-specific folders.
export function assessScope(files) {
  const groups = new Map();
  for (const f of files) {
    const parts = f.path.replace(/\\/g, '/').split('/');
    const i = parts.slice(0, -1).findIndex((p) => /^\.verify(?:-|$)/i.test(p) || ['.pimpi', '.claude'].includes(p));
    if (i < 0) continue;
    const path = parts.slice(0, i + 1).join('/');
    const g = groups.get(path) || { path, files: 0, bytes: 0 };
    g.files++; g.bytes += f.size || 0;
    groups.set(path, g);
  }
  const candidates = [...groups.values()].sort((a, b) => b.files - a.files);
  const count = candidates.reduce((n, g) => n + g.files, 0);
  return { candidates, files: count, ratio: files.length ? count / files.length : 0 };
}

export function filterFiles(files, ignore) {
  return files.filter((f) => !ignore.path(f.path));
}
