#!/usr/bin/env node
// Bookkeeping for /mskim:review: nothing a reviewer reported may disappear between raw output and the final report.
// Usage:
//   node check-ledger.js split <workdir> [--max 20]   raw/*.json -> batches/<n>.json (grouped by file)
//   node check-ledger.js join  <workdir>              merged/*.json -> merged.json (sorted, renumbered F1..)
//   node check-ledger.js check <workdir> [--report <file>] | [--batch <n>]   (--batch: batches/<n>.json vs merged/<n>.json only)
//   node check-ledger.js --self-test
// Workdir layout: raw/<source>.json (+ raw/<source>.txt when transcribed), previous.json (re-review only),
// merged.json = { findings:[{id, sources:[raw ids], severity, ...}], rejected:[{id, reason}],
//                 disputed:[{id, claim, counter}], previous:[{id, status, evidence}] }
const fs = require('fs');
const path = require('path');

const SEVERITY = ['P0', 'P1', 'P2', 'P3'];
const PREV_STATUS = ['resolved', 'still present', 'partially resolved'];
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const fileOf = (f) => String(f.location || '').replace(/:\d+(-\d+)?$/, '') || '(no location)';

function loadRaws(dir) {
  const rawDir = path.join(dir, 'raw');
  return fs.readdirSync(rawDir).filter((f) => f.endsWith('.json')).sort().map((f) => {
    const txt = path.join(rawDir, f.replace(/\.json$/, '.txt'));
    return { file: f, data: readJson(path.join(rawDir, f)), txt: fs.existsSync(txt) ? fs.readFileSync(txt, 'utf8') : null };
  });
}

function check(raws, merged, previous, report) {
  const problems = [];
  const rawIds = new Map();
  for (const { file, data, txt } of raws) {
    for (const f of data.findings || []) {
      if (!f.id) { problems.push(`${file}: finding without id: ${f.title || JSON.stringify(f).slice(0, 80)}`); continue; }
      if (rawIds.has(f.id)) problems.push(`duplicate raw id ${f.id} in ${file} and ${rawIds.get(f.id)}`);
      else rawIds.set(f.id, file);
      // Transcribed findings must quote text that really is in the vendor's original output.
      if (data.transcribed) {
        if (txt === null) problems.push(`${file} is marked transcribed but has no matching .txt`);
        else if (!f.excerpt) problems.push(`transcribed ${f.id} has no excerpt`);
        else if (!norm(txt).includes(norm(f.excerpt))) problems.push(`transcribed ${f.id}: excerpt not found in original output`);
      }
    }
  }
  const seen = new Map();
  const account = (id, where) => {
    if (!rawIds.has(id)) problems.push(`${where} references unknown raw id ${id}`);
    else if (seen.has(id)) problems.push(`raw id ${id} accounted twice: ${seen.get(id)} and ${where}`);
    else seen.set(id, where);
  };
  const finalIds = new Set();
  for (const f of merged.findings || []) {
    if (finalIds.has(f.id)) problems.push(`duplicate merged id ${f.id}`);
    finalIds.add(f.id);
    if (!Array.isArray(f.sources) || f.sources.length === 0) problems.push(`merged finding ${f.id} has no sources`);
    else f.sources.forEach((id) => account(id, `finding ${f.id}`));
  }
  for (const r of merged.rejected || []) {
    if (!r.reason) problems.push(`rejected ${r.id} has no reason`);
    account(r.id, 'rejected');
  }
  for (const d of merged.disputed || []) {
    if (!d.claim || !d.counter) problems.push(`disputed ${d.id} needs both claim and counter`);
    account(d.id, 'disputed');
  }
  for (const id of rawIds.keys()) if (!seen.has(id)) problems.push(`raw id ${id} is missing from merged.json`);

  const prevIds = (previous && previous.findings || []).map((f) => f.id);
  const prevSeen = new Set();
  for (const p of merged.previous || []) {
    if (!prevIds.includes(p.id)) problems.push(`previous status for unknown id ${p.id}`);
    else if (prevSeen.has(p.id)) problems.push(`previous id ${p.id} has two statuses`);
    if (!PREV_STATUS.includes(p.status)) problems.push(`previous ${p.id}: status must be one of ${PREV_STATUS.join(' | ')}`);
    if (!p.evidence) problems.push(`previous ${p.id} has no evidence`);
    prevSeen.add(p.id);
  }
  for (const id of prevIds) if (!prevSeen.has(id)) problems.push(`previous finding ${id} has no status`);

  if (report !== undefined) {
    const mentioned = (id) => new RegExp(`(^|[^\\w-])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\w-])`).test(report);
    for (const id of [...finalIds, ...rawIds.keys(), ...prevIds]) if (!mentioned(id)) problems.push(`report does not mention ${id}`);
  }
  return { total: rawIds.size, merged: finalIds.size, problems };
}

