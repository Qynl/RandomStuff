#!/usr/bin/env node
/**
 * IRONWOOD browser test - the layer the headless smoke test cannot reach.
 *
 * Boots the real page in a real (headless) Chromium, watches every console
 * message, page error and failed request, drives the menus like a player would,
 * walks the world, and writes screenshots plus a JSON report. Any page error or
 * failed asset makes it exit non-zero, so "it renders" is verified, not assumed.
 *
 *   node tools/browser-test.mjs                       # default run
 *   node tools/browser-test.mjs --quality=high --shots=menu,boot,play,scope
 *   IW_CHROME=/usr/bin/google-chrome node tools/browser-test.mjs
 *
 * Options
 *   --url=          page to load            (default http://127.0.0.1:8080/)
 *   --out=          screenshot directory    (default ./shots)
 *   --width/--height                        (default 1280x720)
 *   --quality=      low|medium|high|ultra   (default high)
 *   --bots=         bots per side           (default 6)
 *   --difficulty=   recruit|regular|hardened|veteran
 *   --wait=         seconds of gameplay before the beauty shots (default 12)
 *   --shots=        comma list: menu,boot,play,scope,map,report
 *   --keep          leave the browser open on failure (for debugging)
 *
 * Environment
 *   IW_CHROME  browser binary (falls back to puppeteer's own download)
 *   IW_LIBS    extra shared library dir (LD_LIBRARY_PATH)
 *   IW_TIMEOUT per-step timeout in ms (default 180000)
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

const opts = {
  url: arg('url', process.env.IW_URL || 'http://127.0.0.1:8080/'),
  out: path.resolve(root, arg('out', 'shots')),
  width: Number(arg('width', 1280)),
  height: Number(arg('height', 720)),
  quality: arg('quality', 'high'),
  bots: arg('bots', '6'),
  difficulty: arg('difficulty', 'regular'),
  wait: Number(arg('wait', 12)),
  shots: arg('shots', 'menu,boot,play,scope,report').split(',').map((s) => s.trim()).filter(Boolean),
  timeout: Number(process.env.IW_TIMEOUT || 180000),
};

let puppeteer;
try {
  puppeteer = (await import('puppeteer-core')).default;
} catch (err) {
  console.error('puppeteer-core is not installed. Run:  npm install --save-dev puppeteer-core');
  console.error(`(${err.message})`);
  process.exit(2);
}

const executablePath = process.env.IW_CHROME || (fs.existsSync('/tmp/chromium') ? '/tmp/chromium' : undefined);
if (process.env.IW_CHROME && !fs.existsSync(process.env.IW_CHROME)) {
  console.error(`IW_CHROME points at ${process.env.IW_CHROME} which does not exist`);
  process.exit(2);
}
// the sandbox chromium needs the Amazon Linux userland libs that ship next to it
const libDirs = [process.env.IW_LIBS, '/tmp/al2023/lib'].filter((d) => d && fs.existsSync(d));
const env = { ...process.env };
if (libDirs.length) env.LD_LIBRARY_PATH = [...libDirs, env.LD_LIBRARY_PATH || ''].filter(Boolean).join(':');

fs.mkdirSync(opts.out, { recursive: true });

const consoleLog = [];
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const report = { url: opts.url, startedAt: new Date().toISOString(), options: opts, steps: [] };

function step(name, data = {}) {
  report.steps.push({ name, at: Date.now(), ...data });
  console.log(`· ${name}${data.note ? ` — ${data.note}` : ''}`);
}

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  env,
  protocolTimeout: opts.timeout,
  // IW_DUMPIO=1 prints Chromium's own stderr (crash + GPU messages)
  dumpio: process.env.IW_DUMPIO === '1',
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-zygote',
    '--hide-scrollbars', '--mute-audio', '--disable-background-timer-throttling',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--window-size=' + opts.width + ',' + opts.height,
  ],
});
step('launch', { note: await browser.version(), executablePath: executablePath || '(puppeteer default)' });

const page = await browser.newPage();
await page.setViewport({ width: opts.width, height: opts.height, deviceScaleFactor: 1 });
page.setDefaultTimeout(opts.timeout);

page.on('console', (msg) => {
  const entry = { type: msg.type(), text: msg.text().slice(0, 600) };
  consoleLog.push(entry);
  if (entry.type === 'error') consoleErrors.push(entry.text);
  if (entry.type === 'error' || entry.type === 'warning' || /ironwood/i.test(entry.text)) {
    console.log(`  [${entry.type}] ${entry.text}`);
  }
});
page.on('pageerror', (err) => {
  pageErrors.push(String(err.stack || err).slice(0, 1200));
  console.log(`  [pageerror] ${err.message}`);
});
page.on('requestfailed', (req) => {
  const failure = `${req.url()} :: ${req.failure()?.errorText}`;
  failedRequests.push(failure);
  console.log(`  [requestfailed] ${failure}`);
});

async function shot(name, note) {
  const file = path.join(opts.out, `${name}.png`);
  await page.screenshot({ path: file, type: 'png' });
  const { size } = fs.statSync(file);
  step(`shot:${name}`, { file, size, note });
  return file;
}

async function diag() {
  return page.evaluate(() => (window.ironwood?.diag ? window.ironwood.diag() : null));
}

/** Hold a key down for `ms` so the player actually walks. */
async function hold(key, ms) {
  await page.keyboard.down(key);
  await new Promise((r) => setTimeout(r, ms));
  await page.keyboard.up(key);
}

