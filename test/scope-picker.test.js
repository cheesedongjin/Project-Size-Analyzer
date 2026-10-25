import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { analyze } from '../shared/analyzer.js';
import { filterFiles } from '../shared/scope.js';
import { makeIgnore, parsePatterns } from '../shared/ignore.js';

// Exercise the actual event handlers with a minimal DOM adapter.
const app = fs.readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const handlers = app.slice(app.indexOf('function renderScopePicker('), app.indexOf('function scoreParts('));
function setup(mode = 'local') {
  const files = ['src/main.py', '.verify-perf/main.py', 'nested/.claude/main.py', '.claude/main.py'].map((path) => ({ path, content: 'value = 1', size: 9 }));
  const report = analyze(files);
  const state = { report, busy: false, scopeSelection: new Set(), lastAnalysis: { mode, options: { ignore: ['node_modules'], history: false, useGitignore: true, maxFileMB: 3 }, payload: { path: '/project', url: 'owner/repo', branch: 'dev' }, upload: { allFiles: files } } };
  const element = (extra = {}) => ({ disabled: false, events: {}, addEventListener(name, fn) { this.events[name] = fn; }, ...extra });
  const nodes = new Map();
  const $ = (s) => { if (!nodes.has(s)) nodes.set(s, element()); return nodes.get(s); };
  const inputs = report.scope.candidates.map((g, i) => element({ dataset: { scopeIndex: String(i) }, checked: false }));
  const $$ = (s) => s === 'input, button' ? [...inputs, $('[data-scope-all]'), $('[data-scope-clear]'), $('#scope-reanalyze')] : inputs;
  let runs = 0;
  const context = vm.createContext({ state, $, $$, fmt: { num: String, bytes: String }, esc: String, setMode(mode) { state.mode = mode; }, start() { runs++; } });
  vm.runInContext(handlers, context);
  context.bindScopePicker({}, report);
  return { context, state, files, $, inputs, runs: () => runs };
}

test('picker preserves target/options and adds only selected folder paths', () => {
  for (const mode of ['local', 'github', 'upload']) {
    const h = setup(mode);
    assert.equal(h.$('#scope-reanalyze').disabled, true);
    const i = h.state.report.scope.candidates.findIndex((g) => g.path === '.claude');
    h.inputs[i].checked = true;
    h.inputs[i].events.change();
    h.$('#scope-reanalyze').events.click();
    assert.equal(h.runs(), 1);
    assert.equal(h.state.mode, mode);
    assert.equal(h.$('#opt-history').checked, false);
    assert.equal(h.$('#opt-maxsize').value, 3);
    const patterns = parsePatterns(h.$('#opt-ignore').value);
    assert.deepEqual(patterns, ['node_modules', '.claude/**']);
    const next = analyze(filterFiles(h.files, makeIgnore(patterns)));
    assert.equal(next.summary.files, 3);
    assert.ok(next.files.some((f) => f.path === 'nested/.claude/main.py'));
    assert.ok(!next.scope.candidates.some((g) => g.path === '.claude'));
    if (mode === 'github') assert.equal(h.$('#gh-branch').value, 'dev');
    if (mode === 'local') assert.equal(h.$('#local-path').value, '/project');
    if (mode === 'upload') assert.equal(h.state.upload, h.state.lastAnalysis.upload);
  }
});

test('select all, clear, busy guard and retry preserve the selection', () => {
  const h = setup();
  h.$('[data-scope-all]').events.click();
  assert.equal(h.state.scopeSelection.size, 3);
  assert.ok(h.inputs.every((i) => i.checked));
  h.state.busy = true;
  h.context.updateScopeControls();
  assert.ok(h.inputs.every((i) => i.disabled));
  h.$('#scope-reanalyze').events.click();
  assert.equal(h.runs(), 0);
  h.state.busy = false;
  h.context.updateScopeControls();
  assert.equal(h.$('#scope-reanalyze').disabled, false);
  assert.equal(h.state.scopeSelection.size, 3);
  h.$('[data-scope-clear]').events.click();
  assert.equal(h.state.scopeSelection.size, 0);
  assert.equal(h.$('#scope-reanalyze').disabled, true);
});
