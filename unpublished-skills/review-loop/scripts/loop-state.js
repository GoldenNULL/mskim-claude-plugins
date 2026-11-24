#!/usr/bin/env node
// Bookkeeping for /mskim:review-loop: snapshots, threshold counting, and stop decisions, so no model has to count.
// Usage:
//   node loop-state.js snapshot <repo> <loop-id> <round> [--exclude <repo-relative folder or glob>]  working tree -> commit (user's index/worktree untouched),
//                                                           kept under refs/review-loop/<loop-id>/round-<round>; prints sha
//   node loop-state.js record <state.json> <round> <merged.json> [--snapshot <sha>] [--blocked <id,id | none>]
//        [--major M] [--minor m] [--max-rounds n] [--count-p3] [--pre-existing]   (options are read on round 1, then fixed)
//   node loop-state.js grades <state.json>   each prev-<id> of the next re-review -> its issue's current {severity, pre_existing, aggravated_by_change}
//   node loop-state.js --self-test
// merged.json is /mskim:review's: { findings:[{id, severity, verification, pre_existing, aggravated_by_change?, kind?, location, same_as?}],
//   disputed:[{id, claim, same_as?}], previous:[{id: "prev-<id in last round>", status, severity?, pre_existing?, aggravated_by_change?}] }; a status row's own
//   severity / pre_existing / aggravated_by_change is the final pass's regrade of what remains (it also establishes a carried dispute); a re-review must give a status for every item of the last round.
// Every item carries an `issue` key, "<round>:<id>" of the report row where the issue first appeared. Carried previous rows keep it, and
//   same_as (set by the re-review's final pass on a current finding that re-reports previous items: "prev-F2" or ["prev-F2", "prev-F5"])
//   gives the current finding that key and merges the keys it names. Items with one key are one issue, counted once. Each round stores
//   per issue its latest evidenced severity and whether it is blocked, and the next round carries both. --blocked: last round's fix-list
//   ids resolve left undone. Only ids, severity, and location are stored or printed: the reports hold the (masked) text.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const MAJOR = ['P0', 'P1'];
const COUNTED = ['confirmed', 'traced'];

