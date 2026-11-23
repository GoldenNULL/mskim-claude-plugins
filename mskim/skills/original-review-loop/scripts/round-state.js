#!/usr/bin/env node
// Bookkeeping for /mskim:original-review-loop: counts one built-in code-review round against the threshold and decides whether to stop,
// so no model has to count. Snapshots reuse ../../review-loop/scripts/loop-state.js.
// Usage:
//   node round-state.js record <state.json> <round> <findings.json> [--snapshot <sha>] [--important I] [--nits N] [--max-rounds n] [--pre-existing]
//        (options are read on round 1, then fixed; without --nits, nits are reported but not counted)
//   node round-state.js --self-test
// findings.json: { capped?: bool, findings: [{ id, severity: important|pre_existing|nit, verdict?: CONFIRMED|PLAUSIBLE, file, line?, blocked? }] }
//   `blocked` = the same failure as an item an earlier resolve left undone (the model matches it; code-review ids are not stable across runs).
const fs = require('fs');

const SEVERITIES = ['important', 'pre_existing', 'nit'];

function count(findings, opts) {
  const c = { important: 0, nits: 0, pre_existing: 0, plausible: 0, blocked: 0, uncounted_nits: 0 };
  const open = [];
  const ids = new Set();
  for (const f of findings) {
    if (!f.id || ids.has(f.id)) throw new Error(`finding id missing or repeated: ${f.id}`);
    ids.add(f.id);
    if (!SEVERITIES.includes(f.severity)) throw new Error(`${f.id}: severity must be ${SEVERITIES.join('|')}, got ${JSON.stringify(f.severity)}`);
    if (f.verdict !== undefined && f.verdict !== null && !['CONFIRMED', 'PLAUSIBLE'].includes(f.verdict)) throw new Error(`${f.id}: verdict must be CONFIRMED or PLAUSIBLE`);
    if (f.blocked !== undefined && typeof f.blocked !== 'boolean') throw new Error(`${f.id}: blocked must be true or false`);
    let bucket = null;
    if (f.severity === 'important' || (f.severity === 'pre_existing' && opts.preExisting)) bucket = 'important';
    else if (f.severity === 'nit' && opts.nits !== null) bucket = 'nits';
    if (f.severity === 'pre_existing' && !opts.preExisting) c.pre_existing++;
    if (f.severity === 'nit' && opts.nits === null) c.uncounted_nits++;
    if (!bucket) continue;
    c[bucket]++;
    if (f.verdict === 'PLAUSIBLE') c.plausible++;
    if (f.blocked) c.blocked++;
    open.push({ id: f.id, severity: f.severity, bucket, location: f.line ? `${f.file}:${f.line}` : f.file, blocked: !!f.blocked });
  }
  return { counts: c, open };
}

const passes = (c, o) => c.important <= o.important && (o.nits === null || c.nits <= o.nits);
const better = (a, b) => a.important < b.important || (a.important === b.important && a.nits < b.nits);
const rank = (c, o) => [passes(c, o) ? 0 : 1, c.important, c.nits];
const ahead = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };

function decide(rounds, o, fixList) {
  const r = rounds.length;
  const cur = rounds[r - 1].counts;
  if (passes(cur, o)) return 'pass';
  if (r >= 2 && cur.important > rounds[r - 2].counts.important) return 'worse';
  if (r >= 3 && !better(cur, rounds[r - 2].counts) && !better(rounds[r - 2].counts, rounds[r - 3].counts)) return 'stall';
  if (r >= o.maxRounds) return 'max';
  if (fixList.length === 0) return 'blocked'; // over the threshold, and every counted item waits on the user
  return 'continue';
}

function record(state, round, input, argOpts, snap) {
  if (!state.opts) state = { opts: argOpts, rounds: [] };
  if (!Number.isSafeInteger(round) || round < 1 || round > state.rounds.length + 1) throw new Error(`round ${round} out of order (have ${state.rounds.length})`);
  if (!Array.isArray(input.findings)) throw new Error('findings.json needs a findings array (empty when code-review found nothing)');
  state.rounds = state.rounds.slice(0, round - 1); // re-recording a round replaces it and everything after
  const { counts, open } = count(input.findings, state.opts);
  const fixList = open.filter((x) => !x.blocked).map((x) => x.id);
  state.rounds.push({ round, snapshot: snap || null, capped: !!input.capped, counts });
  const decision = decide(state.rounds, state.opts, fixList);
  const best = state.rounds.reduce((b, x) => (ahead(rank(b.counts, state.opts), rank(x.counts, state.opts)) ? b : x)); // tie -> later round
  const result = { round, decision, counts, capped: !!input.capped, threshold: { important: state.opts.important, nits: state.opts.nits },
    best_round: best.round, best_snapshot: best.snapshot, fix_list: fixList, open };
  Object.assign(state.rounds[round - 1], { decision, fix_list: fixList, result });
  return { state, result };
}

