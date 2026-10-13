#!/usr/bin/env node
// Static sanity checks for a game project. Run before handing work back.
//
//   node skills/web-game-forge/scripts/check.mjs <game-dir>
//
// Checks:
//   1. index.html exists and every local <script>/<link> target exists
//   2. every relative `import ... from './x.js'` resolves to a real file
//   3. every .js file parses (node --check)
//   4. no leftover {{PLACEHOLDER}} template tokens

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const dir = path.resolve(process.argv[2] || '.');
const problems = [];
const fail = (msg) => problems.push(msg);

function walk(d, out = []) {
  for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
    const p = path.join(d, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const indexFile = path.join(dir, 'index.html');
if (!fs.existsSync(indexFile)) {
  fail('index.html is missing');
} else {
  const html = fs.readFileSync(indexFile, 'utf8');
  const refs = [...html.matchAll(/(?:src|href)=["'](?!https?:|data:|#)([^"']+)["']/g)].map((m) => m[1]);
  for (const r of refs) {
    if (!fs.existsSync(path.join(dir, r))) fail(`index.html references missing file: ${r}`);
  }
  if (!/<canvas[^>]*id=["']game["']/.test(html)) fail('index.html has no <canvas id="game">');
}

const files = walk(dir);
const jsFiles = files.filter((f) => f.endsWith('.js'));

for (const f of jsFiles) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(dir, f);
  for (const m of src.matchAll(/(?:import|export)\s[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const target = path.resolve(path.dirname(f), m[1]);
    if (!fs.existsSync(target)) fail(`${rel}: import "${m[1]}" does not resolve`);
  }
  const syntax = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (syntax.status !== 0) fail(`${rel}: syntax error\n${syntax.stderr.trim()}`);
}

for (const f of files.filter((f) => /\.(html|js|json|md)$/.test(f))) {
  if (/\{\{[A-Z_]+\}\}/.test(fs.readFileSync(f, 'utf8'))) {
    fail(`${path.relative(dir, f)}: unreplaced {{TOKEN}} placeholder`);
  }
}

if (problems.length) {
  console.error(`FAIL (${problems.length} problem${problems.length === 1 ? '' : 's'}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`OK: ${jsFiles.length} JS files, index.html and imports check out`);
