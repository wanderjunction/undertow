/*
 * Undertow — Renderer の予約の仕方と、WORLD ごとの音色を確かめる（本物の音は出さない）
 *   node --test tests/renderer.test.js
 *
 * 偽の AudioContext で Voices を動かし、AudioParam への予約を記録して調べる。
 * たとえば「アタックの終わりより前に減衰を始めてしまう」ような順序の逆転は、
 * エラーにはならないまま音だけが変わる（減衰しない）ので、ここで機械的に捕まえる。
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

for (const f of ['core/util.js', 'core/rng.js', 'core/content.js', 'core/worlds.js', 'core/director.js', 'audio/patches.js', 'audio/voices.js', 'audio/transport.js']) {
  require(path.join(__dirname, '..', 'js', f));
}
const U = globalThis.Undertow;
const { WORLDS, IDS } = U.worlds;
const { PATCHES } = U.patches;

class FakeParam {
  constructor(ctx, label, value) {
    this.label = label;
    this.value = value;
    this.events = [];
    ctx.params.push(this);
  }
  _push(kind, value, time, duration = 0) {
    assert.ok(Number.isFinite(time), `${this.label}.${kind}: time ${time}`);
    assert.ok(Number.isFinite(value), `${this.label}.${kind}: value ${value}`);
    this.events.push({ kind, value, time, duration });
    return this;
  }
  setValueAtTime(v, t) {
    return this._push('set', v, t);
  }
  linearRampToValueAtTime(v, t) {
    return this._push('linear', v, t);
  }
  exponentialRampToValueAtTime(v, t) {
    assert.ok(v > 0, `${this.label}: exponential ramp to ${v}`);
    return this._push('exp', v, t);
  }
  setTargetAtTime(v, t, tc) {
    assert.ok(tc > 0, `${this.label}: time constant ${tc}`);
    return this._push('target', v, t);
  }
  setValueCurveAtTime(curve, t, d) {
    for (const v of curve) assert.ok(Number.isFinite(v));
    return this._push('curve', curve[curve.length - 1], t, d);
  }
}

class FakeNode {
  constructor(ctx, kind, params = {}) {
    this.kind = kind;
    for (const [name, v] of Object.entries(params)) this[name] = new FakeParam(ctx, kind + '.' + name, v);
  }
  connect(dest) {
    return dest;
  }
  disconnect() {}
}

class FakeSource extends FakeNode {
  constructor(ctx, kind, params) {
    super(ctx, kind, params);
    ctx.sources.push(this);
    this.startAt = null;
    this.stopAt = null;
  }
  start(t = 0) {
    assert.equal(this.startAt, null, `${this.kind} started twice`);
    this.startAt = t;
  }
  stop(t = 0) {
    assert.notEqual(this.startAt, null, `${this.kind} stopped before start`);
    this.stopAt = t;
  }
}

class FakeContext {
  constructor() {
    this.sampleRate = 8000;
    this.currentTime = 0;
    this.params = [];
    this.sources = [];
  }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: (c) => data[c] };
  }
  createGain() {
    return new FakeNode(this, 'gain', { gain: 1 });
  }
  createOscillator() {
    return new FakeSource(this, 'osc', { frequency: 440, detune: 0 });
  }
  createBufferSource() {
    return new FakeSource(this, 'buffer', { playbackRate: 1 });
  }
  createBiquadFilter() {
    return new FakeNode(this, 'biquad', { frequency: 350, Q: 1, gain: 0 });
  }
  createStereoPanner() {
    return new FakeNode(this, 'panner', { pan: 0 });
  }
  createDelay() {
    return new FakeNode(this, 'delay', { delayTime: 0 });
  }
  createConvolver() {
    return new FakeNode(this, 'convolver');
  }
  createWaveShaper() {
    return new FakeNode(this, 'shaper');
  }
  createDynamicsCompressor() {
    return new FakeNode(this, 'compressor', { threshold: -24, knee: 30, ratio: 12, attack: 0.003, release: 0.25 });
  }
}

function play(seed, bars, world) {
  const ctx = new FakeContext();
  const director = new U.core.Director({ seed, world });
  const voices = new U.Voices(ctx, director.identity);
  const transport = new U.Transport({ director, voices });
  transport.start(0.1);
  transport.pump(0.1 + bars * transport.barDur - 1e-6, 0);
  return { ctx, voices };
}

const SEEDS = [0x9e3779b1, 1, 2, 0xdeadbeef];
const ROLES = ['kick', 'bass', 'hat', 'perc', 'stab', 'pad', 'glint', 'waves'];

test('どの AudioParam も、予約は時刻の順に積まれる（減衰がアタックより先に始まらない）', () => {
  for (const world of IDS) {
    for (const seed of SEEDS) {
      const { ctx } = play(seed, 160, world);
      for (const p of ctx.params) {
        for (let i = 1; i < p.events.length; i++) {
          const a = p.events[i - 1];
          const b = p.events[i];
          assert.ok(b.time >= a.time - 1e-9, `${world} ${p.label}: ${a.kind}@${a.time.toFixed(4)} → ${b.kind}@${b.time.toFixed(4)}`);
        }
      }
    }
  }
});

test('サイドチェインの呼吸は重ならない（setValueCurveAtTime の区間が重ならない）', () => {
  for (const world of IDS) {
    for (const seed of SEEDS) {
      const { voices } = play(seed, 160, world);
      const curves = voices.duck.gain.events.filter((e) => e.kind === 'curve');
      // 呼吸させる WORLD（duck が 0.1 以上のセクションがある）だけ本数を確かめる。calm はほぼ呼吸させない設計
      const breathes = Object.values(WORLDS[world].sections).some((sec) => sec.duck >= 0.1);
      if (breathes) assert.ok(curves.length > 40, `${world}: curves ${curves.length}`);
      for (let i = 1; i < curves.length; i++) {
        assert.ok(curves[i].time >= curves[i - 1].time + curves[i - 1].duration, `${world}: overlap at ${curves[i].time}`);
      }
    }
  }
});

test('ゴースト・キック: 音源を作らず、呼吸（サイドチェイン）だけを動かす', () => {
  const ghosts = IDS.filter((w) => PATCHES[w].kick.ghost);
  assert.ok(ghosts.length > 0);
  for (const world of ghosts) {
    const ctx = new FakeContext();
    const voices = new U.Voices(ctx, new U.core.Director({ seed: 1, world }).identity);
    const before = ctx.sources.length;
    voices._kick({ step: 0, vel: 1, presence: 1, duck: 0.5 }, 1);
    assert.equal(ctx.sources.length, before, `${world}: 音源が作られた`);
    assert.equal(voices.duck.gain.events.filter((e) => e.kind === 'curve').length, 1, `${world}: 呼吸しない`);
  }
});

test('一度きりの音源は、必ず始まった後に止まる予定を持つ', () => {
  for (const world of IDS) {
    for (const seed of SEEDS) {
      const { ctx, voices } = play(seed, 160, world);
      const persistent = new Set(voices.persistent.map(([node]) => node));
      for (const s of ctx.sources) {
        if (persistent.has(s) || voices.padOscs.has(s)) continue; // 常駐音と、いま鳴っているパッド
        assert.notEqual(s.startAt, null, `${world}: ${s.kind} never started`);
        assert.ok(s.stopAt !== null || s.kind === 'buffer', `${world}: ${s.kind} never stops`);
        if (s.stopAt !== null) assert.ok(s.stopAt > s.startAt, `${world}: ${s.kind} stops before it starts`);
      }
    }
  }
});

test('音色は WORLD ごとに一組そろっていて、WORLD をまたいで共有されない', () => {
  assert.deepEqual(Object.keys(PATCHES).sort(), [...IDS].sort(), 'WORLD とパッチが一対一');
  for (const world of IDS) {
    for (const role of ROLES) assert.ok(PATCHES[world][role], `${world}: ${role} の音色がない`);
    assert.equal(PATCHES[world].waves.lanes.length, WORLDS[world].waves.periods.length, `${world}: 波のレーン数`);
  }
  for (const role of ROLES) {
    for (let i = 0; i < IDS.length; i++) {
      for (let j = i + 1; j < IDS.length; j++) {
        const a = JSON.stringify(PATCHES[IDS[i]][role]);
        const b = JSON.stringify(PATCHES[IDS[j]][role]);
        assert.notEqual(a, b, `${role}: ${IDS[i]} と ${IDS[j]} が同じ音色`);
      }
    }
  }
});
