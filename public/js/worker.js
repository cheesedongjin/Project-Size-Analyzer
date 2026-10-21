// 브라우저에서 선택한 폴더를 메인 스레드를 막지 않고 분석
import { analyze } from '../shared/analyzer.js';
import { isBinaryName } from '../shared/languages.js';

self.onmessage = async (e) => {
  const { files, maxFileBytes } = e.data;
  try {
    const decoder = new TextDecoder('utf-8');
    const out = [];
    const n = files.length;
    for (let i = 0; i < n; i++) {
      const { path, file } = files[i];
      const base = { path, size: file.size };
      if (isBinaryName(path)) out.push({ ...base, content: null, binary: true });
      else if (file.size > maxFileBytes) out.push({ ...base, content: null, binary: true, skipped: 'too-large' });
      else {
        const buf = new Uint8Array(await file.arrayBuffer());
        if (buf.subarray(0, 8000).includes(0)) out.push({ ...base, content: null, binary: true });
        else out.push({ ...base, content: decoder.decode(buf) });
      }
      if (i % 200 === 0) self.postMessage({ type: 'progress', message: `파일 읽는 중… ${i.toLocaleString()} / ${n.toLocaleString()}`, pct: (i / n) * 60 });
    }
    self.postMessage({ type: 'progress', message: `${n.toLocaleString()}개 파일 분석 중…`, pct: 65 });
    const report = analyze(out, {
      onProgress: (i, total) => { if (i && i % 2000 === 0) self.postMessage({ type: 'progress', message: `코드 분석 중… ${i.toLocaleString()} / ${total.toLocaleString()}`, pct: 65 + (i / total) * 30 }); },
    });
    self.postMessage({ type: 'result', report });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || String(err) });
  }
};
