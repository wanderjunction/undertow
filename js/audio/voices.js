/*
 * Undertow — Renderer（音を鳴らすだけ。音楽的な判断はしない）
 *
 * Director の小節プラン（記号）を受け取り、Web Audio のノードで音にする。
 * 0..1 の知覚的な値（bright / decay / presence）を、WORLD のパッチ（js/audio/patches.js）で Hz や秒に写す。
 */
(function (U) {
  'use strict';
  const { clamp, mtof } = U.util;
  const { derive } = U.rng;
  const { PATCHES, IMPULSES } = U.patches;

  // CALIBRATION — 全 WORLD 共通のマスター段
  const MASTER = Object.freeze({ limiter: -2.5, lowCut: 22 });

  // CALIBRATION — うねりの深さ（パッチの swell で上書きできる）。キックとベースには掛けない
  //   tone  いちばん遠いときに音楽バスのローパスが何オクターブ下がるか（近いときは開ききる）
  //   verb  残響の返りの増減（遠いほど多い）   level  音楽バスの音量の増減（近いほど大きい）
  const SWELL = Object.freeze({ open: 18000, tone: 2.5, verb: 0.3, level: 0.22 });

  // ---------------------------------------------------------------------------
  // バッファ（コンテキストごとに一度だけ作る）。種類ごとに固定 seed の stream を使うので、
  // どの順番で作っても毎回同じ音になる
  // ---------------------------------------------------------------------------
  const cache = new WeakMap();

  function shared(ctx, name, make) {
    let store = cache.get(ctx);
    if (!store) cache.set(ctx, (store = {}));
    if (!store[name]) store[name] = make(derive(0x5ea5ea, 'noise:' + name));
    return store[name];
  }

  function loopBuffer(ctx, seconds, channels, gen, r) {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const fade = Math.floor(sr * 0.25);
    const buf = ctx.createBuffer(channels, len, sr);
    for (let ch = 0; ch < channels; ch++) {
      const next = gen(r);
      const src = new Float32Array(len + fade);
      for (let i = 0; i < src.length; i++) src[i] = next();
      const out = buf.getChannelData(ch);
      out.set(src.subarray(0, len));
      // 先頭を「末尾の続き」とクロスフェードして、ループの継ぎ目を消す
      for (let i = 0; i < fade; i++) {
        const w = ((i / fade) * Math.PI) / 2;
        out[i] = src[i] * Math.sin(w) + src[len + i] * Math.cos(w);
      }
    }
    return buf;
  }

  const white = (r) => () => r.next() * 2 - 1;

  const pink = (r) => {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    return () => {
      const w = r.next() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      const p = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
      return p * 0.11;
    };
  };

  const brown = (r) => {
    let last = 0;
    return () => {
      last = (last + 0.02 * (r.next() * 2 - 1)) / 1.02;
      return last * 3.5;
    };
  };

  // レコードのかすかなノイズ: まばらな短いはじけ。ほとんどは小さく、ときどき少し大きい
  function crackleBuffer(ctx, seconds, r) {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const rate = 14 / sr; // 1 秒に 14 回ほど
    for (let i = 0; i < len - 200; i++) {
      if (r.next() >= rate) continue;
      const amp = 0.08 + 0.92 * Math.pow(r.next(), 5);
      const sign = r.next() < 0.5 ? -1 : 1;
      const n = 8 + Math.floor(r.next() * 60);
      for (let k = 0; k < n; k++) d[i + k] += sign * amp * Math.exp(-k / (n / 4)) * (r.next() * 0.6 + 0.4);
    }
    return buf;
  }

  // 残響のインパルス応答。時間とともに暗くなり、最後はぴったり無音に落ちる
  function impulse(ctx, spec, r) {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * spec.seconds);
    const pre = Math.floor(sr * spec.pre);
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const x = (i - pre) / (len - pre);
        const a = spec.bright[0] - spec.bright[1] * Math.sqrt(x);
        lp += a * (r.next() * 2 - 1 - lp);
        d[i] = (lp * Math.pow(1 - x, spec.power) * Math.min(1, x * 180)) / Math.sqrt(a);
      }
    }
    return buf;
  }

  // 0.6 までは素通し、そこから上はなめらかに頭打ち（最大でも 0.91）
  function softClip() {
    const n = 2048;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      const ax = Math.abs(x);
      c[i] = ax < 0.6 ? x : Math.sign(x) * (0.6 + 0.4 * Math.tanh((ax - 0.6) / 0.4));
    }
    return c;
  }

  function tanhCurve() {
    const n = 2048;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = Math.tanh((i / (n - 1)) * 2 - 1);
    return c;
  }

  const VOICES = { kick: 1, bass: 1, hat: 1, perc: 1, stab: 1, glint: 1, wave: 1 };

  // ---------------------------------------------------------------------------
  // Voices
  // ---------------------------------------------------------------------------
  class Voices {
    constructor(ctx, identity) {
      const P = PATCHES[identity.world];
      if (!P) throw new Error('no patch for world: ' + identity.world);
      this.ctx = ctx;
      this.id = identity;
      this.P = P;
      this.stepDur = 60 / identity.bpm / 4;
      this.r = derive(identity.seed, 'render');
      this.persistent = []; // [node, offset] — start() で鳴らし始め、dispose() で止める
      this.padOscs = new Set();
      this.pad = null;
      this.duckCurves = new Map();
      this.duckFree = 0;
      this.throwUntil = 0;
      this.feedback = P.space.feedbackStart;
      this.Sw = { ...SWELL, ...(P.swell || {}) };
      this._build();
    }

    _gain(v = 1) {
      const g = this.ctx.createGain();
      g.gain.value = v;
      return g;
    }

    _filter(type, hz, q = 0.707) {
      const f = this.ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = hz;
      f.Q.value = q;
      return f;
    }

    _panner(v) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = v;
      return p;
    }

    _send(from, amount, to) {
      const g = this._gain(amount);
      from.connect(g);
      g.connect(to);
      return g;
    }

    _buffer(name) {
      const ctx = this.ctx;
      switch (name) {
        case 'white':
          return shared(ctx, name, (r) => loopBuffer(ctx, 2, 1, white, r));
        case 'pink':
          return shared(ctx, name, (r) => loopBuffer(ctx, 11, 2, pink, r));
        case 'brown':
          return shared(ctx, name, (r) => loopBuffer(ctx, 9, 1, brown, r));
        case 'crackle':
          return shared(ctx, name, (r) => crackleBuffer(ctx, 6.5, r));
        default:
          return shared(ctx, 'ir:' + name, (r) => impulse(ctx, IMPULSES[name], r));
      }
    }

    _loop(name) {
      const s = this.ctx.createBufferSource();
      s.buffer = this._buffer(name);
      s.loop = true;
      this.persistent.push([s, this.r.range(0, s.buffer.duration)]);
      return s;
    }

    _lfo(hz, depth, ...params) {
      const o = this.ctx.createOscillator();
      o.frequency.value = hz;
      const g = this._gain(depth);
      o.connect(g);
      for (const p of params) g.connect(p);
      this.persistent.push([o, undefined]);
    }

    _build() {
      const ctx = this.ctx;
      const P = this.P;
      const M = P.mix;
      const S = P.space;
      const chain = (...n) => {
        for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]);
        return n[n.length - 1];
      };

      // 出力段: mix → 超低域カット → リミッタ → ソフトクリップ → フェードイン → フェードアウト
      this.fadeIn = this._gain(0);
      this.out = this._gain(1);
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = MASTER.limiter;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.12;
      const clip = ctx.createWaveShaper();
      clip.curve = softClip();
      clip.oversample = '2x';
      this.mix = this._gain(1);
      chain(this.mix, this._filter('highpass', MASTER.lowCut, 0.5), limiter, clip, this.fadeIn, this.out);

      // キックに合わせて呼吸する音楽バス（キックとベース以外が通る）
      this.duck = this._gain(1);
      this.music = this._gain(1);
      this.swellTone = this._filter('lowpass', this.Sw.open, 0.5);
      this.swellLevel = this._gain(1);
      chain(this.music, this.swellTone, this.swellLevel, this.duck, this.mix);

      // 残響
      this.verb = this._gain(1);
      const conv = ctx.createConvolver();
      conv.buffer = this._buffer(S.ir);
      chain(this.verb, this._filter('highpass', S.verbBand[0]), this._filter('lowpass', S.verbBand[1]), conv, this._gain(M.verbReturn), (this.swellVerb = this._gain(1)), this.music);

      // ピンポン・ディレイ。帰り道で音が細く、暗くなっていく（tape > 0 ならテープのように軽く歪む）
      this.dly = this._gain(1);
      const time = this.stepDur * this.id.delaySteps;
      const dl = ctx.createDelay(4);
      const dr = ctx.createDelay(4);
      for (const d of [dl, dr]) {
        d.delayTime.value = time;
        d.channelCount = 1;
        d.channelCountMode = 'explicit';
      }
      this.fb = [this._gain(this.feedback), this._gain(this.feedback)];
      const loop = (from, fb, to) => {
        const nodes = [from, this._filter('highpass', S.dlyBand[0]), this._filter('lowpass', S.dlyBand[1], S.dlyLpQ)];
        if (S.tape > 0) {
          const shaper = ctx.createWaveShaper();
          shaper.curve = tanhCurve();
          nodes.push(this._gain(S.tape), shaper, this._gain(1 / S.tape));
        }
        chain(...nodes, fb, to);
      };
      loop(dl, this.fb[0], dr);
      loop(dr, this.fb[1], dl);
      this.dly.connect(dl);
      const dlyOut = this._gain(M.dlyReturn);
      chain(dl, this._panner(-S.pan), dlyOut);
      chain(dr, this._panner(S.pan), dlyOut);
      dlyOut.connect(this.music);
      this._send(dlyOut, M.dlyVerb, this.verb);
      this._lfo(S.wow[0], S.wow[1], dl.delayTime, dr.delayTime); // テープの揺れ

      // 楽器ごとのバス
      this.kickBus = this._gain(M.kick);
      this.kickBus.connect(this.mix);

      // ベース: 軽く歪ませて倍音を足す（小さなスピーカーでも輪郭が聞こえるように）→ 音量 → ローパス
      this.bassBus = this._gain(1);
      const shaper = ctx.createWaveShaper();
      shaper.curve = tanhCurve();
      shaper.oversample = '2x';
      chain(this.bassBus, this._gain(P.bass.drive), shaper, this._gain(M.bass), this._filter('lowpass', P.bass.lp, P.bass.lpQ), this.mix);

      this.hatBus = this._gain(1);
      this._send(this.hatBus, M.hats, this.music);
      this._send(this.hatBus, M.hatsVerb, this.verb);

      this.percBus = this._gain(1);
      this._send(this.percBus, M.perc, this.music);
      this._send(this.percBus, M.percDly, this.dly);
      this._send(this.percBus, M.percVerb, this.verb);

      this.stabBus = this._gain(1);
      this._send(this.stabBus, M.stabDry, this.music);
      this.stabSend = this._send(this.stabBus, M.stabDly, this.dly);
      this._send(this.stabBus, M.stabVerb, this.verb);

      this.glintBus = this._gain(1);
      this._send(this.glintBus, M.glint, this.music);
      this._send(this.glintBus, M.glintVerb, this.verb);
      this._send(this.glintBus, M.glintDly, this.dly);

      this.fxBus = this._gain(1);
      this._send(this.fxBus, M.riser, this.music);
      this._send(this.fxBus, M.riserVerb, this.verb);

      // パッド: 共通のローパス（ゆっくり揺れる）→ 呼吸 → 層の存在感
      const D = P.pad;
      this.padFilter = this._filter('lowpass', D.lp, D.lpQ);
      const breath = this._gain(1);
      this.padLevel = this._gain(0);
      chain(this.padFilter, breath, this.padLevel);
      this._send(this.padLevel, M.padDry, this.music);
      this._send(this.padLevel, M.padVerb, this.verb);
      this._lfo(D.lfo[0], D.lfo[1], this.padFilter.frequency);
      this._lfo(D.breath[0], D.breath[1], breath.gain);

      // 波（質感の層）: レーンごとのピンクノイズの寄せ返し、砕ける泡、遠い海鳴り、レコードのノイズ。
      // shimmer の WORLD（moon）はノイズを使わず、波ひとつごとに和音の音を鳴らす（_wave で作る）
      const WV = P.waves;
      this.wavesLevel = this._gain(0);
      this._send(this.wavesLevel, M.waves, this.music);
      this._send(this.wavesLevel, M.wavesVerb, this.verb);
      if (WV.shimmer) {
        this.lanes = WV.lanes.map((pan) => {
          const p = this._panner(pan);
          p.connect(this.wavesLevel);
          return { pan: p };
        });
      } else {
        const foamTone = WV.foam > 0 ? chain(this._loop('white'), this._filter('highpass', WV.foamBand[0]), this._filter('lowpass', WV.foamBand[1])) : null;
        this.lanes = WV.lanes.map((pan) => {
          const lp = this._filter('lowpass', WV.lpBase, WV.lpQ);
          const body = this._gain(0.02);
          const p = this._panner(pan);
          chain(this._loop('pink'), this._filter('highpass', WV.hp), lp, body, p);
          let foam = null;
          if (foamTone) {
            foam = this._gain(0);
            chain(foamTone, foam, p);
          }
          p.connect(this.wavesLevel);
          return { lp, body, foam };
        });
        chain(this._loop('brown'), this._filter('lowpass', WV.rumbleLp), this._gain(WV.rumble), this.wavesLevel);
        if (WV.crackle > 0) {
          chain(this._loop('crackle'), this._filter('highpass', 1000), this._filter('lowpass', 6000), this._gain(WV.crackle), this.wavesLevel);
        }
      }
    }

    connect(dest) {
      this.out.connect(dest);
    }

    start(t0) {
      for (const [node, offset] of this.persistent) {
        if (offset === undefined) node.start(t0);
        else node.start(t0, offset);
      }
      this.fadeIn.gain.setValueAtTime(0, t0);
      this.fadeIn.gain.linearRampToValueAtTime(1, t0 + 2.5);
    }

    stop(t, fade) {
      this.out.gain.setValueAtTime(1, t);
      this.out.gain.linearRampToValueAtTime(0, t + fade);
    }

    dispose() {
      for (const [node] of this.persistent) {
        try {
          node.stop();
        } catch (e) {
          /* まだ始まっていないノード */
        }
      }
      for (const o of this.padOscs) {
        try {
          o.stop();
        } catch (e) {
          /* 同上 */
        }
      }
      this.padOscs.clear();
      this.out.disconnect();
    }

    // 1 小節ぶんのプランを、barTime を頭にして予約する
    render(plan, barTime, now) {
      const sd = this.stepDur;
      const controls = plan.controls.slice().sort((a, b) => a.step - b.step);
      for (const c of controls) this._control(c, Math.max(barTime + c.step * sd, now));
      for (const e of plan.events) {
        const t = barTime + e.step * sd;
        if (t < now || !VOICES[e.voice]) continue; // 間に合わなかった音は、まとめて鳴らさずに捨てる
        this['_' + e.voice](e, t);
      }
    }

    _control(c, t) {
      switch (c.kind) {
        case 'level': {
          const g = c.part === 'pad' ? this.padLevel : this.wavesLevel;
          g.gain.setTargetAtTime(c.value, t, Math.max(0.05, (c.steps * this.stepDur) / 3));
          break;
        }
        case 'pad':
          this._padChord(c.notes, t);
          break;
        case 'space':
          if (t >= this.throwUntil) for (const g of this.fb) g.gain.setTargetAtTime(c.feedback, t, 1.5);
          this.feedback = c.feedback;
          break;
        case 'throw':
          this._throw(t, c.bars);
          break;
        case 'riser':
          this._riser(t, c.steps * this.stepDur);
          break;
        case 'swell':
          this._swell(c.value, t);
          break;
      }
    }

    // うねり: 近い（+1）ほど明るく・大きく・乾き、遠い（-1）ほど暗く・小さく・湿る。1 小節かけて滑らかに寄せる
    _swell(x, t) {
      const Sw = this.Sw;
      const far = (1 - clamp(x, -1, 1)) / 2;
      const tc = this.stepDur * 16 / 2;
      this.swellTone.frequency.setTargetAtTime(Sw.open * Math.pow(2, -Sw.tone * far), t, tc);
      this.swellLevel.gain.setTargetAtTime(1 + Sw.level * x, t, tc);
      this.swellVerb.gain.setTargetAtTime(1 - Sw.verb * x, t, tc);
    }

    // キックが鳴るたび、音楽バスを一瞬沈めて戻す（サイドチェインの呼吸）
    _duck(t, depth) {
      if (t < this.duckFree) return;
      const dur = Math.min(0.4, this.stepDur * 4 * 0.8);
      const q = Math.round(clamp(depth, 0, 0.8) * 40);
      let curve = this.duckCurves.get(q);
      if (!curve) {
        const { attack, release } = this.P.duck;
        const d = q / 40;
        const n = 96;
        curve = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * dur;
          const dip = Math.min(1, x / attack) * Math.exp(-Math.max(0, x - attack) / release);
          const w = Math.pow(i / (n - 1), 6); // 最後はぴったり 1 に戻す
          curve[i] = (1 - d * dip) * (1 - w) + w;
        }
        this.duckCurves.set(q, curve);
      }
      try {
        this.duck.gain.setValueCurveAtTime(curve, t, dur);
        this.duckFree = t + dur + 0.001;
      } catch (e) {
        /* 予定が重なったときは今回の呼吸を見送る */
      }
    }

    _kick(e, t) {
      const ctx = this.ctx;
      const K = this.P.kick;
      // ゴースト・キック: 音は出さず、拍ごとの呼吸（サイドチェイン）だけを動かす
      if (K.ghost) {
        if (e.duck > 0.02) this._duck(t, e.duck);
        return;
      }
      const hz = mtof(this.id.kickNote);
      const p = e.presence;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(hz * K.sweep, t);
      o.frequency.exponentialRampToValueAtTime(hz * K.mid, t + K.t1);
      o.frequency.exponentialRampToValueAtTime(hz, t + K.t2);
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(e.vel * (K.floor + (1 - K.floor) * p), t + K.attack);
      amp.gain.setTargetAtTime(0, t + K.decayAt, K.decay);
      // 存在感が低いほど暗い（水面下の鼓動 → 水面へ）
      const lp = this._filter('lowpass', K.lpMin * Math.pow(K.lpRange, p), K.lpQ);
      o.connect(amp).connect(lp).connect(this.kickBus);
      o.start(t);
      o.stop(t + K.len);
      if (K.click > 0 && p > K.clickFrom) {
        const n = ctx.createBufferSource();
        n.buffer = this._buffer('white');
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0, t);
        ng.gain.linearRampToValueAtTime(K.click * e.vel * p, t + 0.001);
        ng.gain.setTargetAtTime(0, t + 0.002, 0.006);
        n.connect(this._filter('bandpass', K.clickHz, 0.8)).connect(ng).connect(lp);
        n.start(t, this.r.range(0, 1.8), 0.05);
      }
      if (e.duck > 0.02) this._duck(t, e.duck);
    }

    _bass(e, t) {
      const ctx = this.ctx;
      const B = this.P.bass;
      const hz = mtof(e.note);
      const dur = e.len * this.stepDur;
      const oscs = [];
      const amp = ctx.createGain();
      const o = ctx.createOscillator();
      o.frequency.value = hz;
      o.connect(amp);
      oscs.push(o);
      if (B.tri > 0) {
        const o2 = ctx.createOscillator();
        o2.type = 'triangle';
        o2.frequency.value = hz;
        o2.detune.value = B.triDetune;
        o2.connect(this._gain(B.tri)).connect(amp);
        oscs.push(o2);
      }
      if (B.saw > 0) {
        const o3 = ctx.createOscillator();
        o3.type = 'sawtooth';
        o3.frequency.value = hz;
        o3.connect(this._gain(B.saw)).connect(amp);
        oscs.push(o3);
      }
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(e.vel, t + B.attack);
      amp.gain.setTargetAtTime(e.vel * B.sustain, t + B.attack + 0.004, dur * 0.5);
      amp.gain.setTargetAtTime(0, t + dur, B.release);
      amp.connect(this.bassBus);
      const end = t + dur + 0.2;
      for (const x of oscs) {
        x.start(t);
        x.stop(end);
      }
    }

    // ハット: ノイズの帯域を絞る（パッチで帯域と減衰が変わる）
    _hat(e, t) {
      const ctx = this.ctx;
      const H = this.P.hat;
      const k = e.open ? 1 : 0;
      const src = ctx.createBufferSource();
      src.buffer = this._buffer('white');
      const pk = this._filter('peaking', H.pk[k], H.pkQ);
      pk.gain.value = H.pkGain;
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(e.vel, t + H.attack);
      amp.gain.setTargetAtTime(0, t + H.attack + 0.0005, H.decay[k]); // 減衰はアタックが終わってから
      src
        .connect(this._filter('highpass', H.hp[k], H.hpQ))
        .connect(this._filter('lowpass', H.lp[k], H.lpQ))
        .connect(pk)
        .connect(amp)
        .connect(this._panner(e.pan))
        .connect(this.hatBus);
      const len = H.len[k];
      src.start(t, this.r.range(0, 1.9 - len), len);
    }

    _perc(e, t) {
      const ctx = this.ctx;
      const C = this.P.perc;
      const hz = mtof(e.note + C.octave);
      const o = ctx.createOscillator();
      o.type = C.wave;
      o.frequency.setValueAtTime(hz * C.drop, t);
      o.frequency.exponentialRampToValueAtTime(hz, t + C.dropTime);
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(e.vel, t + C.attack);
      amp.gain.setTargetAtTime(0, t + C.attack + 0.001, C.decay);
      const pan = this._panner(e.pan);
      o.connect(this._filter('bandpass', hz * C.bpMul, C.bpQ)).connect(amp).connect(pan).connect(this.percBus);
      o.start(t);
      o.stop(t + C.len);
      if (C.noise > 0) {
        // リムショットの「カッ」: 帯域を絞ったノイズの一瞬
        const n = ctx.createBufferSource();
        n.buffer = this._buffer('white');
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0, t);
        ng.gain.linearRampToValueAtTime(C.noise * e.vel, t + 0.0008);
        ng.gain.setTargetAtTime(0, t + 0.0015, C.noiseDecay);
        n.connect(this._filter('bandpass', C.noiseHz, C.noiseQ)).connect(ng).connect(pan);
        n.start(t, this.r.range(0, 1.8), 0.08);
      }
    }

    // 和音を一瞬だけ開くスタブ。波形・レゾナンス・減衰はパッチ次第
    _stab(e, t) {
      const ctx = this.ctx;
      const S = this.P.stab;
      const cutoff = S.cutMin * Math.pow(S.cutRange, e.bright);
      const tau = S.tauMin * Math.pow(S.tauRange, e.decay);
      const sum = this._gain(1 / e.notes.length);
      const oscs = [];
      for (const n of e.notes) {
        const hz = mtof(n);
        for (const sign of [-1, 1]) {
          const o = ctx.createOscillator();
          o.type = S.wave;
          o.frequency.value = hz;
          o.detune.value = sign * this.id.stabDetune + this.r.range(-S.jitter, S.jitter);
          o.connect(sum);
          oscs.push(o);
        }
      }
      const lp = this._filter('lowpass', cutoff, S.q);
      lp.frequency.setValueAtTime(Math.min(cutoff * (S.env[0] + S.env[1] * e.vel), S.envMax), t);
      lp.frequency.setTargetAtTime(cutoff, t + 0.002, S.envTau + tau * 0.25);
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(e.vel, t + S.attack);
      amp.gain.setTargetAtTime(0, t + S.decayAt, tau);
      sum.connect(lp).connect(this._filter('highpass', S.hp, 0.5)).connect(amp).connect(this.stabBus);
      const end = t + Math.max(0.02, S.decayAt) + tau * S.tail;
      for (const o of oscs) {
        // spread > 0: 鳴り始めを少しずつずらし、全員が同じ位相で重なる一瞬の尖りを避ける
        o.start(S.spread > 0 ? t + this.r.range(0, S.spread) : t);
        o.stop(end);
      }
    }

    // 和音が変わるたび、古いパッドをゆっくり退かせて新しいパッドを満たす
    _padChord(notes, t) {
      const ctx = this.ctx;
      const D = this.P.pad;
      if (this.pad) {
        this.pad.amp.gain.setTargetAtTime(0, t, D.release);
        for (const o of this.pad.oscs) o.stop(t + Math.max(14, D.release * 6.5));
      }
      const amp = this._gain(0);
      amp.gain.setValueAtTime(0, t);
      amp.gain.setTargetAtTime(1, t, D.attack);
      const oscs = [];
      notes.forEach((n, i) => {
        const voice = this._gain(1 / notes.length);
        for (const [type, detune, octave, gain] of D.osc) {
          const o = ctx.createOscillator();
          o.type = type;
          o.frequency.value = mtof(n + octave);
          o.detune.value = detune + this.r.range(-D.jitter, D.jitter);
          if (gain === 1) o.connect(voice);
          else o.connect(this._gain(gain)).connect(voice);
          o.start(t);
          o.onended = () => this.padOscs.delete(o);
          this.padOscs.add(o);
          oscs.push(o);
        }
        const pan = notes.length > 1 ? (i / (notes.length - 1)) * D.spread - D.spread / 2 : 0;
        voice.connect(this._panner(pan)).connect(amp);
      });
      amp.connect(this.padFilter);
      this.pad = { amp, oscs };
    }

    // シンギングボウル（calm）: 実際のボウルに近い比率の倍音を、わずかにずらした 2 本の組で重ねる。
    // 組の 2 本は左右に分かれてゆっくりうなり、高い倍音ほど早く消えるので、叩いた瞬間は明るく、だんだん澄んだ響きだけが残る
    _bowl(e, t, B) {
      const ctx = this.ctx;
      const f0 = mtof(e.note);
      const out = this._gain(e.vel);
      out.connect(this.glintBus);
      for (const [ratio, amp, tau] of B.partials) {
        const beat = this.r.range(B.beat[0], B.beat[1]); // うなりの速さ（Hz）
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(amp, t + B.attack);
        env.gain.setTargetAtTime(0, t + B.attack + 0.001, tau);
        env.connect(out);
        const stop = t + B.attack + tau * 4.5;
        for (const side of [-1, 1]) {
          const o = ctx.createOscillator();
          o.frequency.value = f0 * ratio + (side * beat) / 2;
          // 組の 2 本は強さを変える（同じだと、左右がまとまる環境でうなりの谷に音が消えきってしまう）
          o.connect(this._gain(side < 0 ? 1 : B.pair)).connect(this._panner(clamp(e.pan + side * B.width, -1, 1))).connect(env);
          o.start(t);
          o.stop(stop);
        }
      }
      if (B.strike > 0) {
        // マレットの「コン」: ごく短く、柔らかく
        const n = ctx.createBufferSource();
        n.buffer = this._buffer('white');
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(B.strike * e.vel, t + 0.002);
        g.gain.setTargetAtTime(0, t + 0.003, 0.012);
        n.connect(this._filter('lowpass', B.strikeLp, 0.7)).connect(g).connect(this.glintBus);
        n.start(t, this.r.range(0, 1.8), 0.1);
      }
    }

    // 小さな FM ベル（bowl を持つ WORLD はボウルで鳴らす）
    _glint(e, t) {
      const ctx = this.ctx;
      const G = this.P.glint;
      if (G.bowl) {
        this._bowl(e, t, G.bowl);
        return;
      }
      const hz = mtof(e.note);
      const c = ctx.createOscillator();
      c.frequency.value = hz;
      const m = ctx.createOscillator();
      m.frequency.value = hz * (G.ratio || this.id.glintRatio); // ratio を持つ WORLD（calm のボウル）は倍率を固定
      const index = ctx.createGain();
      index.gain.setValueAtTime(hz * G.index, t);
      index.gain.setTargetAtTime(hz * G.indexEnd, t, G.indexTau);
      m.connect(index).connect(c.frequency);
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(e.vel, t + G.attack);
      amp.gain.setTargetAtTime(0, t + G.decayAt, G.decay);
      c.connect(amp).connect(this._panner(e.pan)).connect(this.glintBus);
      const end = t + G.len;
      c.start(t);
      m.start(t);
      c.stop(end);
      m.stop(end);
    }

    // 波がひとつ寄せて（砕けて）、引いていく
    _wave(e, t) {
      const lane = this.lanes[e.lane];
      if (!lane) return;
      const WV = this.P.waves;
      const rise = e.rise * this.stepDur;
      const fall = e.fall * this.stepDur;
      if (WV.shimmer) {
        // 水面の光: 和音の音が澄んだサイン波で、波と同じようにゆっくり満ちて、ゆっくり消える
        if (!e.notes || !e.notes.length) return;
        const amp = this.ctx.createGain();
        amp.gain.setValueAtTime(0, t);
        amp.gain.setTargetAtTime(e.peak, t, rise / 2.5);
        amp.gain.setTargetAtTime(0, t + rise, fall / 3);
        amp.connect(lane.pan);
        const end = t + rise + fall * 1.6;
        for (const n of e.notes) {
          for (const [detune, ratio, gain] of WV.shimmer.partials) {
            const o = this.ctx.createOscillator();
            o.frequency.value = mtof(n) * ratio;
            o.detune.value = detune;
            o.connect(this._gain(gain / e.notes.length)).connect(amp);
            o.start(t);
            o.stop(end);
          }
        }
        return;
      }
      lane.body.gain.setTargetAtTime(e.peak, t, rise / 2.5);
      lane.body.gain.setTargetAtTime(WV.floor * e.peak + 0.02, t + rise, fall / 3);
      lane.lp.frequency.setTargetAtTime(WV.lpBase + 40 + WV.lpPeak * e.peak, t, rise / 2.2);
      lane.lp.frequency.setTargetAtTime(WV.lpBase, t + rise, fall / 2.5);
      if (lane.foam) {
        const crest = t + rise * 0.85;
        lane.foam.gain.setTargetAtTime(WV.foam * e.peak, crest, 0.25);
        lane.foam.gain.setTargetAtTime(0, crest + 0.6, 0.9);
      }
    }

    // ダブ・スロー: 一打だけディレイへ深く投げ込み、しばらく反響を長く残す
    _throw(t, bars) {
      const len = bars * 16 * this.stepDur;
      const T = this.P.throw;
      const M = this.P.mix;
      for (const g of this.fb) {
        g.gain.setTargetAtTime(T.feedback, t, 0.03);
        g.gain.setTargetAtTime(this.feedback, t + len, 0.8);
      }
      this.stabSend.gain.setTargetAtTime(M.stabDly * T.send, t - 0.01, 0.004);
      this.stabSend.gain.setTargetAtTime(M.stabDly, t + 0.25, 0.08);
      this.throwUntil = t + len;
    }

    _riser(t, dur) {
      const ctx = this.ctx;
      const R = this.P.riser;
      const src = ctx.createBufferSource();
      src.buffer = this._buffer('white');
      src.loop = true;
      const bp = this._filter('bandpass', R.from, R.q);
      bp.frequency.setValueAtTime(R.from, t);
      bp.frequency.exponentialRampToValueAtTime(R.to, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(1, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + 0.06);
      src.connect(bp).connect(g).connect(this.fxBus);
      src.start(t, this.r.range(0, 1.5));
      src.stop(t + dur + 0.1);
    }
  }

  U.Voices = Voices;
})((globalThis.Undertow = globalThis.Undertow || {}));