function split(dir, max) {
  const groups = new Map();
  for (const { data } of loadRaws(dir)) {
    for (const f of data.findings || []) {
      const k = fileOf(f);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(f);
    }
  }
  // Whole files stay together so same-location duplicates land in one batch; a file larger than max is its own batch.
  const batches = [];
  let cur = [];
  for (const g of [...groups.values()].sort((a, b) => b.length - a.length)) {
    if (cur.length && cur.length + g.length > max) { batches.push(cur); cur = []; }
    cur = cur.concat(g);
  }
  if (cur.length) batches.push(cur);
  const out = path.join(dir, 'batches');
  fs.mkdirSync(out, { recursive: true });
  fs.mkdirSync(path.join(dir, 'merged'), { recursive: true });
  batches.forEach((b, i) => fs.writeFileSync(path.join(out, `${i + 1}.json`), JSON.stringify({ batch: i + 1, findings: b }, null, 2)));
  return batches.map((b) => b.length);
}

function join(dir) {
  const mdir = path.join(dir, 'merged');
  const parts = fs.readdirSync(mdir).filter((f) => f.endsWith('.json')).sort().map((f) => readJson(path.join(mdir, f)));
  const all = { findings: [], rejected: [], disputed: [], previous: [] };
  for (const p of parts) for (const k of Object.keys(all)) all[k].push(...(p[k] || []));
  const rank = (s) => (SEVERITY.indexOf(s) + 1 || 9);
  all.findings.sort((a, b) => rank(a.severity) - rank(b.severity));
  all.findings.forEach((f, i) => { f.id = `F${i + 1}`; });
  fs.writeFileSync(path.join(dir, 'merged.json'), JSON.stringify(all, null, 2));
  return { parts: parts.length, findings: all.findings.length };
}

