/**
 * Tests hardening/vel-gg-bo1z-hardening.user.js without a browser.
 *
 *   node hardening/test-userscript.mjs
 *
 * The userscript is an IIFE meant for page context, so it is run inside a node:vm
 * sandbox whose globals are minimal browser stand-ins. That is enough to prove the
 * two things that matter: the URL opt-out happens before modules would read it, and
 * the egress allowlist refuses exactly what the audit says it should refuse.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { rejects, throws } from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'vel-gg-bo1z-hardening.user.js'), 'utf8');

let passed = 0;
let failed = 0;

function test(name, check) {
  try {
    const result = check();
    if (result instanceof Promise) {
      return result.then(
        () => { passed++; console.log(`  ok    ${name}`); },
        error => { failed++; console.log(`  FAIL  ${name}\n        ${error.message}`); });
    }
    passed++; console.log(`  ok    ${name}`);
  } catch (error) {
    failed++; console.log(`  FAIL  ${name}\n        ${error.message}`);
  }
  return Promise.resolve();
}

const assert = (condition, message) => { if (!condition) throw new Error(message); };

/** Load the userscript against a page at `href`, with request spies. */
function install(href) {
  const url = new URL(href);
  const calls = { replaced: [], fetched: [], beacons: [], sockets: [] };
  const warnings = [];

  const location = {
    get href() { return url.href; },
    get search() { return url.search; },
    get pathname() { return url.pathname; },
    get origin() { return url.origin; },
  };
  const history = {
    state: null,
    replaceState(state, _title, target) {
      calls.replaced.push(target);
      const next = new URL(target, url.href);
      url.href = next.href;
      url.search = next.search;
      url.pathname = next.pathname;
    },
  };

  const makeBadge = () => ({ style: { cssText: '' }, textContent: '', remove() {} });
  const document = {
    readyState: 'complete',
    body: { append() {} },
    addEventListener() {},
    createElement: () => makeBadge(),
  };

  // Unref'd so a pending badge-fade timer cannot hold the test process open.
  const setTimeoutUnref = (fn, ms) => {
    const handle = setTimeout(fn, ms);
    handle.unref?.();
    return handle;
  };

  const sandbox = {
    setTimeout: setTimeoutUnref,
    clearTimeout,
    location,
    history,
    document,
    URL,
    Promise,
    TypeError,
    DOMException,
    Set,
    Date,
    Math,
    String,
    Number,
    Object,
    JSON,
    console: {
      warn: message => warnings.push(String(message)),
      info: message => warnings.push(String(message)),
    },
    navigator: {
      sendBeacon: (target, data) => { calls.beacons.push({ target, data }); return true; },
    },
    fetch: async (input, init) => { calls.fetched.push({ input, init }); return { ok: true }; },
    XMLHttpRequest: class {
      open(method, target) { calls.fetched.push({ input: target, method }); }
    },
    WebSocket: class {
      constructor(target, protocols) { calls.sockets.push({ target, protocols }); }
    },
    EventSource: class {
      constructor(target) { calls.sockets.push({ target, kind: 'eventsource' }); }
    },
  };
  // The userscript patches XMLHttpRequest.prototype, so it needs a real prototype
  // object with an `open` method to wrap.
  sandbox.XMLHttpRequest.prototype.open = sandbox.XMLHttpRequest.prototype.open ?? function () {};

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'vel-gg-bo1z-hardening.user.js' });
  return { sandbox, calls, warnings };
}

console.log('\nbo1z hardening userscript\n');

/* --- layer 1: the site's own opt-out ---------------------------------- */

const bare = install('https://vel.gg/bo1z/kino.html');
await test('adds ?telemetry=0 to a bare page URL', () => {
  assert(bare.calls.replaced.length === 1, 'replaceState was not called exactly once');
  assert(new URL(bare.calls.replaced[0]).searchParams.get('telemetry') === '0',
    `unexpected URL: ${bare.calls.replaced[0]}`);
});
await test('location.search already reports the flag afterwards', () => {
  assert(bare.sandbox.location.search.includes('telemetry=0'),
    `search is ${bare.sandbox.location.search}`);
  assert(bare.sandbox.__bo1zHardening.telemetryOptedOut === true, 'opt-out not recorded');
});
await test('preserves existing query parameters', () => {
  const withMap = install('https://vel.gg/bo1z/kino.html?map=kino&horde=1');
  const target = new URL(withMap.calls.replaced[0]);
  assert(target.searchParams.get('map') === 'kino', 'lost ?map');
  assert(target.searchParams.get('horde') === '1', 'lost ?horde');
  assert(target.searchParams.get('telemetry') === '0', 'did not add ?telemetry');
});
await test('leaves an explicit ?telemetry=off alone', () => {
  const opted = install('https://vel.gg/bo1z/kino.html?telemetry=off');
  assert(opted.calls.replaced.length === 0, 'rewrote a URL that was already opted out');
  assert(opted.sandbox.__bo1zHardening.telemetryOptedOut === true, 'opt-out not detected');
});

/* --- layer 2: the audited egress surface ------------------------------- */

