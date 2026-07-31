/**
 * Timer polyfills (setTimeout / clearTimeout / setInterval / clearInterval /
 * queueMicrotask) evaluated inside every plugin QuickJS VM.
 *
 * Timers are host-bridged via __hostSleep so real wall-clock waits integrate
 * with the existing __hostCall pump (microtasks get drained when the
 * host-side resolve lands). The VM has no built-in event loop.
 */

export const TIMERS_SOURCE = `// ------- timers (setTimeout/setInterval) — host-bridged via __hostSleep --
// The QuickJS VM has no built-in event loop, so timers can't be a pure JS
// polyfill — somebody has to actually wait. We thread that wait through a
// worker-local __hostSleep(ms) host function that resolves a VM Promise
// after ms real milliseconds (via the worker's setTimeout). Plugin
// timers are therefore real wall-clock timers, not VM-internal "ticks",
// and they integrate with the existing __hostCall pump (microtasks get
// drained when the host-side resolve lands).
//
// Cancellation is recorded in __timer_tokens; the fire path checks the
// token's flag before invoking the callback. The host also tracks each
// scheduled native setTimeout via its host-side handle so the whole set
// can be torn down when the VM is disposed (preventing fires into a dead
// VM after the plugin is uninstalled / upgraded).
let __timer_seq = 0;
const __timer_tokens = new Map();
const __TIMER_MAX_MS = 24 * 60 * 60 * 1000; // 1 day ceiling — silently clamped.

function __scheduleTimer(handler, delayMs, repeating) {
  if (typeof handler !== 'function') throw new TypeError('Timer callback must be a function');
  __timer_seq += 1;
  const id = __timer_seq;
  const raw = Number(delayMs);
  let ms = Number.isFinite(raw) && raw > 0 ? raw : 0;
  if (ms > __TIMER_MAX_MS) ms = __TIMER_MAX_MS;
  const token = { cancelled: false };
  __timer_tokens.set(id, token);

  function tick() {
    if (token.cancelled) return;
    __hostSleep(ms).then(function () {
      if (token.cancelled) return;
      try {
        handler();
      } catch (err) {
        __log('error', '[timer] callback threw: ' + (err && err.stack ? err.stack : String(err)));
      }
      if (repeating && !token.cancelled) tick();
      else __timer_tokens.delete(id);
    });
  }
  tick();
  return id;
}

globalThis.setTimeout = function setTimeout(handler, delayMs) {
  return __scheduleTimer(handler, delayMs, false);
};
globalThis.clearTimeout = function clearTimeout(id) {
  const token = __timer_tokens.get(id);
  if (token) { token.cancelled = true; __timer_tokens.delete(id); }
};
globalThis.setInterval = function setInterval(handler, periodMs) {
  // Browser-ish floor of 4ms so a misuse (setInterval(fn, 0)) doesn't pin
  // a worker. The 1-day ceiling above already covers the upper end.
  const safeMs = Number(periodMs) >= 4 ? Number(periodMs) : 4;
  return __scheduleTimer(handler, safeMs, true);
};
globalThis.clearInterval = function clearInterval(id) {
  const token = __timer_tokens.get(id);
  if (token) { token.cancelled = true; __timer_tokens.delete(id); }
};
globalThis.queueMicrotask = function queueMicrotask(handler) {
  if (typeof handler !== 'function') throw new TypeError('queueMicrotask callback must be a function');
  // The VM has a native Promise scheduler — a resolved Promise's .then is a
  // proper microtask. This polyfill matches the WHATWG ordering closely
  // enough for plugin code that just wants to defer until the current
  // synchronous task finishes.
  Promise.resolve().then(function () {
    try { handler(); }
    catch (err) { __log('error', '[microtask] threw: ' + (err && err.stack ? err.stack : String(err))); }
  });
};

`