function snapshot(repo, loopId, round, exclude) {
  if (!/^[A-Za-z0-9._-]+$/.test(loopId)) throw new Error(`loop-id must match [A-Za-z0-9._-]+: ${loopId}`);
  const run = (args, env, input) => execFileSync('git', ['-C', repo, '-c', `core.hooksPath=${noHooks}`, '-c', 'core.fsmonitor=false', '-c', 'core.splitIndex=false', ...args], { env: { ...process.env, GIT_LITERAL_PATHSPECS: '0', GIT_GLOB_PATHSPECS: '0', GIT_NOGLOB_PATHSPECS: '0', GIT_ICASE_PATHSPECS: '0', ...env }, encoding: 'utf8', input, maxBuffer: 1 << 30, stdio: ['pipe', 'pipe', 'pipe'] });
  const git = (args, env) => run(args, env).trim();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'review-loop-'));
  const noHooks = path.join(tmp, 'no-hooks'); // bookkeeping must not run the repository's hooks
  fs.mkdirSync(noHooks);
  const env = { GIT_INDEX_FILE: path.join(tmp, 'index') };
  try {
    repo = git(['rev-parse', '--show-toplevel']); // a subfolder would stage only itself
    let parent = null;
    try { parent = git(['rev-parse', '--verify', 'HEAD']); } catch { /* unborn branch */ }
    // start from a copy of the user's index, so staged additions (also force-added ignored files) and staged deletions count as they do in `git diff HEAD`
    const index = path.resolve(repo, git(['rev-parse', '--git-path', 'index']));
    if (fs.existsSync(index)) fs.copyFileSync(index, env.GIT_INDEX_FILE);
    else if (parent) git(['read-tree', parent], env);
    // the copy also carries assume-unchanged and skip-worktree flags, which hide edits from `add -A`; skip-worktree stays on files
    // absent from disk (sparse checkout), which would otherwise look deleted
    const entries = run(['ls-files', '-v', '-z'], env).split('\0').filter(Boolean);
    const assumed = entries.filter((e) => /^[a-z] /.test(e)).map((e) => e.slice(2));
    const skipped = entries.filter((e) => /^[sS] /.test(e)).map((e) => e.slice(2)).filter((f) => fs.existsSync(path.join(repo, f)));
    if (assumed.length) run(['update-index', '--no-assume-unchanged', '-z', '--stdin'], env, assumed.join('\0'));
    if (skipped.length) run(['update-index', '--no-skip-worktree', '-z', '--stdin'], env, skipped.join('\0'));
    // respects .gitignore for untracked files, like the review's untracked-file rule; the loop's own reports stay out of the reviewed tree
    git(['add', '-A', '--', '.', ...(exclude ? [`:(exclude,glob,icase)${exclude}`] : [])], env);
    // excluded paths keep their HEAD version (a committed earlier loop folder must not look deleted); new or edited loop files drop out
    if (exclude && parent) git(['reset', '-q', parent, '--', `:(glob,icase)${exclude}`], env);
    else if (exclude) git(['rm', '-r', '--cached', '-f', '-q', '--ignore-unmatch', '--', `:(glob,icase)${exclude}`], env); // -f: only the temporary index is touched
    const tree = git(['write-tree'], env);
    const sha = git(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', `review-loop ${loopId} round ${round}`],
      { GIT_AUTHOR_NAME: 'review-loop', GIT_AUTHOR_EMAIL: 'review-loop@localhost', GIT_COMMITTER_NAME: 'review-loop', GIT_COMMITTER_EMAIL: 'review-loop@localhost' });
    git(['update-ref', `refs/review-loop/${loopId}/round-${round}`, sha]);
    return sha;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// Items of one round, keyed by their id in that round's report, so the next round's prev-<id> can be resolved.
function buildItems(merged, prevItems, prevIssues, round, newlyBlocked) {
  const statuses = {};
  const regrades = {};
  for (const p of merged.previous || []) {
    // an id the last round does not know, or a missing one, means merged.json and state.json are from different loops or rounds: never count around it
    if (!prevItems[p.id.replace(/^prev-/, '')]) throw new Error(`previous ${p.id} matches no item of the last recorded round`);
    if (statuses[p.id]) throw new Error(`previous ${p.id} has two statuses`);
    if (!['resolved', 'still present', 'partially resolved', 'unverified'].includes(p.status)) throw new Error(`previous ${p.id}: unknown status ${p.status}`);
    if (p.pre_existing !== undefined && typeof p.pre_existing !== 'boolean') throw new Error(`previous ${p.id}: pre_existing must be true or false, got ${JSON.stringify(p.pre_existing)}`);
    if (p.severity !== undefined && (typeof p.severity !== 'string' || !/^P[0-3]$/.test(p.severity))) throw new Error(`previous ${p.id}: severity must be P0-P3, got ${p.severity}`);
    checkAggravated(p, `previous ${p.id}`);
    if (p.aggravated_by_change !== undefined && p.pre_existing === undefined) throw new Error(`previous ${p.id}: a regrade with aggravated_by_change must also state pre_existing`);
    statuses[p.id] = p.status;
    if (p.severity !== undefined || p.pre_existing !== undefined) regrades[p.id] = p;
  }
  for (const id of Object.keys(prevItems)) {
    if (!statuses[`prev-${id}`]) throw new Error(`prev-${id} has no status: merged.json is not the re-review of the last recorded round`);
  }
  const items = {};
  const merge = {}; // issue key -> the key it was merged into this round
  const canon = (k) => { while (merge[k]) k = merge[k]; return k; };
  for (const f of merged.findings || []) {
    if (typeof f.severity !== 'string' || !/^P[0-3]$/.test(f.severity)) throw new Error(`${f.id}: severity must be P0-P3, got ${f.severity}`);
    if (f.pre_existing !== undefined && typeof f.pre_existing !== 'boolean') throw new Error(`${f.id}: pre_existing must be true or false, got ${JSON.stringify(f.pre_existing)}`);
    if (f.verification !== undefined && ![...COUNTED, 'unverified'].includes(f.verification)) throw new Error(`${f.id}: verification must be confirmed, traced or unverified, got ${JSON.stringify(f.verification)}`);
    checkAggravated(f, f.id);
    if (f.kind !== undefined && !['defect', 'policy_change'].includes(f.kind)) throw new Error(`${f.id}: kind must be defect or policy_change, got ${JSON.stringify(f.kind)}`);
    let issue = `${round}:${f.id}`;
    const links = [].concat(f.same_as || []);
    for (const l of links) if (!statuses[l]) throw new Error(`${f.id}.same_as ${l} is not in this round's previous statuses`);
    if (links.length) {
      issue = canon(prevItems[links[0].replace(/^prev-/, '')].issue);
      for (const l of links.slice(1)) { const k = canon(prevItems[l.replace(/^prev-/, '')].issue); if (k !== issue) merge[k] = issue; }
    }
    // a pre-existing defect the change aggravated counts as the change's own; a policy change waits on the user's rule
    items[f.id] = { kind: 'finding', current: true, assessed: true, graded: true, issue, severity: f.severity, verification: f.verification, ...baseline(f), location: f.location, ...(f.kind === 'policy_change' ? { policy: true } : {}) };
  }
  for (const d of merged.disputed || []) {
    if (/^prev-/.test(d.id)) throw new Error(`disputed id ${d.id}: source names must not start with prev- (it marks carried rows)`);
  }
  for (const d of merged.disputed || []) {
    let issue = `${round}:${d.id}`;
    const links = [].concat(d.same_as || []);
    for (const l of links) if (!statuses[l]) throw new Error(`${d.id}.same_as ${l} is not in this round's previous statuses`);
    if (links.length) {
      issue = canon(prevItems[links[0].replace(/^prev-/, '')].issue);
      for (const l of links.slice(1)) { const k = canon(prevItems[l.replace(/^prev-/, '')].issue); if (k !== issue) merge[k] = issue; }
    }
    items[d.id] = { kind: 'disputed', current: true, issue, location: d.location };
  }
  for (const [id, status] of Object.entries(statuses)) {
    if (status === 'resolved') continue;
    const src = prevItems[id.replace(/^prev-/, '')];
    const last = prevIssues[src.issue] || {};
    // carry the issue's latest evidenced severity (not this row's original one) and its blocker
    const it = { ...src, current: false, assessed: false, graded: false, status, ...(last.severity ? { severity: last.severity } : {}), ...(last.pre_existing !== undefined ? { pre_existing: last.pre_existing, aggravated: !!last.aggravated } : {}), ...(!src.location && last.location ? { location: last.location } : {}) };
    const rg = regrades[id];
    const loc = (merged.previous || []).find((x) => x.id === id).location;
    if (loc && status !== 'unverified') it.location = loc; // where the remaining failure is now, graded or not
    // a dispute is established only by a regrade that grades it
    if (rg && status !== 'unverified' && src.kind === 'disputed' && !rg.severity && !last.severity) throw new Error(`previous ${id}: establishing a dispute needs a severity`);
    if (rg && status !== 'unverified' && src.kind === 'disputed' && rg.pre_existing === undefined && last.pre_existing === undefined) throw new Error(`previous ${id}: establishing a dispute needs pre_existing (true or false)`);
    if (rg && status !== 'unverified') Object.assign(it, { kind: 'finding', current: true, assessed: rg.pre_existing !== undefined, graded: !!rg.severity, verification: 'traced', ...(rg.severity ? { severity: rg.severity } : {}), ...(rg.pre_existing !== undefined ? baseline(rg) : {}), ...(rg.location ? { location: rg.location } : {}) });
    // still present / partially resolved is the validator's current, evidenced judgment: it settles an earlier `unverified`
    if (it.kind !== 'disputed') Object.assign(it, status === 'unverified' ? { kind: 'unverified-previous' } : { kind: 'finding', verification: 'traced' });
    items[id] = it;
  }
  // the grade each canonical issue had last round; merged keys reconcile to the strictest, independent of row order
  const inherited = {};
  for (const [k, g] of Object.entries(prevIssues)) {
    if (!g.severity) continue;
    const c = canon(k); const h = inherited[c];
    inherited[c] = !h ? { severity: g.severity, pre_existing: !!g.pre_existing, aggravated: !!g.aggravated }
      : { severity: sevOrder(g) < sevOrder(h) ? g.severity : h.severity, pre_existing: h.pre_existing && !!g.pre_existing, aggravated: (h.aggravated || !!g.aggravated) && !(h.pre_existing && g.pre_existing) };
  }
  const policyKeys = Object.values(items).filter((it) => it.policy).map((it) => it.issue);
  const blockedKeys = new Set([...Object.keys(prevIssues).filter((k) => prevIssues[k].blocked), ...newlyBlocked, ...policyKeys].map(canon));
  for (const it of Object.values(items)) { it.issue = canon(it.issue); if (blockedKeys.has(it.issue)) it.blocked = true; }
  return { items, inherited };
}

const sevOrder = (it) => ['P0', 'P1', 'P2', 'P3'].indexOf(it.severity);
// aggravated_by_change: a pre-existing defect the change made worse; with pre_existing: false it is a contradiction, not a new defect
function checkAggravated(f, where) {
  if (f.aggravated_by_change === undefined) return;
  if (typeof f.aggravated_by_change !== 'boolean') throw new Error(`${where}: aggravated_by_change must be true or false, got ${JSON.stringify(f.aggravated_by_change)}`);
  if (f.aggravated_by_change && f.pre_existing === false) throw new Error(`${where}: aggravated_by_change needs pre_existing: true`);
}
// an item's pre_existing means "present at the loop base and not counted in change-only"; an aggravated one is present but counted
const baseline = (f) => ({ pre_existing: !!f.pre_existing && !f.aggravated_by_change, aggravated: !!f.pre_existing && !!f.aggravated_by_change });

// One issue may have several rows (a current finding linked by same_as, carried aliases prev-F1 / prev-prev-F1): count it once.
function count(items, opts, inherited = {}) {
  const c = { major: 0, minor: 0, p0: 0, p3: 0, unverified: 0, pre_existing: 0, aggravated: 0, disputed: 0, blocked: 0, policy: 0 };
  const groups = {};
  for (const [id, it] of Object.entries(items)) (groups[it.issue] = groups[it.issue] || []).push({ id, ...it });
  const open = [];
  const issues = {};
  for (const [issue, rows] of Object.entries(groups)) {
    const blocked = rows.some((r) => r.blocked);
    issues[issue] = { blocked };
    const real = rows.filter((r) => r.kind !== 'disputed');
    if (!real.length) { if (inherited[issue]) Object.assign(issues[issue], inherited[issue]); c.disputed++; continue; }
    // grade from evidenced rows only, preferring this round's: an unverified re-report neither hides nor inflates an evidenced issue
    const evidenced = real.filter((r) => r.kind === 'finding' && COUNTED.includes(r.verification));
    if (!evidenced.length) {
      // keep the grade an earlier round established, so a round that cannot re-verify the issue does not reset it
      if (inherited[issue]) Object.assign(issues[issue], inherited[issue]);
      c.unverified++; continue;
    }
    // severity from this round's gradings (a current finding, or a regrade that states a severity), else from all evidenced rows
    const graded = evidenced.filter((r) => r.current && r.graded);
    const pool = graded.length ? graded : evidenced;
    const lead = pool.reduce((a, b) => (sevOrder(b) < sevOrder(a) ? b : a));
    // a baseline check made this round (a current finding, or a regrade that states pre_existing) wins over carried ones
    const assessed = evidenced.filter((r) => r.current && r.assessed);
    const base = assessed.length ? assessed : evidenced;
    const pre = base.every((r) => r.pre_existing);
    // aggravated: every baseline check puts it at the loop base, and at least one of this round's says the change made it worse
    const aggravated = !pre && base.every((r) => r.pre_existing || r.aggravated);
    Object.assign(issues[issue], { severity: lead.severity, pre_existing: pre, aggravated, location: lead.location || (rows.find((r) => r.location) || {}).location });
    if (pre && !opts.preExisting) { c.pre_existing++; continue; }
    if (lead.severity === 'P3' && !opts.countP3) { c.p3++; continue; }
    if (MAJOR.includes(lead.severity)) c.major++; else c.minor++;
    if (lead.severity === 'P0') c.p0++;
    if (blocked) c.blocked++;
    if (aggravated) c.aggravated++;
    const policy = rows.some((r) => r.policy);
    if (policy) c.policy++;
    open.push({ id: lead.id, issue, aliases: rows.map((r) => r.id).filter((x) => x !== lead.id), severity: lead.severity, location: lead.location || (rows.find((r) => r.location) || {}).location, blocked, ...(policy ? { policy } : {}), ...(aggravated ? { aggravated } : {}) });
  }
  return { counts: c, open, issues };
}

const better = (a, b) => a.major < b.major || (a.major === b.major && a.minor < b.minor);
const passes = (c, opts) => c.major <= opts.major && c.minor <= opts.minor;
// rollback ranking: a passing round first, then fewer P0, then fewer major, then fewer minor
const rank = (c, opts) => [passes(c, opts) ? 0 : 1, c.p0, c.major, c.minor];
const ahead = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };

