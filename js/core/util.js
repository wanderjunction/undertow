/* Undertow — 小さな共通道具（副作用なし） */
(function (U) {
  'use strict';

  function deepFreeze(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o);
      for (const k of Object.keys(o)) deepFreeze(o[k]);
    }
    return o;
  }

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const mod = (x, n) => ((x % n) + n) % n;
  const smooth = (x) => x * x * (3 - 2 * x);
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  U.util = Object.freeze({ deepFreeze, clamp, mod, smooth, mtof });
})((globalThis.Undertow = globalThis.Undertow || {}));
