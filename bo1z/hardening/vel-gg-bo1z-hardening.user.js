// ==UserScript==
// @name         vel.gg/bo1z hardening
// @namespace    https://github.com/Qynl/RandomStuff/tree/main/bo1z/hardening
// @version      1.0.0
// @description  Turns off bo1z telemetry through the site's own opt-out, and pins its network egress to the two first-party origins the security review verified.
// @author       bo1z source review
// @match        https://vel.gg/bo1z
// @match        https://vel.gg/bo1z/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

/*
 * Two independent layers, neither of which modifies the site's code:
 *
 *  1. Set `?telemetry=0` in the address bar before any module executes.
 *     telemetry.js:115 reads that flag first and disables every send.
 *
 *  2. Enforce the egress surface the audit measured: the hosts `vel.gg` and
 *     `cdn.vel.gg` over https/wss, plus `blob:`/`data:` for the workers. Anything else
 *     is refused and logged. The review found nothing else in today's deploy -
 *     this exists so a *future* deploy cannot add a tracker, an analytics call
 *     or a WebSocket silently.
 *
 * Blocking cannot break the game. All three telemetry send paths swallow their
 * own errors (`.catch(() => {})` at telemetry.js:158, `.catch(() => null)` at
 * :181, sendBeacon's return value checked at :148), and a failed GET probe sets
 * `enabled = false`, which drops every queued record without posting it.
 *
 * Requires `@grant none` (or the equivalent page-context injection): patching
 * `fetch` from a sandboxed userscript world would not touch the page's copy.
 * Adds no network requests of its own, so it cannot affect the site's
 * `crossOriginIsolated` / SharedArrayBuffer requirement.
 */

