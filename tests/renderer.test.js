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
  setPeriodicWave(wave) {
    this.wave = wave;
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
  createPeriodicWave(real, imag) {
    return { real, imag };
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

test('アシッドのスライドと共鳴（acid）: 滑る音はフィルターを弾き直さず、共鳴はつまみが開くほど強い', () => {
  for (const world of IDS.filter((w) => PATCHES[w].bass.acid && PATCHES[w].bass.acid.slideEnv)) {
    const A = PATCHES[world].bass.acid;
    const ctx = new FakeContext();
    const voices = new U.Voices(ctx, new U.core.Director({ seed: 1, world }).identity);
    const probe = (e) => {
      const p0 = ctx.params.length;
      voices._bass(e, 1);
      const ps = ctx.params.slice(p0);
      return { f: ps.find((p) => p.label === 'biquad.frequency' && p.events.length), q: ps.find((p) => p.label === 'biquad.Q') };
    };
    const plain = probe({ step: 2, note: 40, vel: 0.7, len: 0.5, cut: 0.5 });
    const slide = probe({ step: 3, note: 47, vel: 0.7, len: 0.5, cut: 0.5, from: 40 });
    assert.ok(slide.f.events[0].value < plain.f.events[0].value, `${world}: a slide keeps the gate open`);
    assert.ok(probe({ step: 2, note: 40, vel: 0.7, len: 0.5, cut: 0.9 }).q.value > probe({ step: 2, note: 40, vel: 0.7, len: 0.5, cut: 0.1 }).q.value, `${world}: resonance follows the knob`);
    assert.ok(A.glide >= 0.1, 'the slide is long enough to hear');
  }
});

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
      const reach = Math.min(notes.length, PATCHES[world].stab.guitar.top || notes.length); // top: 高い弦だけで刻む
      const down = strum(2, 1);
      assert.equal(down.length, reach, `${world}: a downstroke plays every string it reaches`);
      down.forEach((s, i) => {
        const want = notes[notes.length - reach + i];
        assert.ok(Math.abs(midiOf(s) - want) * 100 < 5, `${world}: string ${i} is ${((midiOf(s) - want) * 100).toFixed(1)} cents off`);
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
    assert.equal(firstAmps.length, Math.min(notes.length, PATCHES[world].stab.guitar.top || notes.length));
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

test('ベースの送り: bassDly / bassVerb を持つ WORLD だけ、ベースの出口からディレイと残響へ送る', () => {
  const orig = U.Voices.prototype._send;
  try {
    for (const world of IDS) {
      const sends = [];
      U.Voices.prototype._send = function (from, amount, to) {
        sends.push({ from, amount, to });
        return orig.call(this, from, amount, to);
      };
      const voices = new U.Voices(new FakeContext(), new U.core.Director({ seed: 1, world }).identity);
      const M = PATCHES[world].mix;
      const bass = sends.filter((s) => s.from.kind === 'biquad'); // ほかの送りはどれもバス（gain）から出る
      const want = [];
      if (M.bassDly) want.push([voices.dly, M.bassDly]);
      if (M.bassVerb) want.push([voices.verb, M.bassVerb]);
      assert.equal(bass.length, want.length, `${world}: bass sends ${bass.length}`);
      for (const [to, amount] of want) assert.ok(bass.some((s) => s.to === to && s.amount === amount), `${world}: bass send ${amount}`);
    }
  } finally {
    U.Voices.prototype._send = orig;
  }
});

test('揺り（箏）: ときどき弾いたあとに音程をゆっくり上下させ、元の高さに戻す（中心は動かさない）', () => {
  for (const world of IDS.filter((w) => PATCHES[w].glint.guitar && PATCHES[w].glint.guitar.yuri)) {
    const Y = PATCHES[world].glint.guitar.yuri;
    const ctx = new FakeContext();
    const voices = new U.Voices(ctx, new U.core.Director({ seed: 1, world }).identity);
    let swayed = 0;
    let still = 0;
    for (let k = 0; k < 16; k++) {
      const before = ctx.sources.length;
      voices._glint({ step: 0, note: 69, vel: 0.8, pan: 0 }, 1 + k * 4);
      const ev = ctx.sources[before].playbackRate.events;
      const base = ev[1].value; // 弾いた瞬間の高さから落ち着いた、元の高さ
      if (ev.length === 2) {
        still++;
        continue;
      }
      swayed++;
      const sway = ev.slice(2, -1);
      assert.equal(sway.length, Y.count);
      sway.forEach((e, i) => {
        assert.ok(Math.abs(e.value / base - 1) <= Y.depth + 1e-9, `${world}: sway too wide ${e.value / base}`);
        if (i > 0) assert.ok((e.value - base) * (sway[i - 1].value - base) < 0, `${world}: sway goes up and down`);
      });
      assert.ok(Math.abs(ev[ev.length - 1].value - base) < 1e-12, `${world}: back to the original pitch`);
    }
    assert.ok(swayed > 0 && still > 0, `${world}: swayed ${swayed}, still ${still}`);
  }
});

test('オルガンのドローン（fog）: 和音を純正律で合わせ、声部を一つずつ入れ、和音が変わると後から入った声部から一つずつ引く', () => {
  const { mtof } = U.util;
  const organs = IDS.filter((w) => PATCHES[w].pad.organ);
  assert.ok(organs.length > 0);
  // [和音, 入る順の [音, A3（220 Hz）からの純正な比]]。ペダル（32'・16'）と根音のあと、5 度・4 度で合わせられる声部から先に入る
  const cases = [
    // A m9: 5 度、その 5 度（9 度）、5 度の下の長 3 度（短 3 度）、その 5 度（短 7 度）
    [[57, 60, 64, 67, 71], [[33, 1 / 4], [45, 1 / 2], [57, 1], [64, 3 / 2], [71, 9 / 4], [60, 6 / 5], [67, 9 / 5]]],
    // A m11: 11 度（4 度）から 5 度ずつ下へ（短 7 度、短 3 度は 32:27）、短 7 度の上の長 3 度（9 度）
    [[57, 60, 67, 71, 74], [[33, 1 / 4], [45, 1 / 2], [57, 1], [74, 8 / 3], [67, 16 / 9], [60, 32 / 27], [71, 20 / 9]]],
    // 5 度のない短 3 度は 6:5
    [[57, 60], [[33, 1 / 4], [45, 1 / 2], [57, 1], [60, 6 / 5]]],
  ];
  for (const world of organs) {
    const O = PATCHES[world].pad.organ;
    assert.deepEqual(O.pedal.map(([i]) => i), [-24, -12], "この検査はペダルが 32' と 16' の前提");
    for (const [notes, expected] of cases) {
      const ctx = new FakeContext();
      const voices = new U.Voices(ctx, new U.core.Director({ seed: 1, world }).identity);
      const s0 = ctx.sources.length;
      voices._padChord(notes, 1);
      const all = ctx.sources.slice(s0);
      const pipes = all.filter((o) => o.wave);
      assert.equal(pipes.length, expected.length * 2, `${world}: two pipes (with celeste) per voice`);
      assert.equal(all.length - pipes.length, expected.length, `${world}: one bloom per voice`);
      let prev = 1;
      expected.forEach(([note, ratio], k) => {
        const [a, b] = pipes.slice(k * 2, k * 2 + 2);
        assert.equal(a.frequency.value, mtof(note));
        const hz = mtof(note) * 2 ** (a.detune.value / 1200);
        assert.ok(Math.abs(hz / (220 * ratio) - 1) < 1e-5, `${world} ${notes}: ${note} is ${hz.toFixed(3)} Hz, pure ${(220 * ratio).toFixed(3)}`);
        const celeste = b.detune.value - a.detune.value;
        assert.ok(celeste >= O.celeste * 0.7 - 1e-9 && celeste <= O.celeste * 1.3 + 1e-9, `${world}: celeste ${celeste}`);
        assert.ok(k === 0 ? a.startAt === 1 : a.startAt > prev, `${world}: voice ${k} enters after the one before`);
        assert.equal(b.startAt, a.startAt);
        prev = a.startAt;
      });
      assert.ok(prev - 1 > O.stagger * (expected.length - 2), `${world}: the voices are spread over time (${prev - 1}s)`);

      // 和音が変わると、古い声部は後から入ったものから一つずつ引く。まだ鳴っている途中で止めない
      const old = voices.pad.voices;
      voices._padChord([62, 65, 69, 72], 60);
      const exits = old.map((v) => {
        const last = v.amp.gain.events[v.amp.gain.events.length - 1];
        assert.equal(last.kind, 'target');
        assert.equal(last.value, 0);
        for (const o of v.oscs) assert.ok(o.stopAt >= last.time + O.release * 6, `${world}: a pipe is cut before it fades`);
        return last.time;
      });
      for (let k = 1; k < exits.length; k++) assert.ok(exits[k] < exits[k - 1], `${world}: later voices leave first`);
      assert.equal(exits[exits.length - 1], 60, `${world}: the last voice to enter leaves at once`);
      assert.ok(exits[0] - 60 > O.stagger * (exits.length - 2), `${world}: the old voices leave one by one`);
    }
  }
});

test('909 風のドラム（motor）: 手拍子は何度かはじいて最後を長く残し、ハットは金属の響きを混ぜ、キックは丸く歪ませる', () => {
  let tested = 0;
  for (const world of IDS) {
    const P = PATCHES[world];
    assert.equal(!!U.worlds.WORLDS[world].claps, !!P.perc.clap, `${world}: 手拍子を鳴らす WORLD だけが手拍子の音色を持つ`);
    if (!P.perc.clap && !P.hat.metal && !P.kick.drive) continue;
    tested++;
    const ctx = new FakeContext();
    const voices = new U.Voices(ctx, new U.core.Director({ seed: 1, world }).identity);
    if (P.perc.clap) {
      const C = P.perc.clap;
      const p0 = ctx.params.length;
      const s0 = ctx.sources.length;
      voices._clap({ step: 4, vel: 0.8 }, 2);
      const src = ctx.sources.slice(s0);
      assert.equal(src.length, 1);
      assert.equal(src[0].buffer, voices._buffer('white'));
      const amp = ctx.params.slice(p0).find((p) => p.label === 'gain.gain' && p.events.length > 0);
      assert.deepEqual(amp.events.map((e) => e.kind), Array.from({ length: C.bursts + 1 }, () => ['set', 'target']).flat());
      amp.events.forEach((e, i) => {
        const k = Math.floor(i / 2);
        if (e.kind === 'set') {
          assert.ok(Math.abs(e.time - (2 + k * C.gap)) < 1e-9, `${world}: burst ${k} at ${e.time}`);
          assert.ok(Math.abs(e.value - 0.8 * C.level) < 1e-9);
        } else assert.equal(e.value, 0);
      });
    }
    if (P.hat.metal) {
      const s0 = ctx.sources.length;
      voices._hat({ step: 2, vel: 0.7, open: true, pan: 0 }, 3);
      const src = ctx.sources.slice(s0);
      const metal = voices._buffer('metal');
      assert.deepEqual(src.map((s) => s.buffer === metal).sort(), [false, true], `${world}: noise and metal`);
      const d = metal.getChannelData(0);
      const rms = Math.sqrt(d.reduce((a, x) => a + x * x, 0) / d.length);
      assert.ok(rms > 0.2 && rms < 1, `${world}: metal rms ${rms}`);
    }
    if (P.hat.bits) {
      // 6 bit のハット: 量子化の段が 2^bits + 1 個ほどの曲線を通る
      const shapers = [];
      const make = ctx.createWaveShaper.bind(ctx);
      ctx.createWaveShaper = () => {
        const n = make();
        shapers.push(n);
        return n;
      };
      voices._hat({ step: 3, vel: 0.5, open: false, pan: 0 }, 6);
      ctx.createWaveShaper = make;
      assert.equal(shapers.length, 1, `${world}: the hat goes through a quantizer`);
      const levels = new Set(shapers[0].curve);
      assert.ok(levels.size <= 2 ** P.hat.bits + 1 && levels.size > 2 ** (P.hat.bits - 1), `${world}: ${levels.size} steps`);
    }
    if (P.bass.env) {
      // SH-101 風のベース: 音ごとのフィルターが頭で開き、閉じる
      const p0 = ctx.params.length;
      voices._bass({ step: 2, note: 36, vel: 1, len: 1.2 }, 7);
      const f = ctx.params.slice(p0).find((p) => p.label === 'biquad.frequency' && p.events.length === 2);
      assert.ok(f, `${world}: a per-note filter`);
      assert.ok(f.events[0].value > P.bass.env[0] * 2 && f.events[1].value === P.bass.env[0] && f.events[1].kind === 'target', `${world}: the filter opens at the head and closes`);
    }
    if (P.hat.choke) {
      // 次のハットが鳴ると、鳴っているオープンはそこで止まる（閉じたハットのあとのハットは何も止めない）
      const p0 = ctx.params.length;
      voices._hat({ step: 2, vel: 0.7, open: true, pan: 0 }, 5);
      const open = ctx.params.slice(p0).find((p) => p.label === 'gain.gain' && p.events.some((e) => e.kind === 'linear'));
      voices._hat({ step: 3, vel: 0.4, open: false, pan: 0 }, 5.12);
      const last = open.events[open.events.length - 1];
      assert.deepEqual([last.kind, last.value, last.time], ['target', 0, 5.12], `${world}: the open hat is choked`);
      const p1 = ctx.params.length;
      voices._hat({ step: 5, vel: 0.4, open: false, pan: 0 }, 5.25);
      assert.equal(open.events.length, 4, `${world}: an open hat is choked only once`);
      assert.ok(ctx.params.slice(p1).length > 0);
    }
    if (P.kick.drive) {
      const shapers = [];
      const make = ctx.createWaveShaper.bind(ctx);
      ctx.createWaveShaper = () => {
        const n = make();
        shapers.push(n);
        return n;
      };
      voices._kick({ step: 0, vel: 1, presence: 1, duck: 0 }, 4);
      assert.equal(shapers.length, 1, `${world}: the kick goes through a shaper`);
      const c = shapers[0].curve;
      const n = c.length - 1;
      const x = (i) => (i / n) * 2 - 1;
      const [lo, mid, q3, hi] = [0.49, 0.5, 0.75, 0.51].map((f) => Math.round(n * f));
      const slope = (c[hi] - c[lo]) / (x(hi) - x(lo));
      assert.ok(Math.abs(slope - 1) < 0.01, `${world}: quiet sound passes unchanged (slope ${slope})`);
      assert.ok(c[n] < 0.9 && c[n] > 0 && Math.abs(c[0] + c[n]) < 1e-6, `${world}: the top is rounded (${c[n]})`);
      assert.ok(c[n] - c[q3] < 0.6 * (c[q3] - c[mid]), `${world}: the curve flattens toward the top`);
    }
  }
  assert.ok(tested > 0);
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
        if (role === 'kick' && PATCHES[IDS[i]].kick.ghost && PATCHES[IDS[j]].kick.ghost) continue; // 音を出さないキックは同じでいい
        const a = JSON.stringify(PATCHES[IDS[i]][role]);
        const b = JSON.stringify(PATCHES[IDS[j]][role]);
        assert.notEqual(a, b, `${role}: ${IDS[i]} と ${IDS[j]} が同じ音色`);
      }
    }
  }
});