function decide(rounds, opts, fixList) {
  const cur = rounds[rounds.length - 1].counts;
  const r = rounds.length;
  if (passes(cur, opts)) return 'pass';
  if (r >= 2 && cur.p0 > rounds[r - 2].counts.p0) return 'worse';
  if (r >= 3 && !better(cur, rounds[r - 2].counts) && !better(rounds[r - 2].counts, rounds[r - 3].counts)) return 'stall';
  if (r >= opts.maxRounds) return 'max';
  if (fixList.length === 0) return 'blocked'; // over the threshold, but every counted issue waits on the user
  return 'continue';
}

function record(state, round, merged, argOpts, snap, blocked = []) {
  if (!state.opts) state = { opts: argOpts, rounds: [] };
  if (!Number.isSafeInteger(round) || round < 1 || round > state.rounds.length + 1) throw new Error(`round ${round} out of order (have ${state.rounds.length})`);
  state.rounds = state.rounds.slice(0, round - 1); // re-recording a round replaces it and everything after
  const prevItems = round > 1 ? state.rounds[round - 2].items : {};
  const prevIssues = round > 1 ? state.rounds[round - 2].issues || {} : {};
  const newlyBlocked = blocked.map((id) => {
    if (!prevItems[id]) throw new Error(`--blocked ${id} is not an item of round ${round - 1}`);
    return prevItems[id].issue;
  });
  const { items, inherited } = buildItems(merged, prevItems, prevIssues, round, newlyBlocked); // marks this round's copies only, so a re-record can undo it
  const { counts, open, issues } = count(items, state.opts, inherited);
  const fixList = open.filter((o) => !o.blocked).map((o) => o.id);
  state.rounds.push({ round, snapshot: snap || null, counts, issues, items });
  const decision = decide(state.rounds, state.opts, fixList);
  Object.assign(state.rounds[round - 1], { decision, fix_list: fixList });
  // a later round on the same snapshot (the confirmation round) supersedes the earlier verdict on it
  const candidates = state.rounds.filter((x, i) => !x.snapshot || !state.rounds.slice(i + 1).some((y) => y.snapshot === x.snapshot));
  const best = candidates.reduce((b, x) => (ahead(rank(b.counts, state.opts), rank(x.counts, state.opts)) ? b : x)); // a tie goes to the later round: no rollback for no gain
  const result = { round, decision, counts, threshold: { major: state.opts.major, minor: state.opts.minor },
    best_round: best.round, best_snapshot: best.snapshot, fix_list: fixList, open };
  state.rounds[round - 1].result = result; // text-free, so a resume can read what this command printed
  return { state, result };
}

