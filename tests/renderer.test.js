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
  cancelScheduledValues(t) {
    this.events = this.events.filter((e) => e.time < t);
    return this;
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

test('アシッド: 滑る音は前の音程から入り、アクセントはフィルターがより開く', () => {
  const acids = IDS.filter((w) => PATCHES[w].bass.acid);
  assert.ok(acids.length > 0);
  const { mtof } = U.util;
  for (const world of acids) {
    const peakOf = (vel) => {
      const ctx = new FakeContext();
      const voices = new U.Voices(ctx, new U.core.Director({ seed: 1, world }).identity);
      const before = ctx.params.length;
      voices._bass({ step: 0, note: 45, vel, len: 1, cut: 0.5 }, 1);
      const lp = ctx.params.slice(before).find((p) => p.label === 'biquad.frequency' && p.events.length);
      return lp.events[0].value;
    };
    assert.ok(peakOf(1) > peakOf(0.6) * 1.3, `${world}: accent does not open the filter`);
    const ctx = new FakeContext();
    const voices = new U.Voices(ctx, new U.core.Director({ seed: 1, world }).identity);
    voices._bass({ step: 0, note: 45, vel: 0.7, len: 1, cut: 0.5, from: 40 }, 1);
    const osc = ctx.sources[ctx.sources.length - 1];
    const ev = osc.frequency.events;
    assert.equal(ev[0].kind, 'set');
    assert.ok(Math.abs(ev[0].value - mtof(40)) < 1e-6, 'slide starts from the previous pitch');
    assert.equal(ev[1].kind, 'exp');
    assert.ok(Math.abs(ev[1].value - mtof(45)) < 1e-6, 'slide lands on the note');
  }
});

// バッファの音程（自己相関のいちばん高い山の位置から、周期を小数点以下まで推定）
function pitchOf(buffer) {
  const d = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const from = Math.floor(sr * 0.05);
  const n = Math.floor(sr * 0.4);
  const ac = (lag) => {
    let s = 0;
    for (let i = from; i < from + n; i++) s += d[i] * d[i + lag];
    return s;
  };
  let best = 0;
  let bestLag = 0;
  for (let lag = Math.floor(sr / 1000); lag < Math.floor(sr / 60); lag++) {
    const v = ac(lag);
    if (v > best) {
      best = v;
      bestLag = lag;
    }
  }
  const a = ac(bestLag - 1);
  const c = ac(bestLag + 1);
  const shift = (0.5 * (a - c)) / (a - 2 * best + c);
  return sr / (bestLag + shift);
}

test('ナイロンギター: 弦は音程どおりに鳴り、表の 16 分はダウン（全部の弦）、裏の 16 分はアップ（高い弦の数本）', () => {
  const guitars = IDS.filter((w) => PATCHES[w].stab.guitar);
  assert.ok(guitars.length > 0);
  const notes = [40, 47, 52, 56, 59, 64]; // E（022100）: 低い弦から順
  const midiOf = (s) => 69 + 12 * Math.log2(pitchOf(s.buffer) / 440);
  for (const world of guitars) {
    for (let k = 0; k < 4; k++) {
      const ctx = new FakeContext();
      ctx.sampleRate = 22050;
      const voices = new U.Voices(ctx, new U.core.Director({ seed: k + 1, world }).identity);
      const strum = (step, t) => {
        const before = ctx.sources.length;
        voices._stab({ step, notes, vel: 0.9, bright: 0.5, decay: 0.5 }, t);
        return ctx.sources.slice(before).sort((a, b) => a.startAt - b.startAt);
      };
      const down = strum(2, 1);
      assert.equal(down.length, notes.length, `${world}: a downstroke plays every string`);
      down.forEach((s, i) => {
        assert.ok(Math.abs(midiOf(s) - notes[i]) * 100 < 5, `${world}: string ${i} is ${((midiOf(s) - notes[i]) * 100).toFixed(1)} cents off`);
      });
      const up = strum(3, 2);
      assert.ok(up.length >= 3 && up.length < notes.length, `${world}: an upstroke catches only the high strings (${up.length})`);
      up.forEach((s, i) => assert.ok(Math.abs(midiOf(s) - notes[notes.length - 1 - i]) < 0.05, `${world}: upstroke order`));
    }
  }
});

test('ナイロンギターの単音: 弦を 1 本だけ、音程どおりに鳴らし、同じ波形を続けない', () => {
  for (const world of IDS.filter((w) => PATCHES[w].glint.guitar)) {
    const ctx = new FakeContext();
    ctx.sampleRate = 22050;
    const voices = new U.Voices(ctx, new U.core.Director({ seed: 1, world }).identity);
    const pluck = (note) => {
      const before = ctx.sources.length;
      voices._glint({ step: 2, note, vel: 0.8, pan: 0.5 }, 1);
      const made = ctx.sources.slice(before);
      assert.equal(made.length, 1, `${world}: one string for one note`);
      return made[0];
    };
    const a = pluck(69);
    const cents = (69 + 12 * Math.log2(pitchOf(a.buffer) / 440) - 69) * 100;
    assert.ok(Math.abs(cents) < 5, `${world}: single note is ${cents.toFixed(1)} cents off`);
    const b = pluck(69);
    assert.notEqual(a.buffer, b.buffer, `${world}: the same waveform twice in a row`);
  }
});

test('ナイロンギター: 1 本の弦は 1 音だけ。弾き直すと前の音は止まり、同じ波形は続けて使わない', () => {
  for (const world of IDS.filter((w) => PATCHES[w].stab.guitar)) {
    const ctx = new FakeContext();
    const voices = new U.Voices(ctx, new U.core.Director({ seed: 1, world }).identity);
    const notes = [45, 52, 57, 61, 64];
    const p0 = ctx.params.length;
    const s0 = ctx.sources.length;
    voices._stab({ step: 0, notes, vel: 0.9, bright: 0.5, decay: 1 }, 1);
    const firstAmps = ctx.params.slice(p0).filter((p) => p.label === 'gain.gain' && p.events.length === 2);
    const firstSources = ctx.sources.slice(s0);
    assert.equal(firstAmps.length, notes.length);
    const s1 = ctx.sources.length;
    voices._stab({ step: 4, notes, vel: 0.9, bright: 0.5, decay: 1 }, 1.5);
    const second = ctx.sources.slice(s1);
    for (const amp of firstAmps) {
      const last = amp.events[amp.events.length - 1];
      assert.equal(last.kind, 'target');
      assert.equal(last.value, 0);
      assert.ok(last.time >= 1.49 && last.time < 1.65, `${world}: the old note stops when the string is struck again (${last.time})`);
    }
    firstSources.forEach((s, i) => assert.notEqual(s.buffer, second[i].buffer, `${world}: string ${i} repeats the same waveform`));
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