function selfTest() {
  const assert = require('assert');
  const raws = [
    { file: 'a.json', data: { findings: [{ id: 'a-1' }, { id: 'a-2' }] }, txt: null },
    { file: 'b.json', data: { findings: [{ id: 'b-1' }] }, txt: null },
  ];
  const ok = { findings: [{ id: 'F1', sources: ['a-1', 'b-1'] }], rejected: [{ id: 'a-2', reason: 'x' }] };
  const run = (m, prev, rep) => check(raws, m, prev, rep).problems.join('\n');
  assert.strictEqual(run(ok), '');
  assert.match(run({ findings: [{ id: 'F1', sources: ['a-1'] }] }), /a-2 is missing[\s\S]*b-1 is missing/);
  assert.match(run({ findings: [{ id: 'F1', sources: ['a-1', 'a-1', 'a-2', 'b-1'] }] }), /a-1 accounted twice/);
  assert.match(run({ findings: [{ id: 'F1', sources: ['a-1', 'a-2', 'b-1', 'zz'] }] }), /unknown raw id zz/);
  assert.match(run({ findings: [{ id: 'F1', sources: ['a-1', 'a-2'] }], rejected: [{ id: 'b-1' }] }), /no reason/);
  // disputed is a third bucket
  assert.strictEqual(run({ findings: [{ id: 'F1', sources: ['a-1'] }], rejected: [{ id: 'a-2', reason: 'x' }], disputed: [{ id: 'b-1', claim: 'c', counter: 'd' }] }), '');
  assert.match(run({ findings: [{ id: 'F1', sources: ['a-1', 'a-2'] }], disputed: [{ id: 'b-1', claim: 'c' }] }), /needs both/);
  // transcription excerpts must exist in the original text
  const tr = [{ file: 't.json', data: { transcribed: true, findings: [{ id: 't-1', excerpt: 'off  by\none' }, { id: 't-2', excerpt: 'made up' }] }, txt: 'there is an off by one here' }];
  assert.match(check(tr, { findings: [{ id: 'F1', sources: ['t-1', 't-2'] }] }).problems.join(), /t-2: excerpt not found/);
  assert.doesNotMatch(check(tr, { findings: [{ id: 'F1', sources: ['t-1', 't-2'] }] }).problems.join(), /t-1/);
  // previous findings each need exactly one valid status
  const prev = { findings: [{ id: 'prev-F1' }, { id: 'prev-F2' }] };
  assert.match(run({ ...ok, previous: [{ id: 'prev-F1', status: 'resolved', evidence: 'e' }] }, prev), /prev-F2 has no status/);
  assert.match(run({ ...ok, previous: [{ id: 'prev-F1', status: 'fixed', evidence: 'e' }, { id: 'prev-F2', status: 'resolved', evidence: 'e' }] }, prev), /status must be/);
  // report must mention every id; F1 does not count as F10
  assert.strictEqual(run(ok, null, '| F1 | a-1 b-1 | a-2 기각 |'), '');
  assert.match(run(ok, null, '| F10 | a-1 b-1 a-2 |'), /does not mention F1/);
  // split keeps files together and respects max; join renumbers by severity
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ledger-'));
  fs.mkdirSync(path.join(tmp, 'raw'));
  const mk = (src, n, file) => Array.from({ length: n }, (_, i) => ({ id: `${src}-${file}-${i}`, location: `${file}.js:${i + 1}` }));
  fs.writeFileSync(path.join(tmp, 'raw', 'x.json'), JSON.stringify({ findings: [...mk('x', 3, 'a'), ...mk('x', 2, 'b')] }));
  fs.writeFileSync(path.join(tmp, 'raw', 'y.json'), JSON.stringify({ findings: [...mk('y', 2, 'a'), ...mk('y', 2, 'c')] }));
  assert.deepStrictEqual(split(tmp, 5), [5, 4]);
  const b1 = readJson(path.join(tmp, 'batches', '1.json')).findings.map(fileOf);
  assert.ok(b1.every((f) => f === 'a.js'), 'all a.js findings in batch 1');
  fs.writeFileSync(path.join(tmp, 'merged', '1.json'), JSON.stringify({ findings: [{ id: 'B1-F1', severity: 'P2', sources: ['x'] }] }));
  fs.writeFileSync(path.join(tmp, 'merged', '2.json'), JSON.stringify({ findings: [{ id: 'B2-F1', severity: 'P0', sources: ['y'] }], rejected: [{ id: 'z', reason: 'r' }] }));
  join(tmp);
  const j = readJson(path.join(tmp, 'merged.json'));
  assert.deepStrictEqual(j.findings.map((f) => [f.id, f.severity]), [['F1', 'P0'], ['F2', 'P2']]);
  assert.strictEqual(j.rejected.length, 1);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('self-test ok');
}

const [cmd, dir, ...rest] = process.argv.slice(2);
const opt = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
if (cmd === '--self-test') selfTest();
else if (cmd === 'split' && dir) {
  const sizes = split(dir, Number(opt('--max') || 20));
  console.log(`SPLIT: ${sizes.length} batch(es), sizes ${sizes.join(', ') || '0'} -> ${path.join(dir, 'batches')}`);
} else if (cmd === 'join' && dir) {
  const r = join(dir);
  console.log(`JOIN: ${r.parts} part(s) -> merged.json with ${r.findings} finding(s)`);
} else if (cmd === 'check' && dir) {
  const batch = opt('--batch');
  const prevPath = path.join(dir, 'previous.json');
  const reportPath = opt('--report');
  // A batch validator checks only its own slice; previous findings belong to the final pass.
  const raws = batch ? [{ file: `batches/${batch}.json`, data: readJson(path.join(dir, 'batches', `${batch}.json`)), txt: null }] : loadRaws(dir);
  const mergedPath = batch ? path.join(dir, 'merged', `${batch}.json`) : path.join(dir, 'merged.json');
  const { total, merged, problems } = check(raws, readJson(mergedPath),
    !batch && fs.existsSync(prevPath) ? readJson(prevPath) : null, reportPath ? fs.readFileSync(reportPath, 'utf8') : undefined);
  if (problems.length) { console.log(`LEDGER FAIL (${total} raw findings)\n` + problems.join('\n')); process.exit(1); }
  console.log(`LEDGER OK: all ${total} raw findings accounted for exactly once -> ${merged} merged${reportPath ? '; report mentions every id' : ''}`);
} else { console.error('usage: node check-ledger.js split|join|check <workdir> [--max N] [--report <file>] [--batch N] | --self-test'); process.exit(2); }