// what the final pass needs to know of each previous id: the grade its issue has now, not the one its report row was filed with
function grades(state) {
  const last = state.rounds[state.rounds.length - 1];
  const out = {};
  for (const [id, it] of Object.entries(last.items)) { const g = last.issues[it.issue] || {}; const agg = g.severity ? !!g.aggravated : !!it.aggravated;
    out[`prev-${id}`] = { severity: g.severity || it.severity, pre_existing: (g.severity ? !!g.pre_existing : !!it.pre_existing) || agg, aggravated_by_change: agg }; }
  return out;
}

function selfTest() {
  const assert = require('assert');
  const opts = { major: 0, minor: 1, maxRounds: 4, countP3: false, preExisting: false };
  const f = (id, severity, location, extra = {}) => ({ id, severity, verification: 'confirmed', location, title: id, ...extra });
  const nums = (r, keys) => keys.map((k) => r.counts[k]);
  const ids = (st, status = 'resolved', over = {}) => Object.keys(st.rounds[st.rounds.length - 1].items).map((id) => ({ id: `prev-${id}`, status: over[`prev-${id}`] || status }));
  // round 1: P0, P1, P2, P3, an unverified P1, a pre-existing P1, a P1 with no verification, one disputed
  let s = {};
  let out = record(s, 1, { findings: [f('F1', 'P0', 'a.js:10'), f('F2', 'P1', 'b.js:5'), f('F3', 'P2', 'c.js:1'), f('F4', 'P3', 'd.js:1'),
    f('F5', 'P1', 'e.js:1', { verification: 'unverified' }), f('F6', 'P1', 'g.js:1', { pre_existing: true }), f('F7', 'P1', 'k.js:1', { verification: undefined })],
  disputed: [{ id: 'codex-3', claim: 'x' }] }, opts, 's1');
  s = out.state;
  assert.deepStrictEqual(nums(out.result, ['major', 'minor', 'p3', 'unverified', 'pre_existing', 'disputed']), [2, 1, 1, 2, 1, 1]);
  assert.strictEqual(out.result.decision, 'continue');
  // round 2: F1 resolved; F2 re-reported a few lines away and linked (one issue); F3 partly fixed; F5 now shown present
  // (counts, though it was unverified); a new P2 right next to F3 that is a different issue (no link: both count)
  out = record(s, 2, { findings: [f('F1', 'P1', 'b.js:8', { same_as: 'prev-F2' }), f('F2', 'P2', 'c.js:3')],
    previous: ids(s, 'still present', { 'prev-F1': 'resolved', 'prev-F3': 'partially resolved', 'prev-F7': 'unverified' }) }, {}, 's2');
  s = out.state;
  assert.deepStrictEqual(nums(out.result, ['major', 'minor', 'p0', 'disputed', 'unverified']), [2, 2, 0, 1, 1]);
  assert.deepStrictEqual(out.result.fix_list.sort(), ['F1', 'F2', 'prev-F3', 'prev-F5']);
  assert.strictEqual(out.result.decision, 'continue');
  // round 3, as review §0 builds previous.json: round 2's Findings (prev-F1, prev-F2) and its unresolved previous rows (prev-prev-*).
  // prev-F1 and prev-prev-F2 are one issue; a new finding linked to the older alias joins it (still one); prev-F5 is blocked.
  out = record(s, 3, { findings: [f('F1', 'P1', 'b.js:9', { same_as: 'prev-prev-F2', verification: 'unverified' })],
    previous: ids(s, 'still present', { 'prev-F2': 'resolved', 'prev-prev-F7': 'unverified' }) }, {}, 's3', ['prev-F5']);
  assert.deepStrictEqual(nums(out.result, ['major', 'minor', 'blocked', 'unverified']), [2, 1, 1, 1]);
  assert.deepStrictEqual(out.result.fix_list.sort(), ['prev-F1', 'prev-prev-F3'], 'an unverified re-report still counts: its aliases are evidenced, and lead');
  assert.strictEqual(out.result.decision, 'continue', 'improved over round 2');
  s = out.state;
  // round 4 (the last): best is the lowest round by P0, major, minor
  const p4 = ids(s);
  out = record(s, 4, { findings: [f('F1', 'P1', 'b.js:8'), f('F2', 'P1', 'h.js:3'), f('F3', 'P2', 'c.js:1')], previous: p4 }, {}, 's4');
  assert.deepStrictEqual([out.result.decision, out.result.best_round], ['max', 4], 'round 4 ties round 3: the later round is kept');
  out = record(s, 4, { findings: [f('F1', 'P0', 'z.js:1')], previous: p4 }, {}, 's4');
  assert.deepStrictEqual([out.result.decision, out.result.best_round], ['worse', 3], 'a round that brought a P0 back is never the best');
  out = record(s, 4, { findings: [f('F1', 'P2', 'z.js:1')], previous: p4 }, {}, 's4');
  assert.deepStrictEqual([out.result.decision, out.result.best_snapshot], ['pass', 's4']);
  // a chained alias stays one issue with its row: if the newer row is resolved but the older is still present, it still counts
  let t = record({}, 1, { findings: [f('F1', 'P1', 'a.js:1')] }, { ...opts, maxRounds: 5 }).state;
  t = record(t, 2, { findings: [f('F1', 'P1', 'a.js:2', { same_as: 'prev-F1' })], previous: ids(t, 'still present') }, {}).state;
  out = record(t, 3, { findings: [], previous: ids(t, 'still present', { 'prev-F1': 'resolved' }) }, {});
  assert.deepStrictEqual([out.result.counts.major, out.result.open[0].id], [1, 'prev-prev-F1']);
  // an evidenced regrade sticks: old aliases carry the issue's latest severity, not their own P0
  t = record({}, 1, { findings: [f('F1', 'P0', 'a.js:1')] }, { ...opts, maxRounds: 5 }).state;
  t = record(t, 2, { findings: [f('F1', 'P1', 'a.js:2', { same_as: 'prev-F1' })], previous: ids(t, 'partially resolved') }, {}).state;
  out = record(t, 3, { findings: [], previous: ids(t, 'still present') }, {});
  assert.deepStrictEqual([out.result.decision, out.result.counts.p0, out.result.counts.major], ['stall', 0, 1], 'not worse: the P0 does not come back');
  // an unverified P3 re-report linked to an evidenced P1 does not grade it
  t = record({}, 1, { findings: [f('F1', 'P1', 'a.js:1')] }, { ...opts, maxRounds: 5 }).state;
  out = record(t, 2, { findings: [f('F1', 'P3', 'a.js:2', { same_as: 'prev-F1', verification: 'unverified' })], previous: ids(t, 'still present') }, {});
  assert.deepStrictEqual([out.result.counts.major, out.result.counts.disputed], [1, 0]);
  // two keys found to be one failure are merged by a multi-id link; a blocker stays with its issue after its blocked rows resolve
  t = record({}, 1, { findings: [f('F1', 'P1', 'a.js:1'), f('F2', 'P1', 'b.js:1'), f('F3', 'P2', 'c.js:1')] }, { ...opts, maxRounds: 6 }).state;
  t = record(t, 2, { findings: [], previous: ids(t, 'still present') }, {}, null, ['F1']).state;
  t = record(t, 3, { findings: [f('F1', 'P1', 'a.js:5', { same_as: ['prev-prev-F1', 'prev-prev-F2'] })],
    previous: ids(t, 'still present', { 'prev-prev-F1': 'resolved', 'prev-prev-F2': 'resolved' }) }, {}).state;
  out = record(t, 4, { findings: [], previous: ids(t, 'still present', { 'prev-prev-prev-F3': 'resolved' }) }, {});
  assert.deepStrictEqual([out.result.counts.major, out.result.counts.blocked, out.result.fix_list], [1, 1, []]);
  // a blocker given in the same round that merges its key survives, whatever the link order
  t = record({}, 1, { findings: [f('F1', 'P1', 'a.js:1'), f('F2', 'P1', 'b.js:1')] }, { ...opts, maxRounds: 5 }).state;
  out = record(t, 2, { findings: [f('F1', 'P1', 'a.js:2', { same_as: ['prev-F1', 'prev-F2'] })], previous: ids(t, 'still present') }, {}, null, ['F2']);
  assert.deepStrictEqual([out.result.decision, out.result.counts.blocked], ['blocked', 1]);
  // a round that cannot re-verify an issue keeps its established grade and classification
  t = record({}, 1, { findings: [f('F1', 'P0', 'a.js:1', { pre_existing: true })] }, { ...opts, maxRounds: 6 }).state;
  t = record(t, 2, { findings: [f('F1', 'P1', 'a.js:2', { same_as: 'prev-F1' })], previous: ids(t, 'still present') }, {}).state;
  t = record(t, 3, { findings: [], previous: ids(t, 'unverified') }, {}).state;
  out = record(t, 4, { findings: [], previous: ids(t, 'still present') }, {});
  assert.deepStrictEqual([out.result.counts.p0, out.result.counts.major, out.result.counts.pre_existing], [0, 1, 0]);
  assert.throws(() => record({}, 1, { findings: [f('F1', 'p1', 'a.js:1')] }, opts), /severity/);
  assert.throws(() => record({}, 1, { findings: [f('F1', ['P1'], 'a.js:1')] }, opts), /severity/);
  // a status row that only moves the location updates where the open entry points
  t = record({}, 1, { findings: [f('F1', 'P1', 'old.js:11')] }, opts).state;
  out = record(t, 2, { findings: [], previous: [{ id: 'prev-F1', status: 'partially resolved', location: 'new.js:27' }] }, {});
  assert.strictEqual(out.result.open[0].location, 'new.js:27');
  assert.throws(() => record({}, 1, { findings: [f('F1', 'P1', 'a.js:1', { pre_existing: 'false' })] }, opts), /true or false/);
  assert.throws(() => record({}, 1, { findings: [f('F1', 'P1', 'a.js:1', { verification: 'Confirmed' })] }, opts), /verification/);
  // an unevidenced merge of a P1 and a P3 keeps the P1, whatever the order of the statuses
  for (const order of [['prev-F1', 'prev-F2'], ['prev-F2', 'prev-F1']]) {
    t = record({}, 1, { findings: [f('F1', 'P1', 'a.js:1'), f('F2', 'P3', 'b.js:1')] }, { ...opts, maxRounds: 6 }).state;
    t = record(t, 2, { findings: [f('F1', 'P2', 'a.js:2', { same_as: ['prev-F1', 'prev-F2'], verification: 'unverified' })],
      previous: order.map((id) => ({ id, status: 'unverified' })) }, {}).state;
    out = record(t, 3, { findings: [], previous: ids(t, 'still present') }, {});
    assert.deepStrictEqual([out.result.counts.major, out.result.open[0].severity], [1, 'P1'], order.join());
  }
  // a carried dispute counts only once a regrade establishes it; a plain 'still present' leaves it a dispute
  t = record({}, 1, { findings: [], disputed: [{ id: 'codex-1', claim: 'x' }] }, { ...opts, maxRounds: 6 }).state;
  t = record(t, 2, { findings: [f('F1', 'P1', 'a.js:1', { same_as: 'prev-codex-1', verification: 'unverified' })], previous: ids(t, 'still present') }, {}).state;
  const p3 = [{ id: 'prev-F1', status: 'unverified' }, { id: 'prev-prev-codex-1', status: 'still present' }];
  out = record(t, 3, { findings: [], previous: p3 }, {});
  assert.strictEqual(out.result.counts.major, 0);
  out = record(out.state, 3, { findings: [], previous: [p3[0], { ...p3[1], severity: 'P1', pre_existing: false }] }, {});
  assert.deepStrictEqual([out.result.counts.major, out.result.open[0].severity], [1, 'P1']);
  assert.throws(() => record(out.state, 3, { findings: [], previous: [p3[0], { ...p3[1], pre_existing: false }] }, {}), /needs a severity/);
  // a dispute links with a list as findings do
  t = record({}, 1, { findings: [], disputed: [{ id: 'codex-1', claim: 'x' }] }, { ...opts, maxRounds: 6 }).state;
  out = record(t, 2, { findings: [], disputed: [{ id: 'codex-2', claim: 'x', same_as: ['prev-codex-1'] }], previous: ids(t, 'unverified') }, {});
  assert.strictEqual(out.result.counts.disputed, 1);
  // a fresh evidenced baseline check (pre_existing) overrides the carried classification
  t = record({}, 1, { findings: [f('F1', 'P1', 'a.js:1')] }, { ...opts, maxRounds: 6 }).state;
  out = record(t, 2, { findings: [f('F1', 'P1', 'a.js:2', { same_as: 'prev-F1', pre_existing: true })], previous: ids(t, 'still present') }, {});
  assert.deepStrictEqual([out.result.counts.major, out.result.counts.pre_existing], [0, 1]);
  assert.deepStrictEqual(grades(out.state)['prev-F1'], { severity: 'P1', pre_existing: true, aggravated_by_change: false }, 'grades gives the issue grade under the next round id');
  assert.throws(() => record(t, 2, { findings: [], previous: ids(t, 'unknown') }, {}), /unknown status/);
  assert.throws(() => record(t, 2, { findings: [], previous: ids(t, 'still present').map((x) => ({ ...x, pre_existing: 'false' })) }, {}), /true or false/);
  // a pre_existing-only regrade does not override this round's severity downgrade
  t = record({}, 1, { findings: [f('F1', 'P1', 'a.js:1'), f('F2', 'P1', 'b.js:1')] }, { ...opts, minor: 1, maxRounds: 6 }).state;
  out = record(t, 2, { findings: [f('F1', 'P2', 'a.js:2', { same_as: ['prev-F1', 'prev-F2'] })],
    previous: [{ id: 'prev-F1', status: 'partially resolved' }, { id: 'prev-F2', status: 'still present', pre_existing: false }] }, {});
  assert.deepStrictEqual([out.result.counts.major, out.result.counts.minor], [0, 1]);
  // a severity-only regrade does not carry a baseline check: an evidenced, introduced alias keeps the issue counted
  t = record({}, 1, { findings: [f('F1', 'P1', 'a.js:1'), f('F2', 'P0', 'b.js:1', { pre_existing: true })] }, { ...opts, maxRounds: 6 }).state;
  out = record(t, 2, { findings: [], disputed: [{ id: 'codex-1', claim: 'x', same_as: ['prev-F1', 'prev-F2'] }],
    previous: [{ id: 'prev-F1', status: 'still present' }, { id: 'prev-F2', status: 'partially resolved', severity: 'P1' }] }, {});
  assert.deepStrictEqual([out.result.counts.major, out.result.counts.pre_existing], [1, 0]);
  // the final pass regrades what remains of a partly fixed P1 on its status row, and establishes a dispute the same way
  t = record({}, 1, { findings: [f('F1', 'P1', 'a.js:1')], disputed: [{ id: 'codex-1', claim: 'x', location: 'b.js:1' }] }, { ...opts, maxRounds: 6 }).state;
  out = record(t, 2, { findings: [], previous: [{ id: 'prev-F1', status: 'partially resolved', severity: 'P2' }, { id: 'prev-codex-1', status: 'still present', severity: 'P1', pre_existing: false }] }, {});
  assert.deepStrictEqual([out.result.counts.major, out.result.counts.minor, out.result.counts.disputed], [1, 1, 0]);
  // a dispute raised again and linked is one dispute
  t = record({}, 1, { findings: [], disputed: [{ id: 'codex-1', claim: 'x' }] }, { ...opts, maxRounds: 6 }).state;
  out = record(t, 2, { findings: [], disputed: [{ id: 'codex-2', claim: 'x', same_as: 'prev-codex-1' }], previous: ids(t, 'unverified') }, {});
  assert.strictEqual(out.result.counts.disputed, 1);
  assert.throws(() => record({}, 1, { findings: [], disputed: [{ id: 'prev-codex-1', claim: 'x' }] }, opts), /prev-/);
  // no progress over two consecutive rounds -> stall
  t = record({}, 1, { findings: [f('F1', 'P1', 'a.js:1')] }, { ...opts, maxRounds: 5 }).state;
  t = record(t, 2, { findings: [f('F1', 'P1', 'b.js:1')], previous: ids(t) }, {}).state;
  out = record(t, 3, { findings: [f('F1', 'P1', 'c.js:1')], previous: ids(t) }, {});
  assert.strictEqual(out.result.decision, 'stall');
  // every counted issue blocked -> 'blocked'; re-recording without the flag undoes it
  t = record({}, 1, { findings: [f('F1', 'P1', 'a.js:1')] }, { ...opts, maxRounds: 5 }).state;
  const p2 = ids(t, 'still present');
  out = record(t, 2, { findings: [], previous: p2 }, {}, null, ['F1']);
  assert.deepStrictEqual([out.result.decision, out.result.counts.major], ['blocked', 1]);
  out = record(out.state, 2, { findings: [], previous: p2 }, {});
  assert.strictEqual(out.result.decision, 'continue');
  // a passing round outranks a lower-major round that misses the threshold; a confirmation on the same snapshot supersedes it
  t = record({}, 1, { findings: [f('F1', 'P2', 'a.js:1')] }, { ...opts, major: 1, minor: 0 }, 'x1').state;
  out = record(t, 2, { findings: [f('F1', 'P1', 'a.js:1')], previous: ids(t) }, {}, 'x2');
  assert.deepStrictEqual([out.result.decision, out.result.best_round], ['pass', 2]);
  out = record(out.state, 3, { findings: [f('F1', 'P1', 'a.js:1'), f('F2', 'P0', 'b.js:1')], previous: ids(out.state) }, {}, 'x2');
  assert.strictEqual(out.result.best_round, 1);
  // --count-p3 and --pre-existing move those into the threshold
  out = record({}, 1, { findings: [f('F1', 'P3', 'a.js:1'), f('F2', 'P1', 'b.js:1', { pre_existing: true })] }, { ...opts, countP3: true, preExisting: true });
  assert.deepStrictEqual([out.result.counts.major, out.result.counts.minor], [1, 1]);
  // an aggravated pre-existing defect counts in change-only; a plain pre-existing one does not; aggravated without pre_existing is rejected
  out = record({}, 1, { findings: [f('F1', 'P1', 'a.js:1', { pre_existing: true, aggravated_by_change: true }), f('F2', 'P1', 'b.js:1', { pre_existing: true })] }, opts);
  assert.deepStrictEqual([out.result.counts.major, out.result.counts.pre_existing, out.result.counts.aggravated, out.result.fix_list, out.result.open[0].aggravated], [1, 1, 1, ['F1'], true]);
  assert.deepStrictEqual(grades(out.state)['prev-F1'], { severity: 'P1', pre_existing: true, aggravated_by_change: true });
  assert.throws(() => record({}, 1, { findings: [f('F1', 'P1', 'a.js:1', { pre_existing: false, aggravated_by_change: true })] }, opts), /needs pre_existing/);
  assert.throws(() => record({}, 1, { findings: [f('F1', 'P1', 'a.js:1', { pre_existing: true, aggravated_by_change: 'yes' })] }, opts), /aggravated_by_change/);
  // one issue: any of this round's evidenced assessments saying aggravated makes it aggravated; it stays so when carried, and a regrade can clear it
  t = record({}, 1, { findings: [f('F1', 'P1', 'a.js:1', { pre_existing: true })] }, { ...opts, maxRounds: 6 }).state;
  out = record(t, 2, { findings: [f('F1', 'P1', 'a.js:2', { same_as: 'prev-F1', pre_existing: true, aggravated_by_change: true })], previous: ids(t, 'still present') }, {});
  assert.deepStrictEqual([out.result.counts.major, out.result.counts.aggravated, out.result.counts.pre_existing], [1, 1, 0]);
  t = out.state;
  const sp = ids(t, 'still present'); // record re-uses the state object, so take round 2's ids once
  out = record(t, 3, { findings: [], previous: sp }, {});
  assert.deepStrictEqual([out.result.counts.major, out.result.counts.aggravated], [1, 1], 'carried without a regrade');
  out = record(t, 3, { findings: [], previous: sp.map((x) => ({ ...x, pre_existing: true, aggravated_by_change: false })) }, {});
  assert.deepStrictEqual([out.result.counts.major, out.result.counts.pre_existing], [0, 1], 'a regrade that finds no aggravation returns it to pre-existing');
  assert.throws(() => record(t, 3, { findings: [], previous: sp.map((x) => ({ ...x, aggravated_by_change: true })) }, {}), /must also state pre_existing/);
  // --pre-existing counts aggravated items as before, and still marks them
  out = record({}, 1, { findings: [f('F1', 'P1', 'a.js:1', { pre_existing: true, aggravated_by_change: true })] }, { ...opts, preExisting: true });
  assert.deepStrictEqual([out.result.counts.major, out.result.counts.aggravated], [1, 1]);
  // a policy change counts but never reaches resolve, and stays blocked in later rounds; alone over the threshold it blocks the loop
  t = record({}, 1, { findings: [f('F1', 'P1', 'a.js:1', { kind: 'policy_change' }), f('F2', 'P2', 'b.js:1')] }, { ...opts, minor: 0, maxRounds: 5 }).state;
  out = { result: t.rounds[0].result };
  assert.deepStrictEqual([out.result.counts.major, out.result.counts.policy, out.result.fix_list, out.result.open.find((o) => o.id === 'F1').policy], [1, 1, ['F2'], true]);
  out = record(t, 2, { findings: [], previous: ids(t, 'still present', { 'prev-F2': 'resolved' }) }, {});
  assert.deepStrictEqual([out.result.decision, out.result.counts.blocked, out.result.fix_list], ['blocked', 1, []]);
  assert.throws(() => record({}, 1, { findings: [f('F1', 'P1', 'a.js:1', { kind: 'policy' })] }, opts), /kind/);
  // inconsistent input fails instead of being counted around
  assert.throws(() => record(s, 9, { findings: [] }, {}), /out of order/);
  assert.throws(() => record(s, 4, { findings: [], previous: [...p4, { id: 'prev-F99', status: 'still present' }] }, {}), /matches no item/);
  assert.throws(() => record(s, 4, { findings: [] }, {}), /has no status/, 'a first-review merged.json given as a re-review');
  assert.throws(() => record(s, 4, { findings: [f('F1', 'P1', 'a.js:1', { same_as: 'prev-F9' })], previous: p4 }, {}), /same_as/);
  assert.throws(() => record(s, 4, { findings: [], previous: p4 }, {}, null, ['F42']), /--blocked/);
  // snapshot: untracked, force-added, and assume-unchanged edits in; ignored and loop files out; staged deletion stays deleted; user's index untouched
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-repo-'));
  const g = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const w = (p, v) => { fs.mkdirSync(path.dirname(path.join(repo, p)), { recursive: true }); fs.writeFileSync(path.join(repo, p), v); };
  g('init', '-q'); w('analysis/2025-12-31-review-loop-z/summary.md', 'kept'); w('a.txt', '1'); w('old.txt', 'o'); w('au.txt', 'base'); w('.gitignore', 'ign\nold.txt\nforced\n');
  g('add', '-f', '.'); g('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base');
  w('a.txt', '2'); w('new.txt', 'n'); w('ign', 'x'); w('forced', 'f'); g('add', '-f', 'forced');
  g('update-index', '--assume-unchanged', 'au.txt'); w('au.txt', 'fixed');
  g('update-index', '--skip-worktree', 'a.txt');
  g('rm', '-q', '--cached', 'old.txt'); // staged deletion; the ignored working copy stays behind
  w('analysis/2026-01-02-review-loop-b/round-1-review.md', 'r'); g('add', 'analysis/2026-01-02-review-loop-b/round-1-review.md'); w('analysis/2026-01-02-review-loop-b/round-1-review.md', 'r2'); // staged, then edited
  w('analysis/2026-01-01-review-loop-a/summary.md', 's'); // an earlier loop's untracked folder
  w('analysis/2025-12-31-review-loop-z/summary.md', 'edited'); // a committed earlier loop folder, edited since
  w('analysis/pr-review-loop-runner/index.js', 'n'); // not a loop folder
  const before = g('status', '--porcelain');
  const sha = snapshot(repo, 'demo', 1, '**/analysis/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-review-loop-*/**');
  const files = g('ls-tree', '-r', '--name-only', sha).split(/\r?\n/).filter(Boolean).sort();
  assert.deepStrictEqual(files, ['.gitignore', 'a.txt', 'analysis/2025-12-31-review-loop-z/summary.md', 'analysis/pr-review-loop-runner/index.js', 'au.txt', 'forced', 'new.txt']);
  assert.deepStrictEqual([g('show', `${sha}:a.txt`).trim(), g('show', `${sha}:au.txt`).trim(), g('show', `${sha}:analysis/2025-12-31-review-loop-z/summary.md`).trim()], ['2', 'fixed', 'kept']);
  assert.strictEqual(g('status', '--porcelain'), before, 'index untouched');
  assert.strictEqual(g('rev-parse', 'refs/review-loop/demo/round-1').trim(), sha);
  fs.rmSync(repo, { recursive: true, force: true });
  console.log('self-test ok');
}

