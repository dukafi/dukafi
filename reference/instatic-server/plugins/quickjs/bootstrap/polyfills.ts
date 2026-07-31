/**
 * URL, TextEncoder/TextDecoder, console, and AbortController polyfills
 * evaluated inside every plugin QuickJS VM.
 *
 * These are pure-JS implementations of Web Platform APIs that QuickJS
 * does not ship. They are injected as string constants and concatenated
 * into BOOTSTRAP_SOURCE by bootstrap/index.ts.
 */

export const URL_POLYFILL = `// ------- URL / URLSearchParams polyfill -------
// Plugins routinely parse request URLs and manipulate query strings.
// QuickJS does not ship either class, so we provide a compact pure-JS
// implementation that covers the surface plugin code actually needs.
//
// URLSearchParams: get, getAll, has, set, append, delete, toString,
//                 forEach, entries, keys, values, Symbol.iterator
// URL: href, protocol, hostname, host, port, pathname, search, hash,
//      origin, searchParams; new URL(href) and new URL(href, base).
;(function () {
  function parseSearchParams(qs) {
    var pairs = [];
    var s = qs && qs.charAt(0) === '?' ? qs.slice(1) : (qs || '');
    if (!s) return pairs;
    s.split('&').forEach(function (part) {
      if (!part) return;
      var eq = part.indexOf('=');
      if (eq < 0) pairs.push([decodeURIComponent(part), '']);
      else pairs.push([decodeURIComponent(part.slice(0, eq)), decodeURIComponent(part.slice(eq + 1))]);
    });
    return pairs;
  }
  function URLSearchParamsCtor(init) {
    if (!(this instanceof URLSearchParamsCtor))
      throw new TypeError("URLSearchParams constructor: must be called with 'new'");
    this._pairs = typeof init === 'string' ? parseSearchParams(init)
      : Array.isArray(init) ? init.map(function (p) { return [String(p[0]), String(p[1])]; })
      : (init && typeof init === 'object') ? Object.keys(init).map(function (k) { return [k, String(init[k])]; })
      : [];
  }
  URLSearchParamsCtor.prototype = {
    constructor: URLSearchParamsCtor,
    get: function (name) {
      var k = String(name);
      for (var i = 0; i < this._pairs.length; i++) {
        if (this._pairs[i][0] === k) return this._pairs[i][1];
      }
      return null;
    },
    getAll: function (name) {
      var k = String(name);
      return this._pairs.filter(function (p) { return p[0] === k; }).map(function (p) { return p[1]; });
    },
    has: function (name) {
      var k = String(name);
      return this._pairs.some(function (p) { return p[0] === k; });
    },
    set: function (name, value) {
      var k = String(name); var v = String(value); var found = false;
      var next = [];
      for (var i = 0; i < this._pairs.length; i++) {
        if (this._pairs[i][0] === k) {
          if (!found) { found = true; next.push([k, v]); }
        } else {
          next.push(this._pairs[i]);
        }
      }
      if (!found) next.push([k, v]);
      this._pairs = next;
    },
    append: function (name, value) { this._pairs.push([String(name), String(value)]); },
    delete: function (name) {
      var k = String(name);
      this._pairs = this._pairs.filter(function (p) { return p[0] !== k; });
    },
    toString: function () {
      return this._pairs.map(function (p) {
        return encodeURIComponent(p[0]) + '=' + encodeURIComponent(p[1]);
      }).join('&');
    },
    forEach: function (cb) {
      for (var i = 0; i < this._pairs.length; i++) cb(this._pairs[i][1], this._pairs[i][0], this);
    },
    entries: function () { return this._pairs.map(function (p) { return [p[0], p[1]]; }); },
    keys:    function () { return this._pairs.map(function (p) { return p[0]; }); },
    values:  function () { return this._pairs.map(function (p) { return p[1]; }); },
  };
  URLSearchParamsCtor.prototype[Symbol.iterator] = URLSearchParamsCtor.prototype.entries;
  globalThis.URLSearchParams = URLSearchParamsCtor;

  // Matches: scheme://authority/path?query#hash
  // Groups: [1]=scheme [2]=authority [3]=pathname [4]=search(incl.?) [5]=hash(incl.#)
  var URL_PATTERN = /^([a-zA-Z][a-zA-Z0-9.+-]*):\\/\\/([^/?#]*)([^?#]*)(\\?[^#]*)?(#.*)?$/;
  function URLCtor(href, base) {
    if (!(this instanceof URLCtor))
      throw new TypeError("URL constructor: must be called with 'new'");
    var h = String(href);
    if (base !== undefined) {
      var b = new URLCtor(String(base));
      if (/^[a-zA-Z][a-zA-Z0-9.+-]*:/.test(h)) {
        // h is already an absolute URL — use as-is.
      } else if (h.charAt(0) === '/') {
        h = b.protocol + '//' + b.host + h;
      } else {
        // Relative path — resolve against the base's directory.
        var basePath = b.pathname.replace(/[^\\/]*$/, '');
        h = b.protocol + '//' + b.host + basePath + h;
      }
    }
    var m = URL_PATTERN.exec(h);
    if (!m) throw new TypeError('Invalid URL: ' + h);
    this.protocol = m[1].toLowerCase() + ':';
    var authority = m[2] || '';
    var atIdx = authority.lastIndexOf('@');
    var hostAndPort = atIdx >= 0 ? authority.slice(atIdx + 1) : authority;
    var colonIdx = hostAndPort.lastIndexOf(':');
    if (colonIdx >= 0 && /^\\d+$/.test(hostAndPort.slice(colonIdx + 1))) {
      this.hostname = hostAndPort.slice(0, colonIdx);
      this.port = hostAndPort.slice(colonIdx + 1);
    } else {
      this.hostname = hostAndPort;
      this.port = '';
    }
    this.host = this.port ? this.hostname + ':' + this.port : this.hostname;
    this.pathname = m[3] || '/';
    this.search = m[4] || '';
    this.hash = m[5] || '';
    this.href = this.protocol + '//' + this.host + this.pathname + this.search + this.hash;
    this.origin = this.protocol + '//' + this.host;
    this.searchParams = new URLSearchParamsCtor(this.search);
  }
  URLCtor.prototype.toString = function () { return this.href; };
  URLCtor.prototype.toJSON   = function () { return this.href; };
  globalThis.URL = URLCtor;
})();

`

