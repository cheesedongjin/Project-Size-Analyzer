import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../shared/analyzer.js';
import { assessScope, filterFiles } from '../shared/scope.js';
import { makeIgnore } from '../shared/ignore.js';
import { generateInsights } from '../shared/insights.js';

const file = (path, content = 'value = 1\n') => ({ path, content, size: Buffer.byteLength(content) });

test('scope warnings preserve files and identify verification copies and runtime folders', () => {
  const files = [file('src/main.py'), file('.verify-perf/before/main.py'), file('.pimpi/session.json', '{}'), file('.claude/worktrees/demo/main.py'), file('.github/workflows/test.yml', 'name: test')];
  const r = analyze(files);
  assert.equal(r.summary.files, 5);
  assert.equal(r.scope.files, 3);
  assert.equal(r.scope.ratio, 0.6);
  assert.equal(r.warnings.length, 1);
  assert.ok(generateInsights(r).items.some((i) => i.area === '분석 범위'));
  assert.equal(assessScope([]).ratio, 0);
});

test('latest exclusions can be added and removed without losing selected files', () => {
  const original = [file('src/main.py'), file('.verify-perf/main.py'), file('.pimpi/data.json')];
  assert.equal(filterFiles(original, makeIgnore(['.verify-*', '.pimpi'])).length, 1);
  assert.equal(filterFiles(original, makeIgnore([])).length, 3);
});

test('compact JSON and long Python lines are not classified as minified code', () => {
  const r = analyze([file('data.json', JSON.stringify({ data: 'x'.repeat(4000) })), file('main.py', `value = "${'x'.repeat(4000)}"`), file('app.min.js', 'let x=1;')]);
  assert.equal(r.files[0].cat, 'data');
  assert.equal(r.files[1].cat, 'source');
  assert.equal(r.files[2].cat, 'generated');
  assert.equal(r.summary.generatedFiles, 1);
});