(() => {
  'use strict';

  // Host-based rather than origin-based so that a legitimate `wss://vel.gg` socket
  // is not refused for having a different scheme. Exactly the two hosts the audit
  // measured; a new subdomain would be blocked and logged, which is the
  // conservative default - add it here if a future deploy really needs it.
  const ALLOWED_HOSTS = new Set(['vel.gg', 'cdn.vel.gg']);
  const SECURE_SCHEMES = new Set(['https:', 'wss:', 'blob:', 'data:']);
  const TELEMETRY_PATH = '/bo1z/telemetry';
  const MAX_RECORDS = 200;

  const state = {
    installed: true,
    urlRewritten: false,
    telemetryOptedOut: false,
    blocked: [],
    allowed: 0,
  };

  function record(reason, url) {
    const entry = { reason, url: String(url).slice(0, 300), at: new Date().toISOString() };
    const duplicate = state.blocked.some(b => b.reason === entry.reason && b.url === entry.url);
    if (!duplicate && state.blocked.length < MAX_RECORDS) state.blocked.push(entry);
    console.warn(`[bo1z hardening] blocked ${entry.reason}: ${entry.url}`);
    badge(`blocked: ${entry.reason}`, 'warn');
    return entry;
  }

  /** Decide whether a request target is inside the audited egress surface. */
  function classify(input) {
    const raw = typeof input === 'string' ? input : input?.url ?? String(input);
    let target;
    try {
      target = new URL(raw, location.href);
    } catch {
      return { allowed: false, reason: 'unparseable URL', url: raw };
    }
    if (target.protocol === 'blob:' || target.protocol === 'data:') {
      return { allowed: true, url: raw };          // opus worker pool, canvas transfer
    }
    if (!ALLOWED_HOSTS.has(target.hostname)) {
      return { allowed: false, reason: `host ${target.hostname}`, url: raw };
    }
    // The site is https-only and requires crossOriginIsolated, so a plaintext
    // request to an allowed host is a downgrade, never a legitimate one.
    if (!SECURE_SCHEMES.has(target.protocol)) {
      return { allowed: false, reason: `insecure scheme ${target.protocol}`, url: raw };
    }
    if (target.pathname === TELEMETRY_PATH || target.pathname.endsWith('/telemetry')) {
      return { allowed: false, reason: 'telemetry endpoint', url: raw };
    }
    return { allowed: true, url: raw };
  }

  const refuse = verdict => Promise.reject(
    new TypeError(`Blocked by bo1z hardening (${verdict.reason}): ${verdict.url}`));

  /* --- layer 1: the site's own opt-out, taken before its modules run ------ */

  try {
    const url = new URL(location.href);
    const existing = url.searchParams.get('telemetry');
    if (existing !== '0' && existing !== 'off') {
      url.searchParams.set('telemetry', '0');
      // replaceState changes what `location.search` returns for every later
      // read. ES modules are deferred, so telemetry.js has not run yet.
      history.replaceState(history.state, '', url.href);
      state.urlRewritten = true;
    }
    state.telemetryOptedOut = ['0', 'off'].includes(
      new URL(location.href).searchParams.get('telemetry'));
  } catch (error) {
    console.warn('[bo1z hardening] could not rewrite the URL:', error);
  }

  /* --- layer 2: enforce the audited egress surface ------------------------ */

  const nativeFetch = globalThis.fetch?.bind(globalThis);
  if (nativeFetch) {
    globalThis.fetch = (input, init) => {
      const verdict = classify(input);
      if (!verdict.allowed) { record(verdict.reason, verdict.url); return refuse(verdict); }
      state.allowed++;
      return nativeFetch(input, init);
    };
  }

  const nativeBeacon = navigator.sendBeacon?.bind(navigator);
  if (nativeBeacon) {
    navigator.sendBeacon = (url, data) => {
      const verdict = classify(url);
      if (!verdict.allowed) { record(verdict.reason, verdict.url); return false; }
      state.allowed++;
      return nativeBeacon(url, data);
    };
  }

  if (typeof XMLHttpRequest !== 'undefined') {
    const nativeOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      const verdict = classify(url);
      if (!verdict.allowed) {
        record(verdict.reason, verdict.url);
        throw new DOMException(`Blocked by bo1z hardening (${verdict.reason})`, 'SecurityError');
      }
      state.allowed++;
      return nativeOpen.call(this, method, url, ...rest);
    };
  }

  const NativeWebSocket = globalThis.WebSocket;
  if (NativeWebSocket) {
    const Guarded = function (url, protocols) {
      const verdict = classify(url);
      if (!verdict.allowed) {
        record(verdict.reason, verdict.url);
        throw new DOMException(`Blocked by bo1z hardening (${verdict.reason})`, 'SecurityError');
      }
      state.allowed++;
      return new NativeWebSocket(url, protocols);
    };
    Guarded.prototype = NativeWebSocket.prototype;
    Object.assign(Guarded, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
    globalThis.WebSocket = Guarded;
  }

  const NativeEventSource = globalThis.EventSource;
  if (NativeEventSource) {
    const GuardedSource = function (url, config) {
      const verdict = classify(url);
      if (!verdict.allowed) {
        record(verdict.reason, verdict.url);
        throw new DOMException(`Blocked by bo1z hardening (${verdict.reason})`, 'SecurityError');
      }
      state.allowed++;
      return new NativeEventSource(url, config);
    };
    GuardedSource.prototype = NativeEventSource.prototype;
    globalThis.EventSource = GuardedSource;
  }

  /* --- a badge that cannot interfere with the game ------------------------ */

  let badgeTimer = null;
  let badgeNode = null;
  function badge(text, kind = 'ok') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => badge(text, kind), { once: true });
      return;
    }
    badgeNode ??= document.createElement('div');
    badgeNode.textContent = `bo1z hardening · ${text}`;
    badgeNode.style.cssText = [
      'position:fixed', 'left:10px', 'bottom:10px', 'z-index:2147483647',
      'pointer-events:none', 'font:11px/1.5 ui-monospace,monospace',
      'padding:4px 8px', 'border-radius:4px', 'opacity:0.9',
      `background:${kind === 'warn' ? '#3a2a1a' : '#16211a'}`,
      `color:${kind === 'warn' ? '#e0b070' : '#8fd0a0'}`,
      'border:1px solid #2a2f36',
    ].join(';');
    document.body?.append(badgeNode);
    clearTimeout(badgeTimer);
    // Fades out so it is gone before pointer lock or fullscreen is requested.
    badgeTimer = setTimeout(() => badgeNode?.remove(), 4000);
  }

  state.report = () => ({
    telemetryOptedOut: state.telemetryOptedOut,
    urlRewritten: state.urlRewritten,
    allowedRequests: state.allowed,
    blockedRequests: state.blocked.length,
    blocked: state.blocked,
  });

  globalThis.__bo1zHardening = state;
  badge(state.telemetryOptedOut ? 'telemetry off · egress pinned' : 'egress pinned');
  console.info('[bo1z hardening] installed. Inspect with __bo1zHardening.report()');
})();
