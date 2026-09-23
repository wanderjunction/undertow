/*
 * Undertow — 決定的な乱数
 *
 * 目的（purpose）ごとに独立した stream を seed から導出する。
 * ある目的での消費が、別の目的の次の値をずらさない。
 * 同じ seed・同じ目的からは、いつ誰が呼んでも同じ列が出る（決定的リプレイ）。
 */
(function (U) {
  'use strict';

  // FNV-1a 32bit。目的名 + seed から stream の種を作る
  function hash32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class Stream {
    constructor(seed) {
      this._next = mulberry32(seed >>> 0);
    }
    next() {
      return this._next();
    }
    range(a, b) {
      return a + (b - a) * this._next();
    }
    int(a, b) {
      return a + Math.floor(this._next() * (b - a + 1));
    }
    chance(p) {
      return this._next() < p;
    }
    pick(list) {
      return list[Math.floor(this._next() * list.length)];
    }
    // [[値, 重み], ...]
    weighted(pairs) {
      let total = 0;
      for (const p of pairs) total += p[1];
      let x = this._next() * total;
      for (const p of pairs) {
        x -= p[1];
        if (x <= 0) return p[0];
      }
      return pairs[pairs.length - 1][0];
    }
  }

  function formatSeed(seed) {
    return (seed >>> 0).toString(16).toUpperCase().padStart(8, '0');
  }

  function derive(seed, purpose) {
    return new Stream(hash32(purpose + '|' + formatSeed(seed)));
  }

  function randomSeed() {
    const c = globalThis.crypto;
    if (c && c.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0];
    return Math.floor(Math.random() * 4294967296) >>> 0;
  }

  function parseSeed(text) {
    const m = /^#?([0-9a-f]{8})$/i.exec(String(text || '').trim());
    return m ? parseInt(m[1], 16) >>> 0 : null;
  }

  U.rng = Object.freeze({ derive, hash32, randomSeed, formatSeed, parseSeed });
})((globalThis.Undertow = globalThis.Undertow || {}));
