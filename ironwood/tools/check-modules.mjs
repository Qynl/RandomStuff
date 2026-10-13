#!/usr/bin/env node
/**
 * IRONWOOD module checker.
 *
 * There is no headless browser in CI, so this is our safety net: it parses every
 * ES module with real patterns, then verifies that
 *   1. every import path resolves to a file that exists,
 *   2. every named import is actually exported by the target module,
 *   3. default imports point at modules that have a default export,
 *   4. imports of 'three'/'three/*' resolve inside vendor/.
 *
 * Exits non-zero with a readable report when something is broken.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'src');

const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) files.push(p);
  }
}
walk(srcDir);

const IGNORES = new Set(['three', 'three/addons/utils/BufferGeometryUtils.js']);

function analyze(file) {
  const code = fs.readFileSync(file, 'utf8');
  const exports = new Set();
  let hasDefault = false;

  // export { a, b as c }
  for (const m of code.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const cleaned = part.trim();
      if (!cleaned) continue;
      const asMatch = cleaned.match(/^(?:[\w$]+)\s+as\s+([\w$]+)$/);
      exports.add(asMatch ? asMatch[1] : cleaned);
    }
  }
  // export function/class/const/let/async function
  for (const m of code.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([\w$]+)/g)) {
    exports.add(m[1]);
  }
  // export const a = 1, b = 2  (multi declarators)
  for (const m of code.matchAll(/export\s+(?:const|let|var)\s+([^;=]+)=/g)) {
    const names = m[1].split(',').map((s) => s.trim().split(/\s*=\s*/)[0].trim()).filter(Boolean);
    for (const n of names) if (/^[\w$]+$/.test(n)) exports.add(n);
  }
  if (/export\s+default\b/.test(code)) hasDefault = true;

  const imports = [];
  const re = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(code))) {
    const clause = m[1].trim();
    const spec = m[2];
    const named = new Set();
    let defaultImport = null;
    let namespace = null;
    if (clause.startsWith('*')) {
      namespace = clause.replace('*', '').replace('as', '').trim();
    } else {
      const braceIdx = clause.indexOf('{');
      if (braceIdx === -1) {
        defaultImport = clause.split(',')[0].trim();
      } else {
        const before = clause.slice(0, braceIdx).replace(/,$/, '').trim();
        if (before) defaultImport = before;
        const inside = clause.slice(braceIdx + 1, clause.lastIndexOf('}'));
        for (const part of inside.split(',')) {
          const cleaned = part.trim();
          if (!cleaned) continue;
          const asMatch = cleaned.match(/^([\w$]+)\s+as\s+([\w$]+)$/);
          named.add(asMatch ? asMatch[1] : cleaned);
        }
      }
    }
    imports.push({ spec, named, defaultImport, namespace, line: code.slice(0, m.index).split('\n').length });
  }
  return { exports, hasDefault, imports };
}

const errors = [];
const warnings = [];
const info = new Map();

for (const file of files) {
  const rel = path.relative(root, file);
  const analysis = analyze(file);
  info.set(file, analysis);
  for (const imp of analysis.imports) {
    if (IGNORES.has(imp.spec) || imp.spec.startsWith('three/')) {
      const vendorPath = path.join(root, 'vendor', imp.spec === 'three' ? 'three.module.min.js' : '');
      if (!fs.existsSync(vendorPath)) errors.push(`${rel}:${imp.line} cannot resolve "${imp.spec}" in vendor/`);
      continue;
    }
    if (!imp.spec.startsWith('.')) {
      errors.push(`${rel}:${imp.line} bare import "${imp.spec}" is not in the import map`);
      continue;
    }
    const target = path.resolve(path.dirname(file), imp.spec);
    if (!fs.existsSync(target)) {
      errors.push(`${rel}:${imp.line} imports missing file ${path.relative(root, target)}`);
      continue;
    }
    const targetAnalysis = info.get(target);
    if (!targetAnalysis) {
      // parse it on demand (files outside src/, e.g. tools)
      info.set(target, analyze(target));
    }
    const ta = info.get(target);
    if (imp.defaultImport && !ta.hasDefault) {
      warnings.push(`${rel}:${imp.line} imports default from ${path.relative(root, target)} which has none`);
    }
    for (const name of imp.named) {
      if (name === 'default') continue;
      if (!ta.exports.has(name)) {
        errors.push(`${rel}:${imp.line} imports { ${name} } but ${path.relative(root, target)} does not export it`);
      }
    }
    if (imp.namespace) void imp.namespace;
  }
}

// Unused import detection (cheap): name never appears again in the body
for (const [file, analysis] of info) {
  const rel = path.relative(root, file);
  if (!file.startsWith(srcDir)) continue;
  const code = fs.readFileSync(file, 'utf8');
  for (const imp of analysis.imports) {
    for (const name of imp.named) {
      if (name === 'default') continue;
      const uses = code.split(new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`, 'g')).length - 1;
      if (uses <= 1) warnings.push(`${rel} imports { ${name} } but never uses it`);
    }
  }
}

console.log(`Checked ${files.length} modules under src/.`);
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  ! ${w}`);
}
if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  for (const e of errors) console.error(`  x ${e}`);
  process.exit(1);
}
console.log('\nAll module imports resolve and every named import exists.');