function selfTest() {
  const assert = require('assert');
  const o = { important: 0, nits: null, maxRounds: 4, preExisting: false };
  const f = (id, severity, extra = {}) => ({ id, severity, verdict: 'CONFIRMED', file: 'a.js', line: 1, ...extra });
  let out = record({}, 1, { findings: [f('F1', 'important'), f('F2', 'important', { verdict: 'PLAUSIBLE' }), f('F3', 'nit'), f('F4', 'pre_existing')] }, o, 's1');
  assert.deepStrictEqual([out.result.counts.important, out.result.counts.plausible, out.result.counts.uncounted_nits, out.result.counts.pre_existing, out.result.decision], [2, 1, 1, 1, 'continue']);
  let s = out.state;
  out = record(s, 2, { findings: [f('F1', 'important', { blocked: true }), f('F2', 'nit')] }, {}, 's2');
  assert.deepStrictEqual([out.result.counts.important, out.result.fix_list, out.result.decision], [1, [], 'blocked']);
  out = record(s, 2, { findings: [f('F1', 'important'), f('F2', 'important'), f('F3', 'important')] }, {}, 's2');
  assert.strictEqual(out.result.decision, 'worse');
  out = record(s, 2, { findings: [] }, {}, 's2');
  assert.deepStrictEqual([out.result.decision, out.result.best_snapshot], ['pass', 's2']);
  // stall: no improvement across two consecutive rounds; best is the earliest-lowest, tie goes to the later round
  let t = record({}, 1, { findings: [f('F1', 'important')] }, o, 'x1').state;
  t = record(t, 2, { findings: [f('F1', 'important')] }, {}, 'x2').state;
  out = record(t, 3, { findings: [f('F1', 'important')] }, {}, 'x3');
  assert.deepStrictEqual([out.result.decision, out.result.best_round], ['stall', 3]);
  // --nits and --pre-existing move those into the threshold
  out = record({}, 1, { findings: [f('F1', 'nit'), f('F2', 'nit'), f('F3', 'pre_existing')] }, { ...o, nits: 1, preExisting: true });
  assert.deepStrictEqual([out.result.counts.important, out.result.counts.nits, out.result.decision], [1, 2, 'continue']);
  out = record({}, 1, { findings: [f('F1', 'nit')] }, { ...o, nits: 1, maxRounds: 1 });
  assert.strictEqual(out.result.decision, 'pass');
  out = record({}, 1, { findings: [f('F1', 'important')] }, { ...o, maxRounds: 1 });
  assert.strictEqual(out.result.decision, 'max');
  assert.throws(() => record({}, 1, { findings: [f('F1', 'P1')] }, o), /severity/);
  assert.throws(() => record({}, 1, { findings: [f('F1', 'nit'), f('F1', 'nit')] }, o), /repeated/);
  assert.throws(() => record({}, 1, {}, o), /findings array/);
  assert.throws(() => record({}, 3, { findings: [] }, o), /out of order/);
  console.log('self-test ok');
}

const fail = (msg) => { console.error(msg); process.exit(2); };
const [cmd, ...args] = process.argv.slice(2);
if (cmd === '--self-test') selfTest();
else if (cmd === 'record' && args.length >= 3) {
  const [statePath, round, inputPath] = args;
  const flags = args.slice(3);
  const known = { '--snapshot': 1, '--important': 1, '--nits': 1, '--max-rounds': 1, '--pre-existing': 0 };
  for (let i = 0; i < flags.length; i += 1 + (known[flags[i]] || 0)) if (!(flags[i] in known)) fail(`unknown argument ${flags[i]}`);
  const opt = (n) => { const i = flags.indexOf(n); if (i < 0) return undefined; const v = flags[i + 1]; if (v === undefined || v.startsWith('--')) fail(`${n} needs a value`); return v; };
  const int = (n, d, min) => { const v = opt(n); if (v === undefined) return d; if (!/^\d+$/.test(v) || Number(v) < min) fail(`${n} must be an integer >= ${min}`); return Number(v); };
  if (!/^[1-9]\d{0,5}$/.test(round)) fail('round must be a positive integer');
  const argOpts = { important: int('--important', 0, 0), nits: int('--nits', null, 0), maxRounds: int('--max-rounds', 3, 1), preExisting: flags.includes('--pre-existing') };
  const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
  const { state: next, result } = record(state, Number(round), JSON.parse(fs.readFileSync(inputPath, 'utf8')), argOpts, opt('--snapshot'));
  fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(next, null, 2));
  fs.renameSync(`${statePath}.tmp`, statePath); // an interrupted write never truncates the last good state
  console.log(JSON.stringify(result, null, 2));
} else fail('usage: node round-state.js record <state.json> <round> <findings.json> [--snapshot sha] [--important I] [--nits N] [--max-rounds n] [--pre-existing] | --self-test');