const fail = (msg) => { console.error(msg); process.exit(2); };
const [cmd, ...args] = process.argv.slice(2);
const flags = args.slice(3); // options come after the three positionals, so a file named like a flag is never read as one
const opt = (name) => {
  const i = flags.indexOf(name); if (i < 0) return undefined;
  const v = flags[i + 1]; if (v === undefined || v.startsWith('--')) fail(`${name} needs a value`);
  return v;
};
const int = (name, dflt, min) => {
  const v = opt(name); if (v === undefined) return dflt;
  if (!/^\d+$/.test(v) || !Number.isSafeInteger(Number(v)) || Number(v) < min) fail(`${name} must be an integer >= ${min}`);
  return Number(v);
};
if (cmd === '--self-test') selfTest();
else if (cmd === 'grades' && args.length === 1) console.log(JSON.stringify(grades(readJson(args[0])), null, 2));
else if (cmd === 'snapshot' && args.length >= 3) {
  if (args.length !== 3 && !(args.length === 5 && args[3] === '--exclude')) fail('snapshot takes <repo> <loop-id> <round> [--exclude <folder or glob>]');
  console.log(snapshot(args[0], args[1], args[2], opt('--exclude')));
}
else if (cmd === 'record' && args.length >= 3) {
  const [statePath, round, mergedPath] = args;
  if (!/^[1-9]\d{0,5}$/.test(round)) fail('round must be a positive integer');
  const known = { '--snapshot': 1, '--blocked': 1, '--major': 1, '--minor': 1, '--max-rounds': 1, '--count-p3': 0, '--pre-existing': 0 };
  const seen = new Set();
  for (let i = 3; i < args.length; i += 1 + (known[args[i]] || 0)) { if (seen.has(args[i])) fail(`${args[i]} given twice`); seen.add(args[i]); }
  for (let i = 3; i < args.length; i += 1 + (known[args[i]] || 0)) if (!Object.prototype.hasOwnProperty.call(known, args[i])) fail(`unknown argument ${args[i]} (flags are spelled --count-p3, --pre-existing, ...)`);
  const argOpts = { major: int('--major', 0, 0), minor: int('--minor', 2, 0), maxRounds: int('--max-rounds', 3, 1),
    countP3: flags.includes('--count-p3'), preExisting: flags.includes('--pre-existing') };
  const blocked = (opt('--blocked') || '').split(',').map((x) => x.trim()).filter((x) => x && x !== 'none');
  const state = fs.existsSync(statePath) ? readJson(statePath) : {};
  const { state: next, result } = record(state, Number(round), readJson(mergedPath), argOpts, opt('--snapshot'), blocked);
  fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(next, null, 2));
  fs.renameSync(`${statePath}.tmp`, statePath); // an interrupted write never truncates the last good state
  console.log(JSON.stringify(result, null, 2));
} else fail('usage: node loop-state.js snapshot <repo> <loop-id> <round> [--exclude dir] | record <state.json> <round> <merged.json> [--snapshot sha] [--blocked id,id|none] [--major M] [--minor m] [--max-rounds n] [--count-p3] [--pre-existing] | --self-test');
