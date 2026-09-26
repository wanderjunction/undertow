/*
 * Undertow — Renderer（音を鳴らすだけ。音楽的な判断はしない）
 *
 * Director の小節プラン（記号）を受け取り、Web Audio のノードで音にする。
 * 0..1 の知覚的な値（bright / decay / presence）を、WORLD のパッチ（js/audio/patches.js）で Hz や秒に写す。
 */
(function (U) {
  'use strict';
  const { clamp, mtof, mod } = U.util;
  const { derive } = U.rng;
  const { PATCHES, IMPULSES } = U.patches;

  // CALIBRATION — 全 WORLD 共通のマスター段
  const MASTER = Object.freeze({ limiter: -2.5, lowCut: 22 });

  // CALIBRATION — うねりの深さ（パッチの swell で上書きできる）。キックとベースには掛けない
  //   tone  いちばん遠いときに音楽バスのローパスが何オクターブ下がるか（近いときは開ききる）
  //   verb  残響の返りの増減（遠いほど多い）   level  音楽バスの音量の増減（近いほど大きい）
  const SWELL = Object.freeze({ open: 18000, tone: 2.5, verb: 0.3, level: 0.22 });

  // 純正な音程（半音の数 mod 12 → [周波数の比, 合わせやすさ]）。合わせやすさは小さいほど先に合わせる:
  // オクターブ、完全 5 度・4 度、長 3 度・短 6 度、短 3 度・長 6 度、長 2 度・短 7 度、半音・長 7 度、三全音
  const PURE = Object.freeze(
    [[1, 0], [16 / 15, 5], [9 / 8, 4], [6 / 5, 3], [5 / 4, 2], [4 / 3, 1], [45 / 32, 6], [3 / 2, 1], [8 / 5, 2], [5 / 3, 3], [16 / 9, 4], [15 / 8, 5]]
      .map(([ratio, rank], semis) => Object.freeze([1200 * Math.log2(ratio) - 100 * semis, rank])), // [平均律からのずれ（セント）, 合わせやすさ]
  );

  // 和音を純正律で合わせる（オルガンのドローン）: いちばん低い声部を平均律の高さに置き、すでに合わせた声部と最も合わせやすい
  // 音程を持つ声部を一つずつ選んで、その声部に対して純正な高さにする（オルガン奏者が一声ずつ足していくように）。
  // どの和音でも、選んだ音程はすべて純正になる（5 度の積み重ねが 3 度とぶつかるときは、5 度を優先する）。返すのは合わせた順の [音, セント]
  function justTune(notes) {
    const done = [[notes[0], 0]];
    const left = notes.slice(1);
    while (left.length) {
      let best = null;
      for (const n of left) {
        for (const [m, c] of done) {
          const [cents, rank] = PURE[mod(n - m, 12)];
          if (!best || rank < best.rank || (rank === best.rank && n < best.n)) best = { n, rank, cents: c + cents };
        }
      }
      done.push([best.n, best.cents]);
      left.splice(left.indexOf(best.n), 1);
    }
    return done;
  }

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

  // 金属の響き（808 のハットとシンバル）: 周波数の比が整数にならない 6 本の矩形波を足す。高い帯域だけを通すと、
  // ノイズとはちがう「チッ」「チーッ」という金属の音になる。矩形波は帯域を制限して（ナイキストの手前までの奇数倍音で）作る
  const METAL = Object.freeze([205.3, 304.4, 369.6, 522.7, 540, 800]);
  function metalBuffer(ctx, seconds, r) {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (const f of METAL) {
      const phase = r.next() * 2 * Math.PI;
      for (let k = 1; k * f < sr * 0.45; k += 2) {
        const a = 4 / Math.PI / k / METAL.length;
        const w = (2 * Math.PI * k * f) / sr;
        const cw = Math.cos(w);
        const sw = Math.sin(w);
        let s = Math.sin(phase * k);
        let c = Math.cos(phase * k);
        for (let i = 0; i < len; i++) {
          d[i] += a * s;
          const s2 = s * cw + c * sw; // 毎サンプル sin を呼ばずに、回転で進める
          c = c * cw - s * sw;
          s = s2;
        }
      }
    }
    return buf;
  }

  // 歪み（キック）: 入力 -1..1 を tanh(k·x) / k へ。小さい音はそのまま（傾き 1）、大きい音ほど頭が丸く潰れて倍音が増える
  const driveCurves = new Map();
  function driveCurve(k) {
    if (!driveCurves.has(k)) {
      const n = 2048;
      const c = new Float32Array(n);
      for (let i = 0; i < n; i++) c[i] = Math.tanh(k * ((i / (n - 1)) * 2 - 1)) / k;
      driveCurves.set(k, c);
    }
    return driveCurves.get(k);
  }

  // 量子化（909 のハットとシンバルは 6 bit のサンプルで、ざらついている）: 入力 -1..1 を bits ビットの段に丸める
  const quantizeCurves = new Map();
  function quantizeCurve(bits) {
    if (!quantizeCurves.has(bits)) {
      const n = 4096;
      const q = 2 ** (bits - 1);
      const c = new Float32Array(n);
      for (let i = 0; i < n; i++) c[i] = Math.round(((i / (n - 1)) * 2 - 1) * q) / q;
      quantizeCurves.set(bits, c);
    }
    return quantizeCurves.get(bits);
  }

  function tanhCurve() {
    const n = 2048;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = Math.tanh((i / (n - 1)) * 2 - 1);
    return c;
  }

  // 撥弦（Karplus–Strong）: 弦の長さぶんの遅れで、弾いた瞬間のノイズを何度も折り返す。
  // 折り返すたびに隣どうしを平均して角を丸めるので、高い倍音から先に消えて、弦らしく丸くなっていく。
  // Web Audio の遅延の輪は約 3 ms より短くできず高い弦を作れないので、音ごとに一度だけ計算して使い回す（録音ではない）
  // variant: 同じ弦でも弾くたびに少しずつ違う音にするための版（ノイズと指先の柔らかさが違う）。
  // ナイロン弦の音は 8 kHz より上をほとんど持たないので、半分のサンプルレートで作ってメモリと計算を節約する
  function pluckBuffer(ctx, midi, G, variant) {
    const soft = clamp(G.soft + (variant - (G.variants - 1) / 2) * G.softSpread, 0, 0.95);
    const key = 'pluck:' + midi + ':' + variant + ':' + [soft, G.pluckPos, G.t60[0], G.t60[1], G.len, G.rate].join(',');
    return shared(ctx, key, (r) => {
      const sr = Math.min(ctx.sampleRate, G.rate);
      const f = mtof(midi);
      const len = Math.round(sr * G.len);
      const buf = ctx.createBuffer(1, len, sr);
      const out = buf.getChannelData(0);
      // 平均が半サンプル遅らせるぶんを引き、残りの端数は 1 次のオールパスで合わせる（和音で音程がずれないように）
      const period = sr / f - 0.5;
      let N = Math.floor(period);
      let frac = period - N;
      if (frac < 0.1) {
        N -= 1;
        frac += 1;
      }
      const C = (1 - frac) / (1 + frac);
      // 余韻: 低い弦ほど長い（60 dB 下がるまでの秒数を、音程で補間）
      const k = clamp((midi - 40) / 40, 0, 1);
      const rho = Math.pow(10, -3 / ((G.t60[0] + (G.t60[1] - G.t60[0]) * k) * f));
      // 弾いた瞬間: ノイズを指先の柔らかさで丸め（ナイロン弦）、弾く位置の櫛形で倍音を間引く
      const exc = new Float32Array(N);
      let lp = 0;
      for (let i = 0; i < N; i++) {
        lp += (1 - soft) * (r.range(-1, 1) - lp);
        exc[i] = lp;
      }
      const P = Math.max(1, Math.round(N * G.pluckPos));
      const line = new Float32Array(N);
      let mean = 0;
      for (let i = 0; i < N; i++) {
        line[i] = exc[i] - (i >= P ? exc[i - P] : 0);
        mean += line[i] / N;
      }
      let peak = 0;
      for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs((line[i] -= mean)));
      for (let i = 0; i < N; i++) line[i] /= peak || 1;
      let idx = 0;
      let prev = 0;
      let apX = 0;
      let apY = 0;
      for (let n = 0; n < len; n++) {
        const cur = line[idx];
        out[n] = cur;
        const avg = rho * 0.5 * (cur + prev);
        prev = cur;
        const y = C * avg + apX - C * apY;
        apX = avg;
        apY = y;
        line[idx] = y;
        idx = idx + 1 === N ? 0 : idx + 1;
      }
      return buf;
    });
  }

  const VOICES = { kick: 1, bass: 1, hat: 1, perc: 1, clap: 1, stab: 1, glint: 1, wave: 1 };

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
      this.lastPluck = -1; // ギターの単音で、直前に使った波形の版
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
        case 'metal':
          return shared(ctx, name, (r) => metalBuffer(ctx, 2, r));
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
      const bassOut = this._filter('lowpass', P.bass.lp, P.bass.lpQ);
      chain(this.bassBus, this._gain(P.bass.drive), shaper, this._gain(M.bass), bassOut, this.mix);
      // ベースもディレイと残響へ送る WORLD（float: 漂うアシッド）
      if (M.bassDly) this._send(bassOut, M.bassDly, this.dly);
      if (M.bassVerb) this._send(bassOut, M.bassVerb, this.verb);

      this.hatBus = this._gain(1);
      this._send(this.hatBus, M.hats, this.music);
      this._send(this.hatBus, M.hatsVerb, this.verb);

      this.percBus = this._gain(1);
      this._send(this.percBus, M.perc, this.music);
      this._send(this.percBus, M.percDly, this.dly);
      this._send(this.percBus, M.percVerb, this.verb);

      this.stabBus = this._gain(1);
      if (P.stab.guitar) {
        // ギターの胴の響き: 低い空気の共鳴と表板のふくらみ。耳に痛い帯域を少し下げ、ベースとぶつかる最低域は切る
        const G = P.stab.guitar;
        const body = G.body.map(([hz, q, gain]) => {
          const b = this._filter('peaking', hz, q);
          b.gain.value = gain;
          return b;
        });
        this.guitarBody = this._filter('highpass', G.hp, 0.5);
        chain(this.guitarBody, ...body, this.stabBus);
        this.guitarStrings = []; // 弦ごとに、いま鳴っている音（弾き直すと前の音を止める）
      }
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
      if (K.drive) {
        // 909 風: 頭を丸く潰して、胴の太さと押し出しを足す
        const shaper = ctx.createWaveShaper();
        shaper.curve = driveCurve(K.drive);
        o.connect(amp).connect(shaper).connect(lp).connect(this.kickBus);
      } else {
        o.connect(amp).connect(lp).connect(this.kickBus);
      }
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
      if (B.acid) return this._acid(e, t, B.acid);
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
      if (B.env) {
        // SH-101 風（motor）: 音の頭だけフィルターが開いて「ポッ」と鳴り、すぐ丸く閉じる
        const [base, open, tau, q] = B.env;
        const lp = this._filter('lowpass', base, q);
        lp.frequency.setValueAtTime(base * open * (0.6 + 0.4 * e.vel), t);
        lp.frequency.setTargetAtTime(base, t + 0.002, tau);
        amp.connect(lp).connect(this.bassBus);
      } else {
        amp.connect(this.bassBus);
      }
      const end = t + dur + 0.2;
      for (const x of oscs) {
        x.start(t);
        x.stop(end);
      }
    }

    // アシッド（TB-303 風）: 鋸歯状波 1 本を、共鳴の強いローパスで一音ごとに開いて閉じる。
    // アクセントの音はフィルターがより開き、共鳴が強く、閉じるのが速い。from のある音は前の音程から滑って入る
    _acid(e, t, A) {
      const ctx = this.ctx;
      const hz = mtof(e.note);
      const dur = e.len * this.stepDur;
      const accent = e.vel > A.accentAt;
      const o = ctx.createOscillator();
      o.type = A.wave;
      if (e.from !== undefined) {
        o.frequency.setValueAtTime(mtof(e.from), t);
        o.frequency.exponentialRampToValueAtTime(hz, t + A.glide);
      } else {
        o.frequency.setValueAtTime(hz, t);
      }
      const cut = A.cutMin * Math.pow(A.cutRange, e.cut === undefined ? 0.5 : e.cut);
      const lp = this._filter('lowpass', cut, A.q + (accent ? A.accentQ : 0));
      lp.frequency.setValueAtTime(Math.min(cut * (accent ? A.envAccent : A.env), A.envMax), t);
      lp.frequency.setTargetAtTime(cut, t + 0.002, accent ? A.decayAccent : A.decay);
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(e.vel * (accent ? A.accentGain : 1), t + A.attack);
      amp.gain.setTargetAtTime(0, t + Math.max(dur, A.attack + 0.001), A.release);
      o.connect(lp).connect(amp).connect(this.bassBus);
      o.start(t);
      o.stop(t + dur + A.release * 8);
    }

    // ハット: ノイズの帯域を絞る（パッチで帯域と減衰が変わる）。metal を持つパッチ（motor）は、
    // 808 の金属の響きを主にして、ノイズを少し混ぜる（metal = [金属の量, ノイズの量]。ドラムマシンらしい「チッ」「チーッ」）。
    // 金属の響きは低い基音が強いので、混ぜる前にも高域だけを通す。choke を持つパッチは、次のハットが鳴ると
    // 鳴っているオープンを choke 秒で止める（ドラムマシンのハットは一つの声なので、オープンは次の一打で切れる）
    _hat(e, t) {
      const ctx = this.ctx;
      const H = this.P.hat;
      const k = e.open ? 1 : 0;
      if (e.ride) return this._ride(e, t, H.ride);
      const len = H.len[k];
      if (H.choke && this.openHat && this.openHat.at < t) {
        this.openHat.gain.cancelScheduledValues(t);
        this.openHat.gain.setTargetAtTime(0, t, H.choke);
      }
      const src = ctx.createBufferSource();
      src.buffer = this._buffer('white');
      let head = src;
      if (H.metal) {
        head = this._gain(1);
        src.connect(this._gain(H.metal[1])).connect(head);
        const metal = ctx.createBufferSource();
        metal.buffer = this._buffer('metal');
        metal.connect(this._filter('highpass', H.hp[k], H.hpQ)).connect(this._gain(H.metal[0])).connect(head);
        metal.start(t, this.r.range(0, 1.9 - len), len);
      }
      if (H.bits) head = this._crush(head, H.bits);
      const pk = this._filter('peaking', H.pk[k], H.pkQ);
      pk.gain.value = H.pkGain;
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(e.vel, t + H.attack);
      amp.gain.setTargetAtTime(0, t + H.attack + 0.0005, H.decay[k]); // 減衰はアタックが終わってから
      head
        .connect(this._filter('highpass', H.hp[k], H.hpQ))
        .connect(this._filter('lowpass', H.lp[k], H.lpQ))
        .connect(pk)
        .connect(amp)
        .connect(this._panner(e.pan))
        .connect(this.hatBus);
      src.start(t, this.r.range(0, 1.9 - len), len);
      if (H.choke) this.openHat = e.open ? { gain: amp.gain, at: t } : null;
    }

    // 量子化して少しざらつかせる（小さな音の段が粗くならないよう、いったん大きくしてから丸め、元の大きさへ戻す）
    _crush(from, bits) {
      const shaper = this.ctx.createWaveShaper();
      shaper.curve = quantizeCurve(bits);
      return from.connect(this._gain(0.3)).connect(shaper).connect(this._gain(1 / 0.3));
    }

    // ライド（909 風、motor）: 金属の響きを低めの帯域で通し、長く「チーン」と伸ばす。ハットのチョークとは関係しない
    _ride(e, t, D) {
      const ctx = this.ctx;
      let src = ctx.createBufferSource();
      src.buffer = this._buffer('metal');
      const source = src;
      if (this.P.hat.bits) src = this._crush(src, this.P.hat.bits);
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(e.vel * D.level, t + 0.001);
      amp.gain.setTargetAtTime(0, t + 0.0015, D.decay);
      const pk = this._filter('peaking', D.pk, 1.5);
      pk.gain.value = 6;
      src.connect(this._filter('highpass', D.hp, 0.7)).connect(this._filter('highpass', D.hp, 0.7)).connect(pk).connect(amp).connect(this._panner(e.pan)).connect(this.hatBus);
      source.start(t, this.r.range(0, 1.9 - D.len), D.len);
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

    // 手拍子（909 風、motor）: 帯域を絞ったノイズを gap 秒おきに bursts 回はじき（何人かの手が少しずつずれて重なる）、
    // 最後の 1 回を decay で長く残す。パーカッションのバスへ入る（真ん中）
    _clap(e, t) {
      const C = this.P.perc.clap;
      const src = this.ctx.createBufferSource();
      src.buffer = this._buffer('white');
      const amp = this.ctx.createGain();
      const peak = e.vel * C.level;
      for (let i = 0; i <= C.bursts; i++) {
        const at = t + i * C.gap;
        amp.gain.setValueAtTime(peak, at);
        amp.gain.setTargetAtTime(0, at + 0.0005, i < C.bursts ? C.burstDecay : C.decay);
      }
      src
        .connect(this._filter('highpass', C.hp, 0.7))
        .connect(this._filter('bandpass', C.bp, C.bpQ))
        .connect(amp)
        .connect(this.percBus);
      src.start(t, this.r.range(0, 1.9 - C.len), C.len);
    }

    // 和音を一瞬だけ開くスタブ。波形・レゾナンス・減衰はパッチ次第
    _stab(e, t) {
      const ctx = this.ctx;
      const S = this.P.stab;
      if (S.guitar) return this._guitar(e, t, S.guitar);
      const cutoff = S.cutMin * Math.pow(S.cutRange, e.bright);
      const tau = S.tauMin * Math.pow(S.tauRange, e.decay);
      const sum = this._gain(1 / e.notes.length);
      const oscs = [];
      for (const n of e.notes) {
        const hz = mtof(n);
        for (const sign of [-1, 1]) {
          const o = ctx.createOscillator();
          o.type = sign > 0 && S.wave2 ? S.wave2 : S.wave; // wave2（motor）: 組の片方を別の波形に（鋸歯状波と矩形波で Juno 風）
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

    // ナイロンギターのストローク。notes は低い弦から順（配列の後ろが 1 弦）。
    // 手は 16 分で上下しているので、表の 16 分はダウン（全部の弦を低い方から）、裏の 16 分はアップ（高い弦の数本を、上から軽く）。
    // 1 本の弦は 1 音しか鳴らせないので、弾き直すと前の音は止まる。弦ごとに強さ・間・音の版・音程がわずかに揺れる。
    // bright は指の当たりの明るさ、decay は余韻を手で止めるまでの長さ
    _guitar(e, t, G) {
      const ctx = this.ctx;
      const r = this.r;
      const up = Math.round(e.step) % 2 === 1;
      const all = e.notes.map((n, i) => ({ note: n, string: 6 - e.notes.length + i }));
      const strings = G.top ? all.slice(-G.top) : all; // top: 高い弦だけで刻む（skank）
      const hit = up ? strings.slice(-Math.min(strings.length, G.upStrings + (r.chance(0.5) ? 1 : 0))).reverse() : strings;
      const gap = r.range(G.strum[0], G.strum[1]) * (1.25 - 0.5 * e.vel) * (up ? 0.8 : 1); // 強く弾くほど速く振り抜く
      const ring = G.ring[0] * Math.pow(G.ring[1] / G.ring[0], e.decay);
      const tone = this._filter('lowpass', G.tone[0] * Math.pow(G.tone[1] / G.tone[0], e.bright), 0.5);
      tone.connect(this.guitarBody);
      const level = (G.gain * e.vel * (up ? G.upVel : 1)) / Math.sqrt(strings.length);
      let at = t + r.range(G.late[0], G.late[1]); // 人の手の、わずかな前後
      hit.forEach(({ note, string }, i) => {
        if (i > 0) at += gap * r.range(0.7, 1.3);
        const held = this.guitarStrings[string];
        if (held && held.at < at) {
          // 同じ弦を弾き直す: 前の音の予定を消して、すぐに止める
          held.amp.gain.cancelScheduledValues(at);
          held.amp.gain.setTargetAtTime(0, at, G.damp);
        }
        // 前と同じ版は続けない（同じ波形の繰り返しは機械的に聞こえる）
        let variant = r.int(0, G.variants - 1);
        if (held && variant === held.variant) variant = (variant + 1) % G.variants;
        const src = ctx.createBufferSource();
        src.buffer = pluckBuffer(ctx, note, G, variant);
        // 弦ごとのわずかな音程のずれと、強く弾いた瞬間だけ少し高くなる音程
        const rate = 1 + r.range(-G.detune, G.detune);
        src.playbackRate.setValueAtTime(rate * (1 + G.bend * e.vel), at);
        src.playbackRate.setTargetAtTime(rate, at + 0.004, G.bendTime);
        const amp = ctx.createGain();
        amp.gain.setValueAtTime(level * (1 - G.fall * i) * r.range(0.85, 1.1), at);
        amp.gain.setTargetAtTime(0, at + ring, G.mute);
        src.connect(amp).connect(tone);
        src.start(at);
        src.stop(Math.min(at + ring + G.mute * 6, at + src.buffer.duration));
        this.guitarStrings[string] = { amp, at, variant };
      });
    }

    // ナイロンギターの単音（sunset のきらめき）: 撥弦モデルの弦を 1 本だけ弾く。
    // 前と同じ波形は続けず、音程と弾く瞬間がわずかに揺れる。余韻はきらめきのバスからディレイと残響へ流れる
    _pluckNote(e, t, N) {
      const ctx = this.ctx;
      const r = this.r;
      let variant = r.int(0, N.variants - 1);
      if (variant === this.lastPluck) variant = (variant + 1) % N.variants;
      this.lastPluck = variant;
      const at = t + r.range(N.late[0], N.late[1]);
      const src = ctx.createBufferSource();
      src.buffer = pluckBuffer(ctx, e.note, N, variant);
      const rate = 1 + r.range(-N.detune, N.detune);
      src.playbackRate.setValueAtTime(rate * (1 + N.bend * e.vel), at);
      src.playbackRate.setTargetAtTime(rate, at + 0.004, N.bendTime);
      if (N.yuri && r.chance(N.yuri.chance)) {
        // 揺り（箏）: 弾いたあと、弦を押して音程をゆっくり上下させ、元に戻す
        const Y = N.yuri;
        for (let k = 0; k < Y.count; k++) {
          src.playbackRate.setTargetAtTime(rate * (1 + (k % 2 ? -1 : 1) * Y.depth), at + Y.delay + k * Y.period, Y.period / 3);
        }
        src.playbackRate.setTargetAtTime(rate, at + Y.delay + Y.count * Y.period, Y.period / 2);
      }
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(N.gain * e.vel, at);
      amp.gain.setTargetAtTime(0, at + N.ring, N.mute);
      src
        .connect(amp)
        .connect(this._filter('lowpass', N.tone, 0.5))
        .connect(this._filter('highpass', N.hp, 0.5))
        .connect(this._panner((e.pan || 0) * N.width))
        .connect(this.glintBus);
      src.start(at);
      src.stop(Math.min(at + N.ring + N.mute * 6, at + src.buffer.duration));
    }

    // 和音が変わるたび、古いパッドをゆっくり退かせて新しいパッドを満たす
    _padChord(notes, t) {
      const ctx = this.ctx;
      const D = this.P.pad;
      if (D.organ) return this._organChord(notes, t, D.organ);
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

    // オルガンのドローン（fog）: 和音の音を、倍音の豊かなパイプの音で伸ばす。根音の下にペダル（16'・32'）を足し、和音は純正律で
    // 合わせて（justTune）、少しずらした組（セレステ）とゆっくりうならせる。声部は合わせた順に一つずつ入り、それぞれが
    // ちがう周期でゆっくり膨らんではしぼむ。和音が変わると、古い声部は後から入ったものから一つずつ引き、新しい声部と入れ替わっていく
    _organChord(notes, t, O) {
      const ctx = this.ctx;
      const r = this.r;
      if (!this.organWave) {
        const real = new Float32Array(Math.max(...O.partials.map(([h]) => h)) + 1);
        const imag = real.slice();
        for (const [h, a] of O.partials) imag[h] = a;
        this.organWave = ctx.createPeriodicWave(real, imag);
      }
      if (this.pad) {
        [...this.pad.voices].reverse().forEach((v, k) => {
          const at = t + (k && k + r.range(-0.3, 0.3)) * O.stagger; // 最後に入った声部は、すぐ引き始める
          for (const g of [v.amp.gain, v.bloom.gain]) {
            g.cancelScheduledValues(t); // まだ入っていない声部は、入らないまま引く
            g.setTargetAtTime(0, at, O.release);
          }
          for (const o of v.oscs) o.stop(Math.max(at, v.at) + O.release * 8);
        });
      }
      const pedal = new Map(O.pedal.map(([interval, level]) => [notes[0] + interval, level]));
      const tuned = justTune([...pedal.keys()].sort((a, b) => a - b).concat(notes));
      const voices = tuned.map(([note, cents], k) => {
        const at = t + (k && k + r.range(-0.3, 0.3)) * O.stagger; // 最初の一声はすぐ
        const peak = (O.level * (pedal.get(note) ?? 1)) / Math.sqrt(tuned.length);
        const amp = this._gain(0);
        amp.gain.setValueAtTime(0, t);
        amp.gain.setTargetAtTime(peak, at, O.attack);
        // 膨らんではしぼむ: 声部ごとに周期がちがうので、同じ和音のままでも響きの色が少しずつ移ろう
        const bloom = this._gain(0);
        bloom.gain.setValueAtTime(0, t);
        bloom.gain.setTargetAtTime(peak * O.bloom[2], at, O.attack);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 1 / r.range(O.bloom[0], O.bloom[1]);
        lfo.connect(bloom).connect(amp.gain);
        const oscs = [lfo];
        const celeste = O.celeste * r.range(0.7, 1.3);
        for (const [detune, gain] of [[cents, 1], [cents + celeste, O.celesteLevel]]) {
          const o = ctx.createOscillator();
          o.setPeriodicWave(this.organWave);
          o.frequency.value = mtof(note);
          o.detune.value = detune;
          o.connect(this._gain(gain)).connect(amp);
          oscs.push(o);
        }
        for (const o of oscs) {
          o.start(at);
          o.onended = () => this.padOscs.delete(o);
          this.padOscs.add(o);
        }
        amp.connect(this._panner(pedal.has(note) ? 0 : r.range(-O.width, O.width))).connect(this.padFilter); // ペダルは真ん中
        return { at, amp, bloom, oscs };
      });
      this.pad = { voices };
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
      if (G.guitar) {
        this._pluckNote(e, t, G.guitar);
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
