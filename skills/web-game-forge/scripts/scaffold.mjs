#!/usr/bin/env node
// Create a new game project from an engine template.
//
//   node skills/web-game-forge/scripts/scaffold.mjs <target-dir> ["Game Title"] [--2d] [--no-install]
//
// Templates:
//   --3d (default)  WebGL + Three.js action game. Installs three from npm.
//   --2d            Canvas 2D arcade game. No dependencies, no build step.
//
// Copies the template into <target-dir>, fills in the title, and refuses to
// overwrite a non-empty directory.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));
const [targetArg, titleArg] = positional;

if (!targetArg) {
  console.error('usage: scaffold.mjs <target-dir> ["Game Title"] [--2d] [--no-install]');
  process.exit(1);
}

const kind = flags.has('--2d') ? '2d' : '3d';
const templateDir = path.join(here, '..', `template-${kind}`);
const target = path.resolve(targetArg);
const title = titleArg || path.basename(target).replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const slug = path.basename(target).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game';

if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
  console.error(`refusing to overwrite non-empty directory: ${target}`);
  process.exit(1);
}

fs.cpSync(templateDir, target, { recursive: true });

for (const rel of ['index.html', 'package.json', 'README.md']) {
  const file = path.join(target, rel);
  if (!fs.existsSync(file)) continue;
  const out = fs.readFileSync(file, 'utf8').replaceAll('{{TITLE}}', title).replaceAll('{{SLUG}}', slug);
  fs.writeFileSync(file, out);
}

console.log(`created "${title}" (${kind === '3d' ? 'WebGL/Three.js' : 'Canvas 2D'}) in ${target}`);

if (kind === '3d' && !flags.has('--no-install')) {
  console.log('installing dependencies (npm install)...');
  const r = spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: target, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('npm install failed. Run it manually in the project folder.');
    process.exit(r.status ?? 1);
  }
}

console.log(`next: cd ${targetArg} && python3 -m http.server 8080 --bind 0.0.0.0`);
