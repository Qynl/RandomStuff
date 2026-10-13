#!/usr/bin/env node
// Create a new game project from the engine template.
//
//   node skills/web-game-forge/scripts/scaffold.mjs <target-dir> ["Game Title"]
//
// Copies ../template into <target-dir>, fills in the title, and refuses to overwrite
// a non-empty directory.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const templateDir = path.join(here, '..', 'template');

const [, , targetArg, titleArg] = process.argv;
if (!targetArg) {
  console.error('usage: scaffold.mjs <target-dir> ["Game Title"]');
  process.exit(1);
}

const target = path.resolve(targetArg);
const title = titleArg || path.basename(target).replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const slug = path.basename(target).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game';

if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
  console.error(`refusing to overwrite non-empty directory: ${target}`);
  process.exit(1);
}

fs.cpSync(templateDir, target, { recursive: true });

const textFiles = ['index.html', 'package.json', 'README.md'];
for (const rel of textFiles) {
  const file = path.join(target, rel);
  if (!fs.existsSync(file)) continue;
  const out = fs.readFileSync(file, 'utf8').replaceAll('{{TITLE}}', title).replaceAll('{{SLUG}}', slug);
  fs.writeFileSync(file, out);
}

console.log(`created "${title}" in ${target}`);
console.log(`next: cd ${targetArg} && python3 -m http.server 8080 --bind 0.0.0.0`);
