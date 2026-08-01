/**
 * Plugin sandbox runtime polyfills — `setTimeout`, `setInterval`,
 * `AbortController` / `AbortSignal`, and the fetch shim's `init.signal`
 * threading. These run inside the QuickJS-WASM VM via the bootstrap that
 * `createPluginVm` evaluates before plugin code.
 *
 * The plugin code has no ambient way to observe its environment beyond
 * `__hostCall` (we wire a custom `test.record` target below). Each test
 * captures the plugin's observations via the hostCall recorder, then asserts.
 *
 * The whole point of these polyfills is to remove the "no setTimeout in the
 * VM" limitation. Each scenario here corresponds to a real plugin usage
 * pattern (debounced work, periodic ticks, per-request timeouts via
 * AbortSignal.timeout) that previously had to be worked around in plugin
 * authoring.
 */
import { describe, expect, it } from 'bun:test'
import { createPluginVm, type PluginVmEnv } from '../../../server/plugins/quickjs/vm'

interface RecorderEntry {
  target: string
  args: unknown[]
}

/**
 * Build a minimal env with a record-only hostCall. `test.record` and
 * `test.now` are the only targets the test plugins use. Any other target
 * (e.g. `network.fetch`) is implemented per-test via the optional override.
 */
function makeRecorderEnv(overrides: {
  pluginId?: string
  recorder?: RecorderEntry[]
  onCall?: (target: string, args: unknown[]) => Promise<unknown> | unknown
  grantedPermissions?: string[]
} = {}): { env: PluginVmEnv; recorder: RecorderEntry[] } {
  const recorder = overrides.recorder ?? []
  const env: PluginVmEnv = {
    pluginId: overrides.pluginId ?? 'acme.polyfills',
    manifestVersion: '1.0.0',
    grantedPermissions: overrides.grantedPermissions ?? [],
    assetBasePath: '/uploads/plugins/acme.polyfills/1.0.0',
    settings: {},
    hostCall: async (target, args) => {
      recorder.push({ target, args })
      if (overrides.onCall) return await overrides.onCall(target, args)
      return null
    },
    log: () => { /* swallow */ },
  }
  return { env, recorder }
}

/**
 * Wait until `predicate()` is true OR the timeout elapses. The VM's
 * deferred-promise pump only advances when the host yields, so most
 * polyfill tests just await a single `vm.runRoute` and assert; but some
 * (e.g. setInterval, queueMicrotask after a timer) need an explicit
 * `Promise.race` against a real clock.
 */