export const TEXT_CODEC_POLYFILL = `// ------- TextEncoder / TextDecoder polyfill -------
// QuickJS does not ship these globals. UTF-8 only — the only encoding
// required by the Web Platform tests that plugin code actually exercises.
;(function () {
  function TextEncoderCtor() {
    if (!(this instanceof TextEncoderCtor))
      throw new TypeError("TextEncoder constructor: must be called with 'new'");
  }
  TextEncoderCtor.prototype.encoding = 'utf-8';
  TextEncoderCtor.prototype.encode = function (str) {
    str = String(str === undefined ? '' : str);
    var out = []; var i = 0;
    while (i < str.length) {
      var c = str.charCodeAt(i++);
      if (c >= 0xd800 && c <= 0xdbff && i < str.length) {
        // Surrogate pair — combine into a code point above U+FFFF.
        var c2 = str.charCodeAt(i++);
        var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      } else if (c < 0x80) {
        out.push(c);
      } else if (c < 0x800) {
        out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      } else {
        out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
    }
    return new Uint8Array(out);
  };
  globalThis.TextEncoder = TextEncoderCtor;

  function TextDecoderCtor(label) {
    if (!(this instanceof TextDecoderCtor))
      throw new TypeError("TextDecoder constructor: must be called with 'new'");
    if (label !== undefined && String(label).toLowerCase() !== 'utf-8')
      throw new RangeError('TextDecoder: only utf-8 is supported in the plugin sandbox');
  }
  TextDecoderCtor.prototype.encoding = 'utf-8';
  TextDecoderCtor.prototype.decode = function (buf) {
    if (!buf) return '';
    var bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    var out = ''; var i = 0;
    while (i < bytes.length) {
      var b1 = bytes[i++];
      if (b1 < 0x80) {
        out += String.fromCharCode(b1);
      } else if ((b1 & 0xe0) === 0xc0) {
        var b2 = bytes[i++];
        out += String.fromCharCode(((b1 & 0x1f) << 6) | (b2 & 0x3f));
      } else if ((b1 & 0xf0) === 0xe0) {
        var b2b = bytes[i++]; var b3 = bytes[i++];
        out += String.fromCharCode(((b1 & 0x0f) << 12) | ((b2b & 0x3f) << 6) | (b3 & 0x3f));
      } else {
        var b2c = bytes[i++]; var b3c = bytes[i++]; var b4 = bytes[i++];
        var cp = ((b1 & 0x07) << 18) | ((b2c & 0x3f) << 12) | ((b3c & 0x3f) << 6) | (b4 & 0x3f);
        cp -= 0x10000;
        out += String.fromCharCode(0xd800 | (cp >> 10), 0xdc00 | (cp & 0x3ff));
      }
    }
    return out;
  };
  globalThis.TextDecoder = TextDecoderCtor;
})();

`

