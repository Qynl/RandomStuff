#!/usr/bin/env node
// Mosaic CLI — stub matching the Studio engine. Packs repo with same rules.
import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const HELP = `
mosaic — Visual Context Studio (CLI stub)

Usage:
  npx mosaic-context pack <dir> [options]
  mosaic pack ./my-app --query "fix webhook retry" --model claude --max-tokens 120k --out ./context.xml

Options:
  --query <text>       Natural language task (smart select)
  --model <m>          claude | gpt4o | gemini (default: claude)
  --max-tokens <n>     Guardrail (e.g. 120k, 80000)
  --scrub              Scrub secrets (sk_test, JWT, etc.)
  --include-imports    Auto-include imports of selected files
  --out <file>         Output file (default: stdout)

This stub lists files and writes a template. Full implementation mirrors index.html engine.
`;

async function collect(dir, ignore = [/node_modules/, /\.git/, /\.next/, /dist/, /build/], out=[]) {
  const entries = await readdir(dir, {withFileTypes:true});
  for (const e of entries) {
    const p = join(dir, e.name);
    if (ignore.some(re=> re.test(p))) continue;
    if (e.isDirectory()) await collect(p, ignore, out);
    else if (/\.(ts|tsx|js|jsx|py|go|rs|json|md|prisma|sql|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help') || args.includes('-h')) { console.log(HELP); process.exit(0); }
if (args[0] !== 'pack') { console.error('Only "pack" is supported in stub. Try: mosaic pack ./my-app'); process.exit(1); }

const dir = args[1] || '.';
let query="", model="claude", maxTok=200000, scrub=false, includeImports=false, outFile="";
for (let i=2;i<args.length;i++) {
  if (args[i]==='--query') query=args[++i]||"";
  else if (args[i]==='--model') model=args[++i]||"claude";
  else if (args[i]==='--max-tokens') maxTok=parseInt((args[++i]||"200k").replace(/k/i,'000'));
  else if (args[i]==='--scrub') scrub=true;
  else if (args[i]==='--include-imports') includeImports=true;
  else if (args[i]==='--out') outFile=args[++i]||"";
}

const files = await collect(dir);
console.error(`◐ Mosaic CLI stub — found ${files.length} files in ${dir}`);
if (query) console.error(`  query: "${query}" | model: ${model} | max: ${maxTok} | scrub: ${scrub}`);

let prompt = `# Mosaic context pack — ${dir}\n# Files: ${files.length} | Model: ${model}\n# Query: ${query || "(none — all files)"}\n\n`;
for (const f of files.slice(0, 24)) {
  let content="";
  try { content=await readFile(f,'utf8'); } catch {}
  if (scrub) content=content.replace(/sk_test_[a-zA-Z0-9]+/g,'sk_test_***SCRUBBED***').replace(/JWT_SECRET=.+/g,'JWT_SECRET=***SCRUBBED***');
  if (content.length>12000) content=content.slice(0,12000)+"\n… truncated";
  prompt+=`\n### ${f}\n\`\`\`\n${content}\n\`\`\`\n`;
}
prompt+=`\n\n# Full CLI with token counting + smart select + dependency closure ships soon. Star the repo!`;

if (outFile) { await writeFile(outFile, prompt); console.error(`✓ Wrote ${outFile} (${prompt.length} chars)`); }
else process.stdout.write(prompt);