async function waitUntil(
  predicate: () => boolean,
  timeoutMs: number,
  pollMs: number = 5,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for predicate`)
    }
    await new Promise((res) => setTimeout(res, pollMs))
  }
}

describe('plugin sandbox: timer polyfills', () => {
  it('setTimeout fires the callback after the wall-clock delay', async () => {
    const { env, recorder } = makeRecorderEnv()
    const vm = await createPluginVm({
      env,
      pluginSource: `
        ;(function () {
          const __plugin_exports = (globalThis.__plugin_exports = {});
          __plugin_exports.activate = async function activate() {
            await new Promise(function (resolve) {
              setTimeout(function () {
                __hostCall('test.record', ['fired-after-delay']);
                resolve();
              }, 30);
            });
          };
        })();
      `,
    })
    try {
      const t0 = Date.now()
      await vm.runLifecycle('activate')
      const elapsed = Date.now() - t0
      expect(recorder.map((e) => e.target)).toEqual(['test.record'])
      // `args` is the tuple the plugin passed to __hostCall; args[0] is the
      // first element of that tuple, which the test plugin passes as
      // `['fired-after-delay']`, so args[0] is the inner string.
      expect(recorder[0]?.args[0]).toEqual('fired-after-delay')
      // Allow generous slack — host scheduling, microtask drains.
      expect(elapsed).toBeGreaterThanOrEqual(25)
      expect(elapsed).toBeLessThan(500)
    } finally {
      vm.dispose()
    }
  })

  it('clearTimeout cancels a pending timer before it fires', async () => {
    const { env, recorder } = makeRecorderEnv()
    const vm = await createPluginVm({
      env,
      pluginSource: `
        ;(function () {
          const __plugin_exports = (globalThis.__plugin_exports = {});
          __plugin_exports.activate = async function activate() {
            const id = setTimeout(function () {
              __hostCall('test.record', ['should-not-fire']);
            }, 20);
            clearTimeout(id);
            // Wait long enough for the cancelled timer's window to pass.
            await new Promise(function (r) { setTimeout(r, 50); });
            await __hostCall('test.record', ['after-window']);
          };
        })();
      `,
    })
    try {
      await vm.runLifecycle('activate')
      // The cancelled fire must NOT have recorded.
      expect(recorder.map((e) => e.args[0])).toEqual(['after-window'])
    } finally {
      vm.dispose()
    }
  })

  it('setInterval fires repeatedly until clearInterval stops it', async () => {
    const { env, recorder } = makeRecorderEnv()
    const vm = await createPluginVm({
      env,
      pluginSource: `
        ;(function () {
          const __plugin_exports = (globalThis.__plugin_exports = {});
          __plugin_exports.activate = async function activate() {
            let count = 0;
            await new Promise(function (resolve) {
              const id = setInterval(function () {
                count += 1;
                __hostCall('test.record', [count]);
                if (count >= 3) {
                  clearInterval(id);
                  resolve();
                }
              }, 10);
            });
          };
        })();
      `,
    })
    try {
      await vm.runLifecycle('activate')
      const tickCounts = recorder.filter((e) => e.target === 'test.record').map((e) => e.args[0] as number)
      expect(tickCounts).toEqual([1, 2, 3])
    } finally {
      vm.dispose()
    }
  })

  it('queueMicrotask runs before setTimeout(0)', async () => {
    const { env, recorder } = makeRecorderEnv()
    const vm = await createPluginVm({
      env,
      pluginSource: `
        ;(function () {
          const __plugin_exports = (globalThis.__plugin_exports = {});
          __plugin_exports.activate = async function activate() {
            const observed = [];
            await new Promise(function (resolve) {
              setTimeout(function () { observed.push('timeout'); resolve(); }, 10);
              queueMicrotask(function () { observed.push('microtask'); });
            });
            await __hostCall('test.record', [observed]);
          };
        })();
      `,
    })
    try {
      await vm.runLifecycle('activate')
      const observed = recorder[0]?.args[0] as string[]
      expect(observed).toEqual(['microtask', 'timeout'])
    } finally {
      vm.dispose()
    }
  })

  it('disposing the VM cancels pending timers (no fire into dead VM)', async () => {
    let fired = false
    const { env } = makeRecorderEnv({
      onCall: async (target) => {
        if (target === 'test.record') fired = true
        return null
      },
    })
    const vm = await createPluginVm({
      env,
      pluginSource: `
        ;(function () {
          const __plugin_exports = (globalThis.__plugin_exports = {});
          __plugin_exports.activate = async function activate() {
            // Long timer — the test disposes the VM before it can fire.
            setTimeout(function () {
              __hostCall('test.record', ['boom']);
            }, 50);
          };
        })();
      `,
    })
    await vm.runLifecycle('activate')
    vm.dispose()
    // Wait past the timer's window. If the polyfill leaked it past dispose,
    // we'd either crash (use-after-free) or see `fired` flip — neither is
    // acceptable.
    await new Promise((res) => setTimeout(res, 120))
    expect(fired).toBe(false)
  })
})

describe('plugin sandbox: AbortController / AbortSignal polyfills', () => {
  it('AbortController.abort() flips signal.aborted and fires listeners', async () => {
    const { env, recorder } = makeRecorderEnv()
    const vm = await createPluginVm({
      env,
      pluginSource: `
        ;(function () {
          const __plugin_exports = (globalThis.__plugin_exports = {});
          __plugin_exports.activate = async function activate() {
            const ctrl = new AbortController();
            let listenerCalled = false;
            ctrl.signal.addEventListener('abort', function () { listenerCalled = true; });
            const before = ctrl.signal.aborted;
            ctrl.abort();
            const after = ctrl.signal.aborted;
            const reasonName = ctrl.signal.reason && ctrl.signal.reason.name;
            await __hostCall('test.record', [{ before, after, listenerCalled, reasonName }]);
          };
        })();
      `,
    })
    try {
      await vm.runLifecycle('activate')
      const observed = recorder[0]?.args[0] as { before: boolean; after: boolean; listenerCalled: boolean; reasonName: string }
      expect(observed).toEqual({ before: false, after: true, listenerCalled: true, reasonName: 'AbortError' })
    } finally {
      vm.dispose()
    }
  })

  it('AbortSignal.timeout() aborts the signal after the wall-clock delay', async () => {
    const { env, recorder } = makeRecorderEnv()
    const vm = await createPluginVm({
      env,
      pluginSource: `
        ;(function () {
          const __plugin_exports = (globalThis.__plugin_exports = {});
          __plugin_exports.activate = async function activate() {
            const signal = AbortSignal.timeout(20);
            const seenBefore = signal.aborted;
            await new Promise(function (resolve) {
              signal.addEventListener('abort', function () { resolve(); });
            });
            const seenAfter = signal.aborted;
            const reasonName = signal.reason && signal.reason.name;
            await __hostCall('test.record', [{ seenBefore, seenAfter, reasonName }]);
          };
        })();
      `,
    })
    try {
      await vm.runLifecycle('activate')
      const observed = recorder[0]?.args[0] as { seenBefore: boolean; seenAfter: boolean; reasonName: string }
      expect(observed).toEqual({ seenBefore: false, seenAfter: true, reasonName: 'TimeoutError' })
    } finally {
      vm.dispose()
    }
  })

  it('AbortSignal.any() aborts when any of the merged signals aborts', async () => {
    const { env, recorder } = makeRecorderEnv()
    const vm = await createPluginVm({
      env,
      pluginSource: `
        ;(function () {
          const __plugin_exports = (globalThis.__plugin_exports = {});
          __plugin_exports.activate = async function activate() {
            const a = new AbortController();
            const b = new AbortController();
            const merged = AbortSignal.any([a.signal, b.signal]);
            await new Promise(function (resolve) {
              merged.addEventListener('abort', function () { resolve(); });
              setTimeout(function () { b.abort(new Error('fired by b')); }, 10);
            });
            await __hostCall('test.record', [{
              mergedAborted: merged.aborted,
              reasonMessage: merged.reason && merged.reason.message,
            }]);
          };
        })();
      `,
    })
    try {
      await vm.runLifecycle('activate')
      const observed = recorder[0]?.args[0] as { mergedAborted: boolean; reasonMessage: string }
      expect(observed.mergedAborted).toBe(true)
      expect(observed.reasonMessage).toBe('fired by b')
    } finally {
      vm.dispose()
    }
  })

  it('signal.throwIfAborted() throws synchronously when aborted', async () => {
    const { env, recorder } = makeRecorderEnv()
    const vm = await createPluginVm({
      env,
      pluginSource: `
        ;(function () {
          const __plugin_exports = (globalThis.__plugin_exports = {});
          __plugin_exports.activate = async function activate() {
            const ctrl = new AbortController();
            let threwBefore = false;
            try { ctrl.signal.throwIfAborted(); } catch (_) { threwBefore = true; }
            ctrl.abort(new Error('boom'));
            let caughtMessage = null;
            try { ctrl.signal.throwIfAborted(); } catch (err) { caughtMessage = err && err.message; }
            await __hostCall('test.record', [{ threwBefore, caughtMessage }]);
          };
        })();
      `,
    })
    try {
      await vm.runLifecycle('activate')
      const observed = recorder[0]?.args[0] as { threwBefore: boolean; caughtMessage: string }
      expect(observed).toEqual({ threwBefore: false, caughtMessage: 'boom' })
    } finally {
      vm.dispose()
    }
  })
})

describe('plugin sandbox: default-export plugin module', () => {
  it('detects + invokes lifecycle hooks when the plugin exports a default module', async () => {
    // Regression for the "no schedules registered" bug: the SDK build's
    // facade and the worker's ensureIifeForm runtime shim both leave a
    // default-export plugin under `__plugin_exports.default`. The bootstrap
    // must unwrap so `activate` is detected and runs — otherwise the
    // lifecycle silently no-ops while the host marks the plugin "active".
    const { env, recorder } = makeRecorderEnv()
    const vm = await createPluginVm({
      env,
      pluginSource: `
        ;(function () {
          // Matches the shape the SDK build emitted before the unwrap fix:
          // the plugin module sits under \`__plugin_exports.default\`.
          globalThis.__plugin_exports = {
            default: {
              install: async function (api) { api.plugin.log('installed'); },
              activate: async function activate(api) {
                await __hostCall('test.record', ['activate-ran', api.plugin.id]);
              },
              deactivate: async function (api) {
                await __hostCall('test.record', ['deactivate-ran']);
              },
            },
          };
        })();
      `,
    })
    try {
      // exportedHooks should reflect the unwrapped module, not the raw root.
      expect(vm.exportedHooks.slice().sort()).toEqual(['activate', 'deactivate', 'install'])
      await vm.runLifecycle('activate')
      const observed = recorder.find((e) => e.target === 'test.record')?.args
      expect(observed).toEqual(['activate-ran', 'acme.polyfills'])
    } finally {
      vm.dispose()
    }
  })

  it('still works for plugins that use named lifecycle exports', async () => {
    // Backwards compatibility — the showcase + template plugins use named
    // exports at the top level. The unwrap must NOT mis-identify the root
    // object as the .default carrier.
    const { env, recorder } = makeRecorderEnv()
    const vm = await createPluginVm({
      env,
      pluginSource: `
        ;(function () {
          const __plugin_exports = (globalThis.__plugin_exports = {});
          __plugin_exports.activate = async function activate(api) {
            await __hostCall('test.record', ['named-activate-ran', api.plugin.id]);
          };
        })();
      `,
    })
    try {
      expect(vm.exportedHooks).toEqual(['activate'])
      await vm.runLifecycle('activate')
      const observed = recorder.find((e) => e.target === 'test.record')?.args
      expect(observed).toEqual(['named-activate-ran', 'acme.polyfills'])
    } finally {
      vm.dispose()
    }
  })
})

describe('plugin sandbox: fetch + AbortSignal integration', () => {
  it('rejects synchronously when init.signal is already aborted', async () => {
    const { env, recorder } = makeRecorderEnv({
      onCall: async (target) => {
        if (target === 'network.fetch') {
          throw new Error('host should never have been called')
        }
        return null
      },
    })
    const vm = await createPluginVm({
      env,
      pluginSource: `
        ;(function () {
          const __plugin_exports = (globalThis.__plugin_exports = {});
          __plugin_exports.activate = async function activate() {
            const ctrl = new AbortController();
            ctrl.abort(new Error('pre-aborted'));
            let caughtMessage = null;
            try {
              await fetch('https://example.com/data', { signal: ctrl.signal });
            } catch (err) {
              caughtMessage = err && err.message;
            }
            await __hostCall('test.record', [caughtMessage]);
          };
        })();
      `,
    })
    try {
      await vm.runLifecycle('activate')
      // The host-side network.fetch must NOT have been invoked.
      expect(recorder.filter((e) => e.target === 'network.fetch')).toHaveLength(0)
      const message = recorder.find((e) => e.target === 'test.record')?.args[0]
      expect(message).toEqual('pre-aborted')
    } finally {
      vm.dispose()
    }
  })

  it('mid-flight abort posts network.abort with the same abortId', async () => {
    const recorder: RecorderEntry[] = []
    // Hold the network.fetch host call open until the test resolves it.
    let resolveFetch: ((value: unknown) => void) | null = null
    const { env } = makeRecorderEnv({
      recorder,
      onCall: async (target) => {
        if (target === 'network.fetch') {
          return await new Promise((res) => { resolveFetch = res })
        }
        return null
      },
    })
    const vm = await createPluginVm({
      env,
      pluginSource: `
        ;(function () {
          const __plugin_exports = (globalThis.__plugin_exports = {});
          __plugin_exports.activate = async function activate() {
            const ctrl = new AbortController();
            const fetchPromise = fetch('https://example.com/data', { signal: ctrl.signal });
            // Abort shortly after the host call is in flight.
            setTimeout(function () { ctrl.abort(new Error('user cancelled')); }, 10);
            let caughtMessage = null;
            try {
              await fetchPromise;
            } catch (err) {
              caughtMessage = err && err.message;
            }
            await __hostCall('test.record', [caughtMessage]);
          };
        })();
      `,
    })
    try {
      const activateP = vm.runLifecycle('activate')
      // Wait for the plugin to have posted the abort.
      await waitUntil(() => recorder.some((e) => e.target === 'network.abort'), 1_000)
      // Now release the host fetch so the activate promise can finish
      // microtask draining for its own internal awaits.
      if (resolveFetch) {
        (resolveFetch as (v: unknown) => void)({ status: 200, ok: true, headers: {}, body: '' })
      }
      await activateP
      const fetchCall = recorder.find((e) => e.target === 'network.fetch')
      const abortCall = recorder.find((e) => e.target === 'network.abort')
      expect(fetchCall).toBeDefined()
      expect(abortCall).toBeDefined()
      const fetchInit = (fetchCall!.args[1] as { abortId?: string })
      const abortArgs = (abortCall!.args[0] as { abortId: string })
      // Same correlation id on both sides.
      expect(typeof fetchInit.abortId).toBe('string')
      expect(abortArgs.abortId).toBe(fetchInit.abortId!)
      // The await in the plugin must have rejected with the user's reason.
      const recordCall = recorder.find((e) => e.target === 'test.record')
      expect(recordCall?.args[0]).toEqual('user cancelled')
    } finally {
      vm.dispose()
    }
  })

  it('successful fetch returns a Response-like object (signal threading is opt-in)', async () => {
    const recorder: RecorderEntry[] = []
    const { env } = makeRecorderEnv({
      recorder,
      onCall: async (target) => {
        if (target === 'network.fetch') {
          return { status: 200, ok: true, headers: { 'content-type': 'application/json' }, body: '{"hello":"world"}' }
        }
        return null
      },
    })
    const vm = await createPluginVm({
      env,
      pluginSource: `
        ;(function () {
          const __plugin_exports = (globalThis.__plugin_exports = {});
          __plugin_exports.activate = async function activate() {
            // No signal at all — abortId must still be set internally for
            // the host record, but the test only checks the plugin's view.
            const res = await fetch('https://example.com/data');
            const body = await res.json();
            await __hostCall('test.record', [{
              status: res.status,
              ok: res.ok,
              contentType: res.headers.get('Content-Type'),
              body,
            }]);
          };
        })();
      `,
    })
    try {
      await vm.runLifecycle('activate')
      const observed = recorder.find((e) => e.target === 'test.record')?.args[0]
      expect(observed).toEqual({
        status: 200,
        ok: true,
        contentType: 'application/json',
        body: { hello: 'world' },
      })
    } finally {
      vm.dispose()
    }
  })
})

describe('plugin sandbox: schedule register → dispatch round-trip', () => {
  it('runs the registered handler when the host dispatches with the namespaced id', async () => {
    // Regression for the silent-no-op scheduler bug: the host namespaces
    // schedule ids as `<pluginId>.<localId>` and dispatches with the
    // namespaced id (see pluginScheduleRegistration.ts:registerPluginSchedule
    // + scheduler.ts:fireSchedule). Before the fix, the VM stored the handler
    // under the local id only, so __runSchedule('acme.polyfills.tick')
    // looked up an undefined entry and silently returned — the schedule run
    // recorded `ok` with 0ms duration but the handler never executed.
    const { env, recorder } = makeRecorderEnv({
      grantedPermissions: ['cms.schedule'],
    })
    const vm = await createPluginVm({
      env,
      pluginSource: `
        ;(function () {
          const __plugin_exports = (globalThis.__plugin_exports = {});
          __plugin_exports.activate = async function activate(api) {
            api.cms.schedule.every(5, 'tick', async function () {
              await __hostCall('test.record', ['tick-ran']);
            });
          };
        })();
      `,
    })
    try {
      await vm.runLifecycle('activate')
      // The host fires the schedule using the namespaced id — exactly like
      // server/plugins/scheduler.ts:fireSchedule does at runtime.
      await vm.runSchedule('acme.polyfills.tick', 5000)
      const ran = recorder.some(
        (e) => e.target === 'test.record' && e.args[0] === 'tick-ran',
      )
      expect(ran).toBe(true)
    } finally {
      vm.dispose()
    }
  })

  it('cancel removes the handler so subsequent dispatches no-op', async () => {
    const { env, recorder } = makeRecorderEnv({
      grantedPermissions: ['cms.schedule'],
    })
    const vm = await createPluginVm({
      env,
      pluginSource: `
        ;(function () {
          const __plugin_exports = (globalThis.__plugin_exports = {});
          __plugin_exports.activate = async function activate(api) {
            api.cms.schedule.every(5, 'tick', async function () {
              await __hostCall('test.record', ['tick-ran']);
            });
            api.cms.schedule.cancel('tick');
          };
        })();
      `,
    })
    try {
      await vm.runLifecycle('activate')
      await vm.runSchedule('acme.polyfills.tick', 5000)
      const ran = recorder.some(
        (e) => e.target === 'test.record' && e.args[0] === 'tick-ran',
      )
      expect(ran).toBe(false)
    } finally {
      vm.dispose()
    }
  })
})

// ---------------------------------------------------------------------------
// crypto.subtle bridge — functional integration through the real sandbox.
//
// These tests run the same WebCrypto subset a storage / auth plugin would
// (S3 Sigv4, JWT signing, OAuth) and verify the outputs match Bun's
// native crypto.subtle on the host. If the bridge regresses (wrong
// algorithm, wrong base64 framing, key/data swapped, …) the test fails
// loud with a hex mismatch, not a silent "signature rejected by AWS"
// at deploy time.
// ---------------------------------------------------------------------------

/**
 * Encode bytes to lowercase hex — used by the test to compare the
 * VM's signature output against Bun's native one. The plugin code
 * exercises the same helper inline (kept as a string-builder so it
 * doesn't depend on any polyfill).
 */
function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0')
  return out
}

/**
 * Host-side reference: run the same crypto operation via Bun's native
 * `crypto.subtle` so the test can assert byte-for-byte equality with
 * what the sandboxed VM produced.
 */
async function referenceHmacSha256Hex(key: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign({ name: 'HMAC' }, cryptoKey, enc.encode(data))
  return bytesToHex(new Uint8Array(sig))
}

async function referenceSha256Hex(data: string): Promise<string> {
  const enc = new TextEncoder()
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(data))
  return bytesToHex(new Uint8Array(digest))
}

/**
 * Build an env whose hostCall ACTUALLY services `crypto.digest` and
 * `crypto.signHmac` via Bun's native crypto.subtle — same code path
 * the production worker host uses. This lets the test verify the
 * sandbox's `globalThis.crypto.subtle` polyfill end-to-end without
 * spinning up a full Worker.
 */
function makeCryptoEnv(pluginId: string, recorder: RecorderEntry[]): PluginVmEnv {
  return {
    pluginId,
    manifestVersion: '1.0.0',
    grantedPermissions: [],
    assetBasePath: `/uploads/plugins/${pluginId}/1.0.0`,
    settings: {},
    hostCall: async (target, args) => {
      recorder.push({ target, args })
      if (target === 'crypto.digest') {
        const { algorithm, data } = (args[0] ?? {}) as { algorithm: string; data: string }
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
        const digest = await crypto.subtle.digest(algorithm, bytes.buffer.slice(0))
        return btoa(String.fromCharCode(...new Uint8Array(digest)))
      }
      if (target === 'crypto.signHmac') {
        const { hash, key, data } = (args[0] ?? {}) as { hash: string; key: string; data: string }
        const keyBytes = Uint8Array.from(atob(key), (c) => c.charCodeAt(0))
        const dataBytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
        const importedKey = await crypto.subtle.importKey(
          'raw',
          keyBytes.buffer.slice(0),
          { name: 'HMAC', hash },
          false,
          ['sign'],
        )
        const sig = await crypto.subtle.sign({ name: 'HMAC' }, importedKey, dataBytes.buffer.slice(0))
        return btoa(String.fromCharCode(...new Uint8Array(sig)))
      }
      return null
    },
    log: () => { /* swallow */ },
  }
}

describe('plugin sandbox: crypto.subtle bridge', () => {
  it('crypto.subtle.digest(SHA-256, string) matches the host reference', async () => {
    const recorder: RecorderEntry[] = []
    const vm = await createPluginVm({
      env: makeCryptoEnv('acme.crypto', recorder),
      pluginSource: `
        ;(function () {
          const __plugin_exports = (globalThis.__plugin_exports = {});
          __plugin_exports.activate = async function activate() {
            const digest = await crypto.subtle.digest('SHA-256', 'AWS4 the quick brown fox');
            // The plugin converts the ArrayBuffer to lowercase hex without
            // any polyfill — same code an AWS Sigv4 implementation runs.
            const view = new Uint8Array(digest);
            let hex = '';
            for (let i = 0; i < view.length; i++) hex += view[i].toString(16).padStart(2, '0');
            await __hostCall('test.record', [{ hex: hex }]);
          };
        })();
      `,
    })
    try {
      await vm.runLifecycle('activate')
      const reported = recorder.find((e) => e.target === 'test.record')?.args[0] as { hex: string }
      const expected = await referenceSha256Hex('AWS4 the quick brown fox')
      expect(reported.hex).toBe(expected)
    } finally {
      vm.dispose()
    }
  })

  it('importKey + sign produces a Sigv4-style HMAC-SHA256 byte-for-byte match', async () => {
    const recorder: RecorderEntry[] = []
    const vm = await createPluginVm({
      env: makeCryptoEnv('acme.crypto', recorder),
      pluginSource: `
        ;(function () {
          const __plugin_exports = (globalThis.__plugin_exports = {});
          __plugin_exports.activate = async function activate() {
            const key = await crypto.subtle.importKey(
              'raw',
              'AWS4test-secret-access-key',
              { name: 'HMAC', hash: 'SHA-256' },
              false,
              ['sign'],
            );
            const sig = await crypto.subtle.sign({ name: 'HMAC' }, key, '20260520');
            const view = new Uint8Array(sig);
            let hex = '';
            for (let i = 0; i < view.length; i++) hex += view[i].toString(16).padStart(2, '0');
            await __hostCall('test.record', [{ hex: hex }]);
          };
        })();
      `,
    })
    try {
      await vm.runLifecycle('activate')
      const reported = recorder.find((e) => e.target === 'test.record')?.args[0] as { hex: string }
      const expected = await referenceHmacSha256Hex('AWS4test-secret-access-key', '20260520')
      expect(reported.hex).toBe(expected)
    } finally {
      vm.dispose()
    }
  })

  it('full Sigv4 key-derivation chain produces a deterministic signing key', async () => {
    // This is the exact 4-HMAC chain AWS S3 / DynamoDB / STS etc. require
    // before signing the canonical request. Running it end-to-end here
    // proves the sandbox is enough to build a real S3 storage plugin.
    const recorder: RecorderEntry[] = []
    const vm = await createPluginVm({
      env: makeCryptoEnv('acme.crypto', recorder),
      pluginSource: `
        ;(function () {
          const __plugin_exports = (globalThis.__plugin_exports = {});
          async function hmac(keyBytes, message) {
            const key = await crypto.subtle.importKey(
              'raw', keyBytes,
              { name: 'HMAC', hash: 'SHA-256' },
              false, ['sign'],
            );
            const sig = await crypto.subtle.sign({ name: 'HMAC' }, key, message);
            return new Uint8Array(sig);
          }
          __plugin_exports.activate = async function activate() {
            const secret = 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY';
            const k1 = await hmac('AWS4' + secret, '20150830');
            const k2 = await hmac(k1, 'us-east-1');
            const k3 = await hmac(k2, 'iam');
            const k4 = await hmac(k3, 'aws4_request');
            let hex = '';
            for (let i = 0; i < k4.length; i++) hex += k4[i].toString(16).padStart(2, '0');
            await __hostCall('test.record', [{ signingKeyHex: hex }]);
          };
        })();
      `,
    })
    try {
      await vm.runLifecycle('activate')
      const reported = recorder.find((e) => e.target === 'test.record')?.args[0] as { signingKeyHex: string }
      // The AWS docs publish this exact derivation as a Sigv4 test
      // vector — if our bridge agrees, we know the plugin can produce
      // correct AWS signatures.
      expect(reported.signingKeyHex)
        .toBe('c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9')
    } finally {
      vm.dispose()
    }
  })

  it('rejects unsupported algorithms with a clear error', async () => {
    const recorder: RecorderEntry[] = []
    const vm = await createPluginVm({
      env: makeCryptoEnv('acme.crypto', recorder),
      pluginSource: `
        ;(function () {
          const __plugin_exports = (globalThis.__plugin_exports = {});
          __plugin_exports.activate = async function activate() {
            let caught = null;
            try {
              await crypto.subtle.digest('MD5', 'hello');
            } catch (err) {
              caught = err && err.message;
            }
            await __hostCall('test.record', [{ caught: caught }]);
          };
        })();
      `,
    })
    try {
      await vm.runLifecycle('activate')
      const reported = recorder.find((e) => e.target === 'test.record')?.args[0] as { caught: string }
      expect(reported.caught).toContain('Unsupported digest algorithm')
    } finally {
      vm.dispose()
    }
  })
})
