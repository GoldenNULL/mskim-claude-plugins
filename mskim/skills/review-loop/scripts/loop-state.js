#!/usr/bin/env node
// Bookkeeping for /mskim:review-loop: snapshots, threshold counting, and stop decisions, so no model has to count.
// Usage:
//   node loop-state.js snapshot <repo> <loop-id> <round> [--exclude <repo-relative loop folder>]  working tree -> commit (user's index/worktree untouched),
//                                                           kept under refs/review-loop/<loop-id>/round-<round>; prints sha
//   node loop-state.js record <state.json> <round> <merged.json> [--snapshot <sha>]
//        [--major M] [--minor m] [--max-rounds n] [--count-p3] [--pre-existing]   (options are read on round 1, then fixed)
//   node loop-state.js --self-test
// merged.json is /mskim:review's: { findings:[{id, severity, verification, pre_existing, location, title}],
//   disputed:[{id}], previous:[{id: "prev-<id in last round>", status}] }.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const MAJOR = ['P0', 'P1'];

function snapshot(repo, loopId, round, exclude) {
  if (!/^[A-Za-z0-9._-]+$/.test(loopId)) throw new Error(`loop-id must match [A-Za-z0-9._-]+: ${loopId}`);
  const git = (args, env) => execFileSync('git', ['-C', repo, ...args], { env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'review-loop-'));
  const env = { GIT_INDEX_FILE: path.join(tmp, 'index') };
  try {
    let parent = null;
    try { parent = git(['rev-parse', '--verify', 'HEAD']); } catch { /* unborn branch */ }
    if (parent) git(['read-tree', parent], env);
    // respects .gitignore, like the review's untracked-file rule; the loop's own reports stay out of the reviewed tree
    git(['add', '-A', '--', '.', ...(exclude ? [`:(exclude)${exclude}`] : [])], env);
    if (exclude) git(['rm', '-r', '--cached', '-q', '--ignore-unmatch', '--', exclude], env);
    const tree = git(['write-tree'], env);
    const sha = git(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', `review-loop ${loopId} round ${round}`],
      { GIT_AUTHOR_NAME: 'review-loop', GIT_AUTHOR_EMAIL: 'review-loop@localhost', GIT_COMMITTER_NAME: 'review-loop', GIT_COMMITTER_EMAIL: 'review-loop@localhost' });
    git(['update-ref', `refs/review-loop/${loopId}/round-${round}`, sha]);
    return sha;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

const fileLine = (loc) => {
  const m = String(loc || '').match(/^(.*?):(\d+)(?:-\d+)?$/);
  return m ? { file: m[1], line: Number(m[2]) } : { file: String(loc || ''), line: null };
};

// Items of one round, keyed by their id in that round's report, so the next round's prev-<id> can be resolved.
function buildItems(merged, prevItems) {
  const items = {};
  for (const f of merged.findings || []) {
    items[f.id] = { kind: 'finding', severity: f.severity, verification: f.verification, pre_existing: !!f.pre_existing, location: f.location, title: f.title };
  }
  for (const d of merged.disputed || []) items[d.id] = { kind: 'disputed', location: d.location, title: d.claim };
  for (const p of merged.previous || []) {
    if (p.status === 'resolved') continue;
    const src = prevItems[p.id.replace(/^prev-/, '')];
    if (!src) { items[p.id] = { kind: 'unknown', status: p.status }; continue; }
    if (src.kind === 'disputed') { items[p.id] = { ...src }; continue; }
    if (p.status === 'unverified') { items[p.id] = { ...src, kind: 'unverified-previous' }; continue; }
    // shortcut: same file within 10 lines = the same issue re-reported (a partly fixed issue often comes back regraded,
    // so severity is not compared); upgrade to explicit ids from the final pass if this miscounts.
    const a = fileLine(src.location);
    const dup = (merged.findings || []).some((f) => {
      const b = fileLine(f.location);
      return a.file === b.file && (a.line === null || b.line === null || Math.abs(a.line - b.line) <= 10);
    });
    items[p.id] = { ...src, kind: dup ? 'duplicate-previous' : 'finding', status: p.status };
  }
  return items;
}

function count(items, opts) {
  const c = { major: 0, minor: 0, p0: 0, p3: 0, unverified: 0, pre_existing: 0, disputed: 0, unknown: 0 };
  const open = [];
  for (const [id, it] of Object.entries(items)) {
    if (it.kind === 'disputed') { c.disputed++; continue; }
    if (it.kind === 'unknown') { c.unknown++; continue; }
    if (it.kind === 'duplicate-previous') continue;
    if (it.kind === 'unverified-previous' || it.verification === 'unverified') { c.unverified++; continue; }
    if (it.pre_existing && !opts.preExisting) { c.pre_existing++; continue; }
    if (it.severity === 'P3' && !opts.countP3) { c.p3++; continue; }
    if (MAJOR.includes(it.severity)) c.major++; else c.minor++;
    if (it.severity === 'P0') c.p0++;
    open.push({ id, severity: it.severity, location: it.location, title: it.title });
  }
  return { counts: c, open };
}

const better = (a, b) => a.major < b.major || (a.major === b.major && a.minor < b.minor);

function decide(rounds, opts) {
  const cur = rounds[rounds.length - 1].counts;
  const r = rounds.length;
  if (cur.major <= opts.major && cur.minor <= opts.minor) return 'pass';
  if (r >= 2 && cur.p0 > rounds[r - 2].counts.p0) return 'worse';
  if (r >= 3 && !better(cur, rounds[r - 2].counts) && !better(rounds[r - 2].counts, rounds[r - 3].counts)) return 'stall';
  if (r >= opts.maxRounds) return 'max';
  return 'continue';
}

function record(state, round, merged, argOpts, snap) {
  if (!state.opts) state = { opts: argOpts, rounds: [] };
  if (round < 1 || round > state.rounds.length + 1) throw new Error(`round ${round} out of order (have ${state.rounds.length})`);
  state.rounds = state.rounds.slice(0, round - 1); // re-recording a round replaces it and everything after
  const prevItems = round > 1 ? state.rounds[round - 2].items : {};
  const items = buildItems(merged, prevItems);
  const { counts, open } = count(items, state.opts);
  state.rounds.push({ round, snapshot: snap || null, counts, items });
  const decision = decide(state.rounds, state.opts);
  const best = state.rounds.reduce((b, x) => (better(x.counts, b.counts) ? x : b));
  return { state, result: { round, decision, counts, threshold: { major: state.opts.major, minor: state.opts.minor }, best_round: best.round, best_snapshot: best.snapshot, open } };
}

function selfTest() {
  const assert = require('assert');
  const opts = { major: 0, minor: 1, maxRounds: 4, countP3: false, preExisting: false };
  const f = (id, severity, location, extra = {}) => ({ id, severity, verification: 'confirmed', location, title: id, ...extra });
  // round 1: P0, P1, P2, P3, an unverified P1, a pre-existing P1, one disputed
  let s = {};
  let out = record(s, 1, { findings: [f('F1', 'P0', 'a.js:10'), f('F2', 'P1', 'b.js:5'), f('F3', 'P2', 'c.js:1'), f('F4', 'P3', 'd.js:1'),
    f('F5', 'P1', 'e.js:1', { verification: 'unverified' }), f('F6', 'P1', 'g.js:1', { pre_existing: true })], disputed: [{ id: 'codex-3', claim: 'x' }] }, opts, 's1');
  s = out.state;
  assert.deepStrictEqual([out.result.counts.major, out.result.counts.minor, out.result.counts.p3, out.result.counts.unverified, out.result.counts.pre_existing, out.result.counts.disputed], [2, 1, 1, 1, 1, 1]);
  assert.strictEqual(out.result.decision, 'continue');
  // round 2: F1 resolved, F2 still present AND re-reported nearby (one issue), F3 still present, dispute still open, new P2
  out = record(s, 2, { findings: [f('F1', 'P1', 'b.js:8'), f('F2', 'P2', 'h.js:3')],
    previous: [{ id: 'prev-F1', status: 'resolved' }, { id: 'prev-F2', status: 'still present' }, { id: 'prev-F3', status: 'partially resolved' },
      { id: 'prev-F5', status: 'unverified' }, { id: 'prev-codex-3', status: 'still present' }] }, {}, 's2');
  s = out.state;
  assert.deepStrictEqual([out.result.counts.major, out.result.counts.minor, out.result.counts.p0, out.result.counts.disputed, out.result.counts.unverified], [1, 2, 0, 1, 1]);
  assert.strictEqual(out.result.decision, 'continue');
  // round 3: prev-prev-F3 chains back to round 1's F3; no progress twice in a row -> stall
  out = record(s, 3, { findings: [f('F1', 'P1', 'b.js:8')], previous: [{ id: 'prev-F1', status: 'still present' }, { id: 'prev-F2', status: 'still present' }, { id: 'prev-prev-F3', status: 'still present' }] }, {}, 's3');
  assert.deepStrictEqual([out.result.counts.major, out.result.counts.minor], [1, 2]);
  assert.strictEqual(out.result.decision, 'continue', 'one round without progress is not yet a stall');
  s = out.state;
  out = record(s, 4, { findings: [f('F1', 'P1', 'b.js:8'), f('F2', 'P2', 'h.js:3'), f('F3', 'P2', 'c.js:1')] }, {}, 's4');
  assert.strictEqual(out.result.decision, 'stall');
  assert.strictEqual(out.result.best_round, 2);
  // a new P0 after a round without one is 'worse'; reaching the threshold is 'pass' even on the last round
  out = record(s, 4, { findings: [f('F1', 'P0', 'z.js:1')] }, {}, 's4');
  assert.strictEqual(out.result.decision, 'worse');
  out = record(s, 4, { findings: [f('F1', 'P2', 'z.js:1')] }, {}, 's4');
  assert.strictEqual(out.result.decision, 'pass');
  assert.strictEqual(out.result.best_snapshot, 's4');
  out = record(s, 4, { findings: [f('F1', 'P2', 'q.js:1'), f('F2', 'P2', 'r.js:1')] }, {}, 's4');
  assert.strictEqual(out.result.decision, 'max', 'improved but still over the threshold on the last round');
  // --count-p3 and --pre-existing move those into the threshold
  out = record({}, 1, { findings: [f('F1', 'P3', 'a.js:1'), f('F2', 'P1', 'b.js:1', { pre_existing: true })] }, { ...opts, countP3: true, preExisting: true });
  assert.deepStrictEqual([out.result.counts.major, out.result.counts.minor], [1, 1]);
  assert.throws(() => record(s, 9, { findings: [] }, {}), /out of order/);
  // a partly fixed P0 that comes back regraded as a P1 a line away is one issue, counted once at its new severity
  let t = record({}, 1, { findings: [f('F1', 'P0', 'srv.js:6')] }, opts).state;
  out = record(t, 2, { findings: [f('F1', 'P1', 'srv.js:5')], previous: [{ id: 'prev-F1', status: 'partially resolved' }] }, {});
  assert.deepStrictEqual([out.result.counts.major, out.result.counts.p0], [1, 0]);
  // snapshot captures untracked files without touching the user's index
  const repo = fs.mkdtempSync(path.join(require('os').tmpdir(), 'loop-repo-'));
  const g = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  g('init', '-q'); fs.writeFileSync(path.join(repo, 'a.txt'), '1'); fs.writeFileSync(path.join(repo, '.gitignore'), 'ign\n');
  g('add', '.'); g('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base');
  fs.writeFileSync(path.join(repo, 'a.txt'), '2'); fs.writeFileSync(path.join(repo, 'new.txt'), 'n'); fs.writeFileSync(path.join(repo, 'ign'), 'x');
  fs.mkdirSync(path.join(repo, 'analysis', 'loop'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'analysis', 'loop', 'round-1-review.md'), 'r');
  const sha = snapshot(repo, 'demo', 1, 'analysis/loop');
  assert.throws(() => g('show', `${sha}:analysis/loop/round-1-review.md`), 'the loop folder stays out');
  assert.strictEqual(g('show', `${sha}:a.txt`).trim(), '2');
  assert.strictEqual(g('show', `${sha}:new.txt`).trim(), 'n');
  assert.throws(() => g('show', `${sha}:ign`), 'ignored files stay out');
  assert.deepStrictEqual(g('status', '--porcelain').split(/\r?\n/).filter(Boolean), [' M a.txt', '?? analysis/', '?? new.txt'], 'index untouched');
  assert.strictEqual(g('rev-parse', 'refs/review-loop/demo/round-1').trim(), sha);
  fs.rmSync(repo, { recursive: true, force: true });
  console.log('self-test ok');
}

const [cmd, ...args] = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const nonNeg = (name, dflt) => {
  const v = opt(name); if (v === undefined) return dflt;
  if (!/^\d+$/.test(v)) { console.error(`${name} must be a non-negative integer`); process.exit(2); }
  return Number(v);
};
if (cmd === '--self-test') selfTest();
else if (cmd === 'snapshot' && args.length >= 3) console.log(snapshot(args[0], args[1], args[2], opt('--exclude')));
else if (cmd === 'record' && args.length >= 3) {
  const [statePath, round, mergedPath] = args;
  const argOpts = { major: nonNeg('--major', 0), minor: nonNeg('--minor', 2), maxRounds: nonNeg('--max-rounds', 3),
    countP3: args.includes('--count-p3'), preExisting: args.includes('--pre-existing') };
  const state = fs.existsSync(statePath) ? readJson(statePath) : {};
  const { state: next, result } = record(state, Number(round), readJson(mergedPath), argOpts, opt('--snapshot'));
  fs.writeFileSync(statePath, JSON.stringify(next, null, 2));
  console.log(JSON.stringify(result, null, 2));
} else { console.error('usage: node loop-state.js snapshot <repo> <loop-id> <round> | record <state.json> <round> <merged.json> [--snapshot sha] [--major M] [--minor m] [--max-rounds n] [--count-p3] [--pre-existing] | --self-test'); process.exit(2); }