try {
  const target = `${opts.url}${opts.url.includes('?') ? '&' : '?'}quality=${opts.quality}&bots=${opts.bots}&difficulty=${opts.difficulty}&diag=1`;
  step('goto', { note: target });
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: opts.timeout });

  // wait for the game to report readiness
  await page.waitForFunction('window.__IRONWOOD_READY__ === true', { timeout: opts.timeout });
  const bootDiag = await diag();
  step('ready', { note: `gpu: ${bootDiag?.gpu}`, diag: bootDiag });

  if (opts.shots.includes('menu')) await shot('01-menu', 'main menu after boot');

  // deploy: click the real button like a player, not a scripted shortcut
  await page.evaluate(() => {
    const el = document.querySelector('[data-action="goto-sp"]');
    if (el) el.click();
  });
  await new Promise((r) => setTimeout(r, 250));
  await page.evaluate(() => {
    const el = document.querySelector('[data-action="start-sp"]');
    if (el) el.click();
  });
  await page.waitForFunction('window.ironwood?.inMatch === true', { timeout: opts.timeout });
  step('deployed');

  // let the match breathe, then capture
  await new Promise((r) => setTimeout(r, 1500));
  if (opts.shots.includes('boot')) await shot('02-boot', 'first seconds in match');

  // walk forward for a moment so the world, footsteps and bots get exercised
  await hold('KeyW', Math.min(4000, opts.wait * 250));
  await new Promise((r) => setTimeout(r, 1200));

  // look toward the village ruins with a level camera: a repeatable vantage
  // (mouse-look in headless has no pointer lock, so aim through the API)
  await page.evaluate(() => {
    window.ironwood.lookAt(-40, 10, -0.04);
  });
  await new Promise((r) => setTimeout(r, 1500));
  if (opts.shots.includes('play')) await shot('03-play', 'level view over the valley');

  const midDiag = await diag();
  step('mid-match', { diag: midDiag });

  await new Promise((r) => setTimeout(r, opts.wait * 1000));
  if (opts.shots.includes('report')) await shot('04-late', `${opts.wait}s into the match`);

  // beauty shots from named landmarks, straight through the game API
  const landmarks = [
    ['temple', 26, -22, 52, -52, -0.02],   // temple approach, colonnade in view
    ['bridge', -66, 54, -46, 30, -0.03],   // village road crossing
    ['village', -70, 40, -60, 32, -0.02],  // ruined hamlet
    ['jungle', -8, 46, 16, 26, 0.0],       // off-trail jungle interior
    ['rim', -86, 92, 0, -10, -0.12],       // valley panorama from the ridge
  ];
  for (const [name, x, z, lx, lz, pitch] of landmarks) {
    await page.evaluate(([px, pz, tx, tz, p]) => {
      window.ironwood.teleport(px, pz);
      window.ironwood.lookAt(tx, tz, p);
    }, [x, z, lx, lz, pitch]);
    // let a few frames settle (swiftshader is slow, so this is generous)
    await new Promise((r) => setTimeout(r, 3000));
    await shot(`10-${name}`, `landmark: ${name}`);
  }

  // aiming down sights
  await page.mouse.down({ button: 'right' });
  await new Promise((r) => setTimeout(r, 900));
  if (opts.shots.includes('scope')) await shot('05-ads', 'aiming down sights');
  await page.mouse.up({ button: 'right' });

  // let the bots fight, then read the scoreboard
  await new Promise((r) => setTimeout(r, 8000));
  const endDiag = await diag();
  step('fight', { diag: endDiag, note: `scores ${JSON.stringify(endDiag?.scores)}` });
  if (opts.shots.includes('map')) {
    await page.keyboard.down('Tab');
    await new Promise((r) => setTimeout(r, 900));
    await shot('06-scoreboard', 'scoreboard held');
    await page.keyboard.up('Tab');
  }

  report.diag = { boot: bootDiag, mid: midDiag, end: endDiag };
} catch (err) {
  step('failed', { note: String(err.message ?? err) });
  report.error = String(err.stack || err);
  try {
    await shot('99-failure', 'state when the run failed');
    report.diag = { failure: await diag() };
  } catch (err2) {
    console.log('  (could not grab a failure screenshot)', err2.message);
  }
  if (flag('keep')) {
    console.log('--keep: leaving the browser open for 10 minutes');
    await new Promise((r) => setTimeout(r, 600000));
  }
} finally {
  report.console = { errors: consoleErrors, warnings: consoleLog.filter((c) => c.type === 'warning').map((c) => c.text), failures: failedRequests, pageErrors };
  report.counts = {
    consoleErrors: consoleErrors.length,
    warnings: report.console.warnings.length,
    failedRequests: failedRequests.length,
    pageErrors: pageErrors.length,
  };
  const reportFile = path.join(opts.out, 'report.json');
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  await browser.close().catch(() => {});
  console.log('\n─── browser run summary ─────────────────────────────');
  console.log(`  console errors : ${report.counts.consoleErrors}`);
  console.log(`  page errors    : ${report.counts.pageErrors}`);
  console.log(`  failed requests: ${report.counts.failedRequests}`);
  console.log(`  warnings       : ${report.counts.warnings}`);
  console.log(`  report         : ${reportFile}`);
  for (const e of consoleErrors.slice(0, 10)) console.log(`   ! console: ${e}`);
  for (const e of pageErrors.slice(0, 5)) console.log(`   ! page: ${e.split('\n')[0]}`);
  for (const e of failedRequests.slice(0, 5)) console.log(`   ! request: ${e}`);
  const bad = report.counts.consoleErrors + report.counts.pageErrors + report.counts.failedRequests;
  process.exit(bad ? 1 : 0);
}