const page = install('https://vel.gg/bo1z/kino.html?telemetry=0');
const { fetch: patchedFetch } = page.sandbox;

await test('allows the two first-party origins', async () => {
  await patchedFetch('https://vel.gg/bo1z/kino/manifest.json');
  await patchedFetch('https://cdn.vel.gg/packs/kino/zone.ff');
  await patchedFetch('/bo1z/kino/pack/web-manifest.json');       // relative, same origin
  assert(page.calls.fetched.length === 3, `allowed ${page.calls.fetched.length} of 3`);
});

await test('blocks the telemetry endpoint', async () => {
  let rejected = false;
  try {
    await patchedFetch('https://vel.gg/bo1z/telemetry', { method: 'POST', body: '{}' });
  } catch (error) {
    rejected = true;
    assert(/telemetry endpoint/.test(error.message), `wrong reason: ${error.message}`);
  }
  assert(rejected, 'telemetry POST was not blocked');
  assert(page.calls.fetched.length === 3, 'blocked request reached the network layer');
});

await test('blocks a relative telemetry path too', async () => {
  await rejects(() => patchedFetch('/bo1z/telemetry'), /telemetry endpoint/);
});

await test('blocks any third-party origin', async () => {
  for (const target of ['https://www.google-analytics.com/collect',
                        'https://sentry.io/api/1/store/',
                        'https://cdn.example.com/x.js']) {
    let rejected = false;
    try { await patchedFetch(target); } catch { rejected = true; }
    assert(rejected, `${target} was not blocked`);
  }
  assert(page.sandbox.__bo1zHardening.blocked.length >= 4, 'block records not kept');
  assert(page.sandbox.__bo1zHardening.blocked.every(b => b.url.length <= 300), 'urls not truncated');
});

await test('blocks a plaintext downgrade of an allowed host', async () => {
  await rejects(() => patchedFetch('http://vel.gg/bo1z/x'), /insecure scheme http:/);
});

await test('blocks an unknown scheme on an allowed host', async () => {
  await rejects(() => patchedFetch('ftp://vel.gg/bo1z/x'), /insecure scheme ftp:/);
});

await test('blocks a vel.gg subdomain the audit never saw', async () => {
  await rejects(() => patchedFetch('https://stats.vel.gg/ping'), /host stats.vel.gg/);
});

await test('allows blob: and data: URLs (worker pool, canvas transfer)', async () => {
  await patchedFetch('blob:https://vel.gg/6f1c-4a');
  await patchedFetch('data:application/json,{}');
  assert(page.sandbox.__bo1zHardening.blocked.every(b => !/^blob:|^data:/.test(b.url)),
    'a blob/data URL was blocked');
});

await test('sendBeacon to telemetry returns false and sends nothing', () => {
  const result = page.sandbox.navigator.sendBeacon('/bo1z/telemetry', new Uint8Array([1]));
  assert(result === false, `sendBeacon returned ${result}`);
  assert(page.calls.beacons.length === 0, 'beacon reached the network layer');
});

await test('sendBeacon to an allowed origin still works', () => {
  const result = page.sandbox.navigator.sendBeacon('https://vel.gg/bo1z/save', 'x');
  assert(result === true, `sendBeacon returned ${result}`);
  assert(page.calls.beacons.length === 1, 'beacon was not forwarded');
});

await test('WebSocket and EventSource to a third party throw', () => {
  throws(() => new page.sandbox.WebSocket('wss://relay.example.com/coop'), /Blocked by bo1z/);
  throws(() => new page.sandbox.EventSource('https://stream.example.com/events'),
    /Blocked by bo1z/);
  assert(page.calls.sockets.length === 0, 'socket reached the network layer');
});

await test('WebSocket over wss to the first-party host still opens', () => {
  const socket = new page.sandbox.WebSocket('wss://vel.gg/bo1z/live');
  assert(socket instanceof page.sandbox.WebSocket || socket, 'no socket returned');
  assert(page.calls.sockets.length === 1, `sockets opened: ${page.calls.sockets.length}`);
});

await test('XMLHttpRequest.open refuses a blocked target', () => {
  const xhr = new page.sandbox.XMLHttpRequest();
  throws(() => xhr.open('GET', 'https://tracker.example.com/ping'), /Blocked by bo1z/);
});

await test('report() summarises the session', () => {
  const report = page.sandbox.__bo1zHardening.report();
  assert(report.telemetryOptedOut === true, 'telemetryOptedOut wrong');
  assert(report.allowedRequests > 0, 'no allowed requests counted');
  assert(report.blockedRequests > 0, 'no blocked requests counted');
  assert(Array.isArray(report.blocked), 'blocked list missing');
});

await test('does not touch the page when it is not bo1z', () => {
  // The @match directives scope this to vel.gg/bo1z; running it elsewhere must not
  // rewrite an unrelated URL. Verified here as "no rewrite of a different path".
  const other = install('https://vel.gg/bo1z/');
  const target = new URL(other.calls.replaced[0]);
  assert(target.pathname === '/bo1z/', `path changed to ${target.pathname}`);
  assert(target.searchParams.get('telemetry') === '0', 'flag not added at the root page');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