export const CONSOLE_POLYFILL = `// ------- minimal runtime stubs -------
const __consoleProxy = (level) => function () {
  const parts = [];
  for (let i = 0; i < arguments.length; i++) {
    const a = arguments[i];
    if (a instanceof Error) parts.push(a.stack || a.message);
    else if (typeof a === 'string') parts.push(a);
    else {
      try { parts.push(JSON.stringify(a)); }
      catch (_) { parts.push(String(a)); }
    }
  }
  __log(level, parts.join(' '));
};
globalThis.console = {
  log: __consoleProxy('info'),
  info: __consoleProxy('info'),
  warn: __consoleProxy('warn'),
  error: __consoleProxy('error'),
  debug: __consoleProxy('info'),
  trace: __consoleProxy('info'),
};

`

export const ABORT_CONTROLLER_POLYFILL = `// ------- AbortController / AbortSignal — pure JS polyfill ----------------
// Plugins routinely receive AbortSignals from libraries and need to thread
// them through fetch. We implement just enough of the WHATWG surface
// (aborted, reason, addEventListener('abort'), throwIfAborted) for
// realistic usage. AbortSignal.timeout() and AbortSignal.any() are static
// helpers most users expect.
function __makeAbortSignal() {
  const listeners = [];
  const signal = {
    aborted: false,
    reason: undefined,
    onabort: null,
    addEventListener: function (type, listener) {
      if (type !== 'abort' || typeof listener !== 'function') return;
      if (signal.aborted) {
        try { listener({ type: 'abort', target: signal }); } catch (_) {}
        return;
      }
      listeners.push(listener);
    },
    removeEventListener: function (type, listener) {
      if (type !== 'abort') return;
      const i = listeners.indexOf(listener);
      if (i >= 0) listeners.splice(i, 1);
    },
    dispatchEvent: function () { return true; },
    throwIfAborted: function () {
      if (signal.aborted) {
        const r = signal.reason;
        if (r && typeof r === 'object') throw r;
        const err = new Error(typeof r === 'string' ? r : 'The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }
    },
  };
  signal.__fire = function (reason) {
    if (signal.aborted) return;
    signal.aborted = true;
    if (reason === undefined) {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      signal.reason = err;
    } else {
      signal.reason = reason;
    }
    const event = { type: 'abort', target: signal };
    if (typeof signal.onabort === 'function') {
      try { signal.onabort(event); } catch (_) {}
    }
    const snapshot = listeners.slice();
    listeners.length = 0;
    for (let i = 0; i < snapshot.length; i++) {
      try { snapshot[i](event); } catch (_) {}
    }
  };
  return signal;
}

function AbortControllerCtor() {
  if (!(this instanceof AbortControllerCtor)) {
    throw new TypeError("AbortController constructor: must be called with 'new'");
  }
  const signal = __makeAbortSignal();
  this.signal = signal;
  this.abort = function abort(reason) { signal.__fire(reason); };
}
globalThis.AbortController = AbortControllerCtor;

globalThis.AbortSignal = {
  abort: function (reason) {
    const s = __makeAbortSignal();
    s.__fire(reason);
    return s;
  },
  timeout: function (ms) {
    const controller = new AbortControllerCtor();
    const delay = Number(ms);
    if (Number.isFinite(delay) && delay >= 0) {
      setTimeout(function () {
        const err = new Error('Signal timed out');
        err.name = 'TimeoutError';
        controller.abort(err);
      }, delay);
    }
    return controller.signal;
  },
  any: function (signals) {
    const merged = new AbortControllerCtor();
    if (!signals || typeof signals.length !== 'number') return merged.signal;
    for (let i = 0; i < signals.length; i++) {
      const s = signals[i];
      if (!s) continue;
      if (s.aborted) { merged.abort(s.reason); return merged.signal; }
    }
    for (let i = 0; i < signals.length; i++) {
      const s = signals[i];
      if (!s) continue;
      s.addEventListener('abort', function () { merged.abort(s.reason); });
    }
    return merged.signal;
  },
};

`
