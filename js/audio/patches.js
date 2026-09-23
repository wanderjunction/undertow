/*
 * Undertow — 音色のパッチ（WORLD ごと）
 *
 * パートの役割は全 WORLD 共通。WORLD ごとに、その役割を鳴らす音色とミックスを一組ずつ持つ。
 * 音色は WORLD をまたいで共有しない（tests/ で確かめている）。
 * 数値はすべて CALIBRATION（試聴とオフライン計測で決めた仮値）。変えたら version を上げる。
 *
 *   mix    各パートの音量と、残響（Verb）・ディレイ（Dly）への送り量
 *   kick   sweep / mid: 叩いた瞬間と少し後のピッチ（基音の倍率）、decay: 余韻（秒の時定数）、
 *          lpMin × lpRange^存在感: 水面下（こもる）→ 水面（抜ける）のローパス
 *   stab   cutMin × cutRange^明るさ: フィルタの開き、tauMin × tauRange^減衰: 余韻の長さ
 *   pad    osc: [波形, デチューン(セント), オクターブ(半音), 音量] を音ごとに重ねる
 *   hat    [閉じたハット, 開いたハット] の組
 */
(function (U) {
  'use strict';
  const { deepFreeze } = U.util;

  // 残響の響き方（インパルス応答の作り方）
  const IMPULSES = {
    hall: { seconds: 5.5, pre: 0.028, bright: [0.75, 0.62], power: 2.6 },
    cathedral: { seconds: 7.5, pre: 0.045, bright: [0.6, 0.52], power: 2.2 }, // 長く暗い
    plate: { seconds: 3.6, pre: 0.008, bright: [0.85, 0.55], power: 3 }, // 短く明るい
    room: { seconds: 2.8, pre: 0.012, bright: [0.55, 0.4], power: 2.8 }, // 小さく暗い部屋
    abyss: { seconds: 9, pre: 0.06, bright: [0.45, 0.4], power: 2 }, // 深く、とても長い
  };

  const PATCHES = {
    // v1.0 の音。波だけ控えめにした（本体 0.21 → 0.12、泡 0.45 → 0.3）
    tide: {
      version: 'tide-mix-0.5',
      mix: {
        kick: 0.4, bass: 0.235,
        hats: 0.26, hatsVerb: 0.08,
        perc: 0.25, percDly: 0.55, percVerb: 0.2,
        stabDry: 0.28, stabDly: 0.5, stabVerb: 0.28,
        padDry: 0.12, padVerb: 0.3,
        waves: 0.12, wavesVerb: 0.06,
        glint: 0.15, glintVerb: 0.55, glintDly: 0.2,
        riser: 0.14, riserVerb: 0.4,
        verbReturn: 0.5, dlyReturn: 0.7, dlyVerb: 0.25,
      },
      kick: { sweep: 3.4, mid: 1.35, t1: 0.028, t2: 0.11, attack: 0.004, decayAt: 0.03, decay: 0.12, floor: 0.3, lpMin: 110, lpRange: 100, lpQ: 0.9, click: 0.1, clickHz: 2600, clickFrom: 0.35, len: 1.1 },
      bass: { tri: 0.3, triDetune: 4, saw: 0, attack: 0.008, sustain: 0.72, release: 0.015, drive: 0.75, lp: 320, lpQ: 0.6 },
      hat: { hp: [6800, 5200], hpQ: 0.7, lp: [10000, 8800], lpQ: 0.5, pk: [9200, 8000], pkQ: 1.2, pkGain: 2, attack: 0.0025, decay: [0.02, 0.07], len: [0.15, 0.6] },
      perc: { wave: 'triangle', octave: 0, drop: 1.6, dropTime: 0.012, bpMul: 1.1, bpQ: 1.5, attack: 0.001, decay: 0.018, len: 0.25, noise: 0 },
      stab: { wave: 'sawtooth', jitter: 1.5, q: 5.5, cutMin: 200, cutRange: 20, env: [2, 2.5], envMax: 12000, envTau: 0.04, attack: 0.005, decayAt: 0.012, tauMin: 0.045, tauRange: 4.5, hp: 140, tail: 7, spread: 0 },
      pad: { osc: [['sawtooth', -9, 0, 1], ['sawtooth', 9, 0, 1]], jitter: 2, attack: 1.6, release: 2.2, lp: 760, lpQ: 0.4, lfo: [0.031, 280], breath: [0.09, 0.12], spread: 1.2 },
      glint: { index: 1.8, indexEnd: 0.15, indexTau: 0.22, attack: 0.008, decayAt: 0.01, decay: 0.55, len: 4.5 },
      waves: { lanes: [-0.7, 0.1, 0.65], hp: 60, lpBase: 280, lpPeak: 2300, lpQ: 0.3, floor: 0.03, foam: 0.3, foamBand: [2400, 8500], rumble: 0.35, rumbleLp: 200, crackle: 0 },
      space: { ir: 'hall', verbBand: [190, 6500], dlyBand: [360, 2500], dlyLpQ: 0.5, pan: 0.7, wow: [0.17, 0.0009], tape: 0, feedbackStart: 0.56 },
      throw: { feedback: 0.8, send: 1.8 },
      riser: { from: 250, to: 5200, q: 1.2 },
      duck: { attack: 0.012, release: 0.085 },
    },

    // ふわふわのパッドが主役。キックは柔らかく、ハットは息のように、残響は長く暗く
    drift: {
      version: 'drift-mix-0.3', // 0.1 はパッドが -17 dB と前に出すぎてリミッタに当たっていた。0.3 でスタブの鳴り始めをずらした
      mix: {
        kick: 0.28, bass: 0.3,
        hats: 0.45, hatsVerb: 0.14,
        perc: 0.2, percDly: 0.2, percVerb: 0.35,
        stabDry: 0.15, stabDly: 0.14, stabVerb: 0.34,
        padDry: 0.085, padVerb: 0.22,
        waves: 0.16, wavesVerb: 0.1,
        glint: 0.12, glintVerb: 0.48, glintDly: 0.12,
        riser: 0, riserVerb: 0,
        verbReturn: 0.55, dlyReturn: 0.45, dlyVerb: 0.35,
      },
      kick: { sweep: 2.2, mid: 1.2, t1: 0.04, t2: 0.14, attack: 0.006, decayAt: 0.04, decay: 0.16, floor: 0.35, lpMin: 110, lpRange: 60, lpQ: 0.7, click: 0, clickHz: 0, clickFrom: 1, len: 1.4 },
      bass: { tri: 0, triDetune: 0, saw: 0, attack: 0.03, sustain: 0.8, release: 0.04, drive: 0.5, lp: 220, lpQ: 0.5 },
      hat: { hp: [4800, 4000], hpQ: 0.6, lp: [7200, 6500], lpQ: 0.5, pk: [6000, 5500], pkQ: 0.9, pkGain: 1, attack: 0.006, decay: [0.045, 0.12], len: [0.3, 0.8] },
      perc: { wave: 'sine', octave: -12, drop: 1.25, dropTime: 0.02, bpMul: 1, bpQ: 0.8, attack: 0.002, decay: 0.035, len: 0.4, noise: 0 },
      stab: { wave: 'triangle', jitter: 2, q: 0.9, cutMin: 420, cutRange: 6, env: [0.4, 0.3], envMax: 3000, envTau: 0.2, attack: 0.08, decayAt: 0.12, tauMin: 0.25, tauRange: 3, hp: 170, tail: 6, spread: 0.01 },
      pad: { osc: [['sawtooth', -13, 0, 1], ['sawtooth', 13, 0, 1], ['triangle', 0, 12, 0.6]], jitter: 3, attack: 3.2, release: 3.8, lp: 1300, lpQ: 0.3, lfo: [0.018, 420], breath: [0.05, 0.22], spread: 1.6 },
      glint: { index: 1.1, indexEnd: 0.1, indexTau: 0.5, attack: 0.02, decayAt: 0.025, decay: 0.95, len: 7 },
      waves: { lanes: [-0.8, 0, 0.8], hp: 50, lpBase: 220, lpPeak: 1100, lpQ: 0.3, floor: 0.04, foam: 0, foamBand: [0, 0], rumble: 0.5, rumbleLp: 160, crackle: 0 },
      space: { ir: 'cathedral', verbBand: [160, 5200], dlyBand: [300, 2000], dlyLpQ: 0.5, pan: 0.6, wow: [0.11, 0.0012], tape: 0, feedbackStart: 0.42 },
      throw: { feedback: 0.66, send: 1.5 },
      riser: { from: 200, to: 2400, q: 1 },
      duck: { attack: 0.03, release: 0.16 },
    },

    // ダブ。矩形波のスタブとリムショットを、テープの歪むディレイへ投げ込む。ベースは太く、かすかなレコードの音
    echo: {
      // echo-mix-0.4: 0.1〜0.3 はディレイの 1 回目の返りが原音より 10 dB 大きく、重なるたびにピークが -1 dB まで積み上がっていた。
      //   原音とほぼ同じ大きさで返るように配分し直した（スタブの鳴り始めもずらしている）。
      //   0.5: ダブ・スローを少し浅くした（0.4 はブレイク明けにピークがリミッタの天井へ張り付いた）
      version: 'echo-mix-0.5',
      mix: {
        kick: 0.39, bass: 0.19,
        hats: 0.22, hatsVerb: 0.05,
        perc: 0.4, percDly: 0.85, percVerb: 0.15,
        stabDry: 0.25, stabDly: 0.38, stabVerb: 0.2,
        padDry: 0.18, padVerb: 0.36,
        waves: 0.28, wavesVerb: 0.04,
        glint: 0.1, glintVerb: 0.4, glintDly: 0.25,
        riser: 0.12, riserVerb: 0.3,
        verbReturn: 0.4, dlyReturn: 0.75, dlyVerb: 0.2,
      },
      kick: { sweep: 2.8, mid: 1.3, t1: 0.03, t2: 0.12, attack: 0.004, decayAt: 0.03, decay: 0.14, floor: 0.3, lpMin: 110, lpRange: 70, lpQ: 0.8, click: 0.06, clickHz: 1800, clickFrom: 0.4, len: 1.2 },
      bass: { tri: 0.2, triDetune: 3, saw: 0.35, attack: 0.006, sustain: 0.78, release: 0.02, drive: 1.1, lp: 260, lpQ: 0.7 },
      hat: { hp: [6000, 4800], hpQ: 0.7, lp: [9000, 7500], lpQ: 0.6, pk: [7500, 6800], pkQ: 1.4, pkGain: 3, attack: 0.002, decay: [0.022, 0.09], len: [0.15, 0.6] },
      perc: { wave: 'triangle', octave: -12, drop: 1.4, dropTime: 0.008, bpMul: 1.3, bpQ: 2, attack: 0.001, decay: 0.014, len: 0.2, noise: 0.8, noiseHz: 1900, noiseQ: 2.5, noiseDecay: 0.01 },
      stab: { wave: 'square', jitter: 1, q: 4.5, cutMin: 180, cutRange: 16, env: [1.5, 1.8], envMax: 3800, envTau: 0.03, attack: 0.006, decayAt: 0.012, tauMin: 0.035, tauRange: 3.5, hp: 150, tail: 7, spread: 0.006 },
      pad: { osc: [['square', -5, 0, 0.7], ['sawtooth', 6, 0, 1]], jitter: 1.5, attack: 2, release: 2.5, lp: 520, lpQ: 0.6, lfo: [0.04, 180], breath: [0.12, 0.08], spread: 0.8 },
      glint: { index: 2.4, indexEnd: 0.3, indexTau: 0.15, attack: 0.004, decayAt: 0.006, decay: 0.35, len: 3 },
      waves: { lanes: [-0.5, 0.2, 0.55], hp: 80, lpBase: 400, lpPeak: 1400, lpQ: 0.3, floor: 0.05, foam: 0.12, foamBand: [3000, 7000], rumble: 0.2, rumbleLp: 180, crackle: 0.6 },
      space: { ir: 'plate', verbBand: [220, 7500], dlyBand: [420, 2200], dlyLpQ: 0.6, pan: 0.8, wow: [0.23, 0.0016], tape: 1.3, feedbackStart: 0.62 },
      throw: { feedback: 0.8, send: 1.5 },
      riser: { from: 220, to: 3800, q: 1.4 },
      duck: { attack: 0.01, release: 0.09 },
    },

    // 明け方: 三角波の澄んだ和音、木琴のようなきらめき、風のような薄い質感
    dawn: {
      version: 'dawn-mix-0.2', // 0.1 はきらめき -50・風 -54 dB でほぼ聞こえなかった
      mix: {
        kick: 0.38, bass: 0.22,
        hats: 0.24, hatsVerb: 0.08,
        perc: 0.35, percDly: 0.35, percVerb: 0.2,
        stabDry: 0.3, stabDly: 0.3, stabVerb: 0.3,
        padDry: 0.1, padVerb: 0.26,
        waves: 0.25, wavesVerb: 0.06,
        glint: 0.55, glintVerb: 0.5, glintDly: 0.25,
        riser: 0.1, riserVerb: 0.35,
        verbReturn: 0.45, dlyReturn: 0.6, dlyVerb: 0.25,
      },
      kick: { sweep: 3, mid: 1.3, t1: 0.03, t2: 0.11, attack: 0.004, decayAt: 0.03, decay: 0.11, floor: 0.3, lpMin: 110, lpRange: 90, lpQ: 0.85, click: 0.07, clickHz: 3000, clickFrom: 0.35, len: 1 },
      bass: { tri: 0.4, triDetune: 3, saw: 0, attack: 0.008, sustain: 0.7, release: 0.02, drive: 0.7, lp: 360, lpQ: 0.6 },
      hat: { hp: [7000, 5600], hpQ: 0.7, lp: [11000, 9500], lpQ: 0.5, pk: [9800, 8500], pkQ: 1.1, pkGain: 2, attack: 0.002, decay: [0.018, 0.06], len: [0.15, 0.5] },
      perc: { wave: 'triangle', octave: 12, drop: 1.2, dropTime: 0.006, bpMul: 1, bpQ: 2, attack: 0.001, decay: 0.022, len: 0.25, noise: 0 },
      stab: { wave: 'triangle', jitter: 1.5, q: 2, cutMin: 400, cutRange: 12, env: [1.5, 1.5], envMax: 8000, envTau: 0.05, attack: 0.006, decayAt: 0.012, tauMin: 0.06, tauRange: 4, hp: 180, tail: 7, spread: 0.004 },
      pad: { osc: [['triangle', -7, 0, 1], ['triangle', 7, 0, 1], ['sine', 0, 12, 0.5]], jitter: 2, attack: 2.2, release: 2.8, lp: 1800, lpQ: 0.4, lfo: [0.025, 500], breath: [0.07, 0.1], spread: 1.4 },
      glint: { index: 0.6, indexEnd: 0.05, indexTau: 0.08, attack: 0.002, decayAt: 0.004, decay: 0.35, len: 2.5 },
      waves: { lanes: [-0.6, 0, 0.6], hp: 200, lpBase: 500, lpPeak: 3000, lpQ: 0.3, floor: 0.03, foam: 0.2, foamBand: [4000, 9000], rumble: 0.1, rumbleLp: 150, crackle: 0 },
      space: { ir: 'hall', verbBand: [220, 8000], dlyBand: [400, 3200], dlyLpQ: 0.5, pan: 0.65, wow: [0.15, 0.0007], tape: 0, feedbackStart: 0.48 },
      throw: { feedback: 0.72, send: 1.5 },
      riser: { from: 300, to: 6000, q: 1.1 },
      duck: { attack: 0.012, release: 0.08 },
    },

    // 月明かりの水面: 和音の音が光のように満ちては消える（ノイズは使わない）、こもった電子ピアノ風の和音、柔らかなキック、小部屋の残響
    moon: {
      // 旧 rain → tape。雨音は試聴で「揚げ物」「ひよこ」「効いていない」、テープはヒスが耳に負担で揺れがソリッド感を薄めた。
      //   質感の枠だけを「水面の光」に差し替えた（和音・キックなどの音色は rain のまま、揺れもなし）
      version: 'moon-mix-0.2', // 0.1 は光の層が -29 dB でパッドより大きかった
      mix: {
        kick: 0.34, bass: 0.26,
        hats: 0.45, hatsVerb: 0.1,
        perc: 0.2, percDly: 0.3, percVerb: 0.25,
        stabDry: 0.3, stabDly: 0.22, stabVerb: 0.3,
        padDry: 0.12, padVerb: 0.28,
        waves: 0.047, wavesVerb: 0.21,
        glint: 0.12, glintVerb: 0.45, glintDly: 0.15,
        riser: 0, riserVerb: 0,
        verbReturn: 0.5, dlyReturn: 0.55, dlyVerb: 0.3,
      },
      kick: { sweep: 2.5, mid: 1.25, t1: 0.035, t2: 0.13, attack: 0.005, decayAt: 0.035, decay: 0.14, floor: 0.35, lpMin: 110, lpRange: 50, lpQ: 0.7, click: 0, clickHz: 0, clickFrom: 1, len: 1.2 },
      bass: { tri: 0.15, triDetune: 2, saw: 0, attack: 0.015, sustain: 0.78, release: 0.03, drive: 0.6, lp: 250, lpQ: 0.5 },
      hat: { hp: [5200, 4400], hpQ: 0.6, lp: [8000, 7000], lpQ: 0.5, pk: [6500, 6000], pkQ: 1, pkGain: 1.5, attack: 0.004, decay: [0.035, 0.1], len: [0.25, 0.7] },
      perc: { wave: 'sine', octave: 0, drop: 1.3, dropTime: 0.01, bpMul: 1, bpQ: 1.2, attack: 0.002, decay: 0.03, len: 0.3, noise: 0 },
      stab: { wave: 'sine', jitter: 2, q: 0.7, cutMin: 600, cutRange: 5, env: [0.6, 0.6], envMax: 4000, envTau: 0.08, attack: 0.012, decayAt: 0.03, tauMin: 0.15, tauRange: 4, hp: 150, tail: 7, spread: 0.008 },
      pad: { osc: [['sawtooth', -8, 0, 1], ['triangle', 8, 0, 1]], jitter: 2, attack: 2.6, release: 3.2, lp: 600, lpQ: 0.5, lfo: [0.022, 220], breath: [0.06, 0.15], spread: 1.3 },
      glint: { index: 1.4, indexEnd: 0.12, indexTau: 0.3, attack: 0.01, decayAt: 0.015, decay: 0.7, len: 5 },
      // shimmer: 波ひとつごとに、和音の音を澄んだサイン波で鳴らす。partials: [デチューン(セント), 周波数の倍率, 音量]
      //   わずかにずらした 2 本が重なって、光がきらめくようにゆっくりうなる（音程は揺らさない）
      waves: { lanes: [-0.7, 0, 0.7], shimmer: { partials: [[-1.5, 1, 0.5], [1.5, 1, 0.5], [0, 2, 0.1]] } },
      space: { ir: 'room', verbBand: [180, 5500], dlyBand: [350, 2200], dlyLpQ: 0.5, pan: 0.55, wow: [0.13, 0.001], tape: 0, feedbackStart: 0.46 },
      throw: { feedback: 0.7, send: 1.4 },
      riser: { from: 200, to: 2000, q: 1 },
      duck: { attack: 0.02, release: 0.12 },
    },

    // うねり: 硬めのキック、太く動くベース、乾いた短い和音、残響は控えめ
    pulse: {
      version: 'pulse-mix-0.3', // 0.1 は和音 -34 dB で中域が痩せていた。0.2 は和音の鳴り始めが -1.4 dB まで尖った
      mix: {
        kick: 0.44, bass: 0.22,
        hats: 0.26, hatsVerb: 0.04,
        perc: 0.4, percDly: 0.35, percVerb: 0.08,
        stabDry: 0.5, stabDly: 0.5, stabVerb: 0.12,
        padDry: 0.18, padVerb: 0.25,
        waves: 0.12, wavesVerb: 0.03,
        glint: 0.2, glintVerb: 0.25, glintDly: 0.2,
        riser: 0.14, riserVerb: 0.3,
        verbReturn: 0.3, dlyReturn: 0.5, dlyVerb: 0.15,
      },
      kick: { sweep: 4, mid: 1.45, t1: 0.022, t2: 0.09, attack: 0.003, decayAt: 0.025, decay: 0.1, floor: 0.3, lpMin: 110, lpRange: 110, lpQ: 1, click: 0.14, clickHz: 3200, clickFrom: 0.3, len: 0.9 },
      bass: { tri: 0.2, triDetune: 5, saw: 0.25, attack: 0.004, sustain: 0.65, release: 0.012, drive: 1, lp: 380, lpQ: 0.8 },
      hat: { hp: [7400, 6000], hpQ: 0.8, lp: [11500, 10000], lpQ: 0.6, pk: [10000, 8800], pkQ: 1.3, pkGain: 2.5, attack: 0.0015, decay: [0.015, 0.055], len: [0.12, 0.45] },
      perc: { wave: 'square', octave: 0, drop: 1.8, dropTime: 0.006, bpMul: 1.2, bpQ: 3, attack: 0.001, decay: 0.012, len: 0.15, noise: 0.4, noiseHz: 2400, noiseQ: 3, noiseDecay: 0.006 },
      stab: { wave: 'sawtooth', jitter: 1, q: 3, cutMin: 250, cutRange: 18, env: [1.6, 1.6], envMax: 5000, envTau: 0.025, attack: 0.004, decayAt: 0.01, tauMin: 0.03, tauRange: 3, hp: 180, tail: 7, spread: 0.006 },
      pad: { osc: [['sawtooth', -6, 0, 1], ['square', 6, -12, 0.5]], jitter: 1, attack: 1.2, release: 1.6, lp: 650, lpQ: 0.8, lfo: [0.06, 250], breath: [0.12, 0.06], spread: 1 },
      glint: { index: 2, indexEnd: 0.2, indexTau: 0.1, attack: 0.003, decayAt: 0.005, decay: 0.25, len: 2 },
      waves: { lanes: [-0.5, 0.1, 0.5], hp: 120, lpBase: 350, lpPeak: 1600, lpQ: 0.3, floor: 0.02, foam: 0.1, foamBand: [3500, 8000], rumble: 0.1, rumbleLp: 150, crackle: 0 },
      space: { ir: 'room', verbBand: [250, 7000], dlyBand: [500, 3000], dlyLpQ: 0.6, pan: 0.75, wow: [0.2, 0.0006], tape: 0.8, feedbackStart: 0.4 },
      throw: { feedback: 0.72, send: 1.6 },
      riser: { from: 300, to: 7000, q: 1.3 },
      duck: { attack: 0.008, release: 0.1 },
    },

    // ガラス: 細いキックと低音、明るく短いハットとクリック、金属的なきらめき、広く明るい空間
    glass: {
      version: 'glass-mix-0.2', // 0.1 はハット -53・和音 -44 dB で高い音が埋もれていた
      mix: {
        kick: 0.36, bass: 0.18,
        hats: 0.5, hatsVerb: 0.1,
        perc: 0.4, percDly: 0.45, percVerb: 0.3,
        stabDry: 0.6, stabDly: 0.6, stabVerb: 0.3,
        padDry: 0.08, padVerb: 0.3,
        waves: 0.2, wavesVerb: 0.1,
        glint: 0.12, glintVerb: 0.4, glintDly: 0.3,
        riser: 0, riserVerb: 0,
        verbReturn: 0.5, dlyReturn: 0.6, dlyVerb: 0.3,
      },
      kick: { sweep: 3.2, mid: 1.4, t1: 0.02, t2: 0.08, attack: 0.003, decayAt: 0.02, decay: 0.08, floor: 0.3, lpMin: 120, lpRange: 100, lpQ: 0.9, click: 0.12, clickHz: 5000, clickFrom: 0.3, len: 0.8 },
      bass: { tri: 0, triDetune: 0, saw: 0, attack: 0.006, sustain: 0.6, release: 0.015, drive: 0.6, lp: 180, lpQ: 0.6 },
      hat: { hp: [9000, 7500], hpQ: 0.7, lp: [14000, 12500], lpQ: 0.5, pk: [11500, 10500], pkQ: 1.5, pkGain: 2, attack: 0.001, decay: [0.012, 0.045], len: [0.1, 0.4] },
      perc: { wave: 'sine', octave: 12, drop: 1.5, dropTime: 0.004, bpMul: 1, bpQ: 4, attack: 0.0008, decay: 0.008, len: 0.1, noise: 0.5, noiseHz: 6000, noiseQ: 3, noiseDecay: 0.004 },
      stab: { wave: 'triangle', jitter: 1, q: 3, cutMin: 800, cutRange: 8, env: [1.5, 1.5], envMax: 12000, envTau: 0.02, attack: 0.002, decayAt: 0.006, tauMin: 0.03, tauRange: 3, hp: 400, tail: 7, spread: 0.003 },
      pad: { osc: [['sine', -4, 12, 1], ['sine', 4, 12, 1], ['triangle', 0, 0, 0.4]], jitter: 1, attack: 2.4, release: 3, lp: 3200, lpQ: 0.3, lfo: [0.03, 900], breath: [0.08, 0.12], spread: 1.8 },
      glint: { index: 3, indexEnd: 0.4, indexTau: 0.06, attack: 0.001, decayAt: 0.002, decay: 0.2, len: 1.6 },
      waves: { lanes: [-0.9, 0, 0.9], hp: 1500, lpBase: 3000, lpPeak: 6000, lpQ: 0.3, floor: 0.02, foam: 0.25, foamBand: [6000, 12000], rumble: 0, rumbleLp: 100, crackle: 0 },
      space: { ir: 'plate', verbBand: [300, 11000], dlyBand: [700, 5000], dlyLpQ: 0.4, pan: 0.9, wow: [0.1, 0.0004], tape: 0, feedbackStart: 0.52 },
      throw: { feedback: 0.76, send: 1.6 },
      riser: { from: 400, to: 8000, q: 1 },
      duck: { attack: 0.01, release: 0.07 },
    },

    // 深海: 低いドローンのパッド、重く柔らかいキック、とても長い残響
    deep: {
      version: 'deep-mix-0.2', // 0.1 はパッド -19.5・和音 -23 dB で前に出すぎていた
      mix: {
        kick: 0.3, bass: 0.28,
        hats: 0.3, hatsVerb: 0.2,
        perc: 0.2, percDly: 0.2, percVerb: 0.4,
        stabDry: 0.1, stabDly: 0.08, stabVerb: 0.25,
        padDry: 0.075, padVerb: 0.16,
        waves: 0.13, wavesVerb: 0.1,
        glint: 0.1, glintVerb: 0.6, glintDly: 0.1,
        riser: 0, riserVerb: 0,
        verbReturn: 0.5, dlyReturn: 0.4, dlyVerb: 0.4,
      },
      kick: { sweep: 2, mid: 1.15, t1: 0.05, t2: 0.16, attack: 0.008, decayAt: 0.05, decay: 0.2, floor: 0.4, lpMin: 100, lpRange: 40, lpQ: 0.6, click: 0, clickHz: 0, clickFrom: 1, len: 1.6 },
      bass: { tri: 0, triDetune: 0, saw: 0, attack: 0.05, sustain: 0.85, release: 0.06, drive: 0.4, lp: 180, lpQ: 0.5 },
      hat: { hp: [4000, 3500], hpQ: 0.6, lp: [6000, 5500], lpQ: 0.5, pk: [5000, 4500], pkQ: 0.8, pkGain: 1, attack: 0.008, decay: [0.06, 0.15], len: [0.35, 0.9] },
      perc: { wave: 'sine', octave: -24, drop: 1.4, dropTime: 0.03, bpMul: 1, bpQ: 0.7, attack: 0.003, decay: 0.06, len: 0.6, noise: 0 },
      stab: { wave: 'triangle', jitter: 3, q: 1.2, cutMin: 200, cutRange: 5, env: [0.5, 0.4], envMax: 1500, envTau: 0.3, attack: 0.15, decayAt: 0.2, tauMin: 0.35, tauRange: 3, hp: 120, tail: 6, spread: 0.02 },
      pad: { osc: [['sawtooth', -10, 0, 1], ['sawtooth', 10, -12, 0.8], ['sine', 0, -12, 0.7]], jitter: 3, attack: 4, release: 4.5, lp: 480, lpQ: 0.5, lfo: [0.012, 300], breath: [0.04, 0.2], spread: 1.4 },
      glint: { index: 0.9, indexEnd: 0.08, indexTau: 0.6, attack: 0.03, decayAt: 0.035, decay: 1.2, len: 8 },
      waves: { lanes: [-0.8, 0, 0.8], hp: 40, lpBase: 150, lpPeak: 600, lpQ: 0.3, floor: 0.06, foam: 0, foamBand: [0, 0], rumble: 0.6, rumbleLp: 120, crackle: 0 },
      space: { ir: 'abyss', verbBand: [120, 4000], dlyBand: [250, 1600], dlyLpQ: 0.5, pan: 0.6, wow: [0.08, 0.0014], tape: 0, feedbackStart: 0.44 },
      throw: { feedback: 0.66, send: 1.4 },
      riser: { from: 150, to: 1500, q: 1 },
      duck: { attack: 0.04, release: 0.2 },
    },

    // 静けさ: シンギングボウルの長い余韻、柔らかな持続音、遠い心拍のようなキック、深く長い残響
    calm: {
      version: 'calm-mix-0.4', // 0.1 はボウル -16・パッド -19 dB で全体がリミッタに当たっていた。0.3 でキック・光・和音も控えめに。0.4 でボウルを専用の合成に（余韻が長く倍音が増えた分、送りを 2 dB 下げて以前の大きさにそろえた）
      mix: {
        kick: 0.15, bass: 0.26,
        hats: 0.2, hatsVerb: 0.2,
        perc: 0.12, percDly: 0.1, percVerb: 0.4,
        stabDry: 0.095, stabDly: 0.08, stabVerb: 0.28,
        padDry: 0.056, padVerb: 0.14,
        waves: 0.025, wavesVerb: 0.12,
        glint: 0.095, glintVerb: 0.16, glintDly: 0.02,
        riser: 0, riserVerb: 0,
        verbReturn: 0.5, dlyReturn: 0.35, dlyVerb: 0.4,
      },
      kick: { sweep: 1.8, mid: 1.1, t1: 0.06, t2: 0.18, attack: 0.01, decayAt: 0.06, decay: 0.22, floor: 0.45, lpMin: 90, lpRange: 30, lpQ: 0.5, click: 0, clickHz: 0, clickFrom: 1, len: 1.8 },
      bass: { tri: 0, triDetune: 0, saw: 0, attack: 0.08, sustain: 0.9, release: 0.08, drive: 0.3, lp: 160, lpQ: 0.5 },
      hat: { hp: [3800, 3200], hpQ: 0.5, lp: [5500, 5000], lpQ: 0.5, pk: [4500, 4200], pkQ: 0.7, pkGain: 0.5, attack: 0.012, decay: [0.08, 0.2], len: [0.5, 1] },
      perc: { wave: 'sine', octave: -12, drop: 1.1, dropTime: 0.04, bpMul: 1, bpQ: 0.6, attack: 0.005, decay: 0.08, len: 0.8, noise: 0 },
      stab: { wave: 'sine', jitter: 2, q: 0.5, cutMin: 400, cutRange: 3, env: [0.3, 0.2], envMax: 1500, envTau: 0.4, attack: 0.3, decayAt: 0.35, tauMin: 0.5, tauRange: 2.5, hp: 150, tail: 6, spread: 0.02 },
      pad: { osc: [['triangle', -6, 0, 1], ['sine', 6, 0, 1], ['sine', 0, -12, 0.5]], jitter: 2, attack: 5, release: 6, lp: 900, lpQ: 0.3, lfo: [0.01, 200], breath: [0.03, 0.18], spread: 1.4 },
      // シンギングボウル（専用の合成）。partials: [基音からの倍率, 音量, 消えていく時定数(秒)]。
      //   倍率は実際のボウルの振動の比率に近い値。各倍音は beat Hz だけずらした 2 本の組で、左右（width）に分かれてうなる
      glint: {
        bowl: {
          partials: [[1, 1, 7], [2.76, 0.5, 4], [5.4, 0.25, 2.2], [8.93, 0.12, 1.1]],
          beat: [0.3, 1.2], width: 0.35, pair: 0.7, attack: 0.004, strike: 0.12, strikeLp: 1600,
        },
      },
      waves: { lanes: [-0.8, 0, 0.8], shimmer: { partials: [[-1, 1, 0.5], [1, 1, 0.5]] } },
      space: { ir: 'abyss', verbBand: [120, 4500], dlyBand: [250, 1800], dlyLpQ: 0.5, pan: 0.5, wow: [0.06, 0.0008], tape: 0, feedbackStart: 0.38 },
      throw: { feedback: 0.6, send: 1.2 },
      riser: { from: 150, to: 1200, q: 1 },
      duck: { attack: 0.05, release: 0.25 },
    },

    // 滑るように流れる: 丸いベース、木のようなパーカッション、ころころとした短いアルペジオ、控えめな空間
    glide: {
      version: 'glide-mix-0.1',
      mix: {
        kick: 0.41, bass: 0.26,
        hats: 0.27, hatsVerb: 0.07,
        perc: 0.2, percDly: 0.3, percVerb: 0.15,
        stabDry: 0.2, stabDly: 0.22, stabVerb: 0.24,
        padDry: 0.12, padVerb: 0.28,
        waves: 0.12, wavesVerb: 0.06,
        glint: 0.1, glintVerb: 0.25, glintDly: 0.12,
        riser: 0.1, riserVerb: 0.3,
        verbReturn: 0.4, dlyReturn: 0.5, dlyVerb: 0.2,
      },
      kick: { sweep: 3.2, mid: 1.3, t1: 0.025, t2: 0.1, attack: 0.004, decayAt: 0.028, decay: 0.11, floor: 0.3, lpMin: 110, lpRange: 95, lpQ: 0.85, click: 0.08, clickHz: 2800, clickFrom: 0.35, len: 1 },
      bass: { tri: 0.25, triDetune: 3, saw: 0.1, attack: 0.005, sustain: 0.6, release: 0.012, drive: 0.8, lp: 340, lpQ: 0.7 },
      hat: { hp: [7200, 5800], hpQ: 0.7, lp: [10500, 9200], lpQ: 0.5, pk: [9400, 8200], pkQ: 1.1, pkGain: 1.5, attack: 0.002, decay: [0.016, 0.06], len: [0.12, 0.5] },
      perc: { wave: 'sine', octave: -12, drop: 1.5, dropTime: 0.006, bpMul: 1, bpQ: 1.6, attack: 0.001, decay: 0.02, len: 0.2, noise: 0 },
      stab: { wave: 'triangle', jitter: 1.5, q: 1.5, cutMin: 350, cutRange: 8, env: [1, 1], envMax: 4000, envTau: 0.05, attack: 0.02, decayAt: 0.03, tauMin: 0.12, tauRange: 3, hp: 160, tail: 7, spread: 0.006 },
      pad: { osc: [['sawtooth', -7, 0, 1], ['triangle', 7, 0, 1]], jitter: 2, attack: 2, release: 2.6, lp: 800, lpQ: 0.4, lfo: [0.03, 300], breath: [0.07, 0.1], spread: 1.3 },
      glint: { index: 1.2, indexEnd: 0.1, indexTau: 0.05, attack: 0.002, decayAt: 0.004, decay: 0.12, len: 0.8 },
      waves: { lanes: [-0.6, 0.1, 0.6], hp: 90, lpBase: 320, lpPeak: 1500, lpQ: 0.3, floor: 0.03, foam: 0.15, foamBand: [2600, 8000], rumble: 0.15, rumbleLp: 160, crackle: 0 },
      space: { ir: 'plate', verbBand: [220, 7000], dlyBand: [400, 2800], dlyLpQ: 0.5, pan: 0.7, wow: [0.16, 0.0006], tape: 0, feedbackStart: 0.44 },
      throw: { feedback: 0.72, send: 1.5 },
      riser: { from: 260, to: 5000, q: 1.1 },
      duck: { attack: 0.012, release: 0.09 },
    },

    // 残り火: 丸くくすんだアナログ風の和音、軽く飽和したベース、柔らかく低いキック、高域は少なめ
    ember: {
      version: 'ember-mix-0.1',
      mix: {
        kick: 0.36, bass: 0.24,
        hats: 0.2, hatsVerb: 0.06,
        perc: 0.16, percDly: 0.3, percVerb: 0.2,
        stabDry: 0.26, stabDly: 0.3, stabVerb: 0.26,
        padDry: 0.11, padVerb: 0.25,
        waves: 0.1, wavesVerb: 0.05,
        glint: 0.1, glintVerb: 0.4, glintDly: 0.15,
        riser: 0, riserVerb: 0,
        verbReturn: 0.45, dlyReturn: 0.6, dlyVerb: 0.25,
      },
      kick: { sweep: 2.6, mid: 1.25, t1: 0.035, t2: 0.12, attack: 0.005, decayAt: 0.035, decay: 0.13, floor: 0.32, lpMin: 110, lpRange: 45, lpQ: 0.7, click: 0, clickHz: 0, clickFrom: 1, len: 1.2 },
      bass: { tri: 0.3, triDetune: 5, saw: 0.15, attack: 0.008, sustain: 0.75, release: 0.02, drive: 1.1, lp: 280, lpQ: 0.6 },
      hat: { hp: [5600, 4600], hpQ: 0.6, lp: [8200, 7200], lpQ: 0.5, pk: [7000, 6200], pkQ: 1, pkGain: 1, attack: 0.003, decay: [0.022, 0.08], len: [0.15, 0.55] },
      perc: { wave: 'triangle', octave: -12, drop: 1.3, dropTime: 0.012, bpMul: 1, bpQ: 1.2, attack: 0.002, decay: 0.028, len: 0.3, noise: 0 },
      stab: { wave: 'sawtooth', jitter: 3, q: 1.8, cutMin: 260, cutRange: 7, env: [0.9, 0.9], envMax: 2600, envTau: 0.06, attack: 0.008, decayAt: 0.016, tauMin: 0.08, tauRange: 3.5, hp: 150, tail: 7, spread: 0.006 },
      pad: { osc: [['sawtooth', -11, 0, 1], ['sawtooth', 11, 0, 1], ['triangle', 0, -12, 0.4]], jitter: 3, attack: 2.2, release: 2.8, lp: 700, lpQ: 0.5, lfo: [0.024, 260], breath: [0.06, 0.12], spread: 1.3 },
      glint: { index: 0.8, indexEnd: 0.08, indexTau: 0.3, attack: 0.012, decayAt: 0.016, decay: 0.7, len: 5 },
      waves: { lanes: [-0.7, 0, 0.7], hp: 60, lpBase: 240, lpPeak: 1200, lpQ: 0.3, floor: 0.04, foam: 0, foamBand: [0, 0], rumble: 0.3, rumbleLp: 150, crackle: 0 },
      space: { ir: 'room', verbBand: [180, 5000], dlyBand: [320, 2000], dlyLpQ: 0.5, pan: 0.6, wow: [0.12, 0.0008], tape: 1, feedbackStart: 0.5 },
      throw: { feedback: 0.72, send: 1.5 },
      riser: { from: 200, to: 2000, q: 1 },
      duck: { attack: 0.015, release: 0.1 },
    },

    // 霧の中の四つ打ち: 聞こえないキックが拍ごとにほかの音を呼吸させる。低音は埋めない。柔らかな和音、厚いパッド
    fog: {
      version: 'fog-mix-0.3',
      mix: {
        kick: 0, bass: 0.3,
        hats: 0.32, hatsVerb: 0.13,
        perc: 0.22, percDly: 0.56, percVerb: 0.35,
        stabDry: 0.35, stabDly: 0.64, stabVerb: 0.48,
        padDry: 0.24, padVerb: 0.5,
        waves: 0.17, wavesVerb: 0.1,
        glint: 0.14, glintVerb: 0.63, glintDly: 0.25,
        riser: 0, riserVerb: 0,
        verbReturn: 0.5, dlyReturn: 0.65, dlyVerb: 0.28,
      },
      kick: { ghost: true }, // 音は出さない。拍ごとの呼吸（サイドチェイン）だけを動かす
      // fog ではベースを鳴らさない。役割を全曲調でそろえるために、音色だけ持っておく
      bass: { tri: 0.2, triDetune: 2, saw: 0, attack: 0.06, sustain: 0.8, release: 0.04, drive: 0.6, lp: 220, lpQ: 0.5 },
      hat: { hp: [7000, 5600], hpQ: 0.6, lp: [9000, 8000], lpQ: 0.5, pk: [8200, 7200], pkQ: 1, pkGain: 1, attack: 0.003, decay: [0.018, 0.05], len: [0.12, 0.4] },
      perc: { wave: 'sine', octave: -12, drop: 1.3, dropTime: 0.01, bpMul: 1, bpQ: 1.2, attack: 0.002, decay: 0.03, len: 0.3, noise: 0 },
      stab: { wave: 'triangle', jitter: 2.5, q: 1.2, cutMin: 320, cutRange: 8, env: [0.8, 0.8], envMax: 2400, envTau: 0.08, attack: 0.012, decayAt: 0.02, tauMin: 0.1, tauRange: 3, hp: 170, tail: 8, spread: 0.008 },
      pad: { osc: [['sawtooth', -10, 0, 1], ['sawtooth', 10, 0, 1], ['sine', 0, -12, 0.45]], jitter: 3, attack: 2.6, release: 3.2, lp: 720, lpQ: 0.4, lfo: [0.022, 240], breath: [0.06, 0.14], spread: 1.5 },
      glint: { index: 0.7, indexEnd: 0.08, indexTau: 0.3, attack: 0.015, decayAt: 0.02, decay: 0.8, len: 5 },
      // 霧の層: 泡の音はなく、暗い空気がゆっくり満ち引きする。波と波の間も薄く残る
      waves: { lanes: [-0.65, 0.05, 0.7], hp: 90, lpBase: 220, lpPeak: 520, lpQ: 0.3, floor: 0.12, foam: 0, foamBand: [0, 0], rumble: 0.25, rumbleLp: 150, crackle: 0 },
      space: { ir: 'hall', verbBand: [170, 5200], dlyBand: [320, 2000], dlyLpQ: 0.5, pan: 0.65, wow: [0.12, 0.0008], tape: 0, feedbackStart: 0.52 },
      throw: { feedback: 0.76, send: 1.6 },
      riser: { from: 220, to: 3000, q: 1 },
      duck: { attack: 0.025, release: 0.14 },
    },

    // デトロイト: ストリングス風のスタブ（鋸歯状波、ゆっくりめの立ち上がり）、広いストリングスのパッド、ベル風のきらめき、締まったキック
    motor: {
      version: 'motor-mix-0.1',
      mix: {
        kick: 0.42, bass: 0.24,
        hats: 0.26, hatsVerb: 0.07,
        perc: 0.2, percDly: 0.35, percVerb: 0.18,
        stabDry: 0.26, stabDly: 0.36, stabVerb: 0.3,
        padDry: 0.12, padVerb: 0.28,
        waves: 0.08, wavesVerb: 0.05,
        glint: 0.12, glintVerb: 0.45, glintDly: 0.2,
        riser: 0.12, riserVerb: 0.35,
        verbReturn: 0.45, dlyReturn: 0.6, dlyVerb: 0.22,
      },
      kick: { sweep: 3.6, mid: 1.35, t1: 0.024, t2: 0.1, attack: 0.003, decayAt: 0.026, decay: 0.1, floor: 0.3, lpMin: 110, lpRange: 110, lpQ: 0.9, click: 0.12, clickHz: 3000, clickFrom: 0.35, len: 1 },
      bass: { tri: 0.3, triDetune: 3, saw: 0.08, attack: 0.006, sustain: 0.7, release: 0.015, drive: 0.8, lp: 330, lpQ: 0.7 },
      hat: { hp: [7400, 6000], hpQ: 0.7, lp: [11000, 9500], lpQ: 0.5, pk: [9600, 8400], pkQ: 1.2, pkGain: 2, attack: 0.002, decay: [0.018, 0.065], len: [0.14, 0.55] },
      perc: { wave: 'triangle', octave: -12, drop: 1.5, dropTime: 0.01, bpMul: 1.1, bpQ: 1.8, attack: 0.001, decay: 0.02, len: 0.25, noise: 0.3, noiseHz: 2200, noiseQ: 2.5, noiseDecay: 0.008 },
      stab: { wave: 'sawtooth', jitter: 4, q: 1.4, cutMin: 420, cutRange: 9, env: [1.2, 1.2], envMax: 5200, envTau: 0.07, attack: 0.018, decayAt: 0.03, tauMin: 0.1, tauRange: 3.5, hp: 180, tail: 7, spread: 0.008 },
      pad: { osc: [['sawtooth', -12, 0, 1], ['sawtooth', 12, 0, 1], ['sawtooth', 0, 12, 0.35]], jitter: 3, attack: 1.4, release: 2.4, lp: 1300, lpQ: 0.5, lfo: [0.035, 400], breath: [0.08, 0.1], spread: 1.6 },
      glint: { index: 2.4, indexEnd: 0.2, indexTau: 0.3, attack: 0.004, decayAt: 0.006, decay: 0.9, len: 5, ratio: 3.5 },
      waves: { lanes: [-0.6, 0, 0.6], hp: 90, lpBase: 240, lpPeak: 700, lpQ: 0.3, floor: 0.08, foam: 0, foamBand: [0, 0], rumble: 0.2, rumbleLp: 150, crackle: 0 },
      space: { ir: 'hall', verbBand: [200, 7200], dlyBand: [380, 2800], dlyLpQ: 0.5, pan: 0.7, wow: [0.15, 0.0006], tape: 0, feedbackStart: 0.46 },
      throw: { feedback: 0.74, send: 1.6 },
      riser: { from: 280, to: 5600, q: 1.2 },
      duck: { attack: 0.012, release: 0.09 },
    },

    // マイクロハウス: プチプチしたクリック（高く短い音と、ほんの一瞬のノイズ）、短く弾むベース、小さく乾いた和音、軽いキック
    click: {
      version: 'click-mix-0.2',
      mix: {
        kick: 0.41, bass: 0.27,
        hats: 0.3, hatsVerb: 0.05,
        perc: 0.3, percDly: 0.22, percVerb: 0.1,
        stabDry: 0.2, stabDly: 0.18, stabVerb: 0.14,
        padDry: 0.11, padVerb: 0.18,
        waves: 0.06, wavesVerb: 0.03,
        glint: 0.09, glintVerb: 0.2, glintDly: 0.14,
        riser: 0, riserVerb: 0,
        verbReturn: 0.35, dlyReturn: 0.5, dlyVerb: 0.15,
      },
      kick: { sweep: 3, mid: 1.3, t1: 0.018, t2: 0.08, attack: 0.002, decayAt: 0.02, decay: 0.07, floor: 0.3, lpMin: 110, lpRange: 90, lpQ: 0.8, click: 0.06, clickHz: 3400, clickFrom: 0.4, len: 0.7 },
      bass: { tri: 0.35, triDetune: 2, saw: 0, attack: 0.003, sustain: 0.5, release: 0.01, drive: 0.9, lp: 300, lpQ: 0.9 },
      hat: { hp: [8200, 6800], hpQ: 0.7, lp: [12000, 10500], lpQ: 0.5, pk: [10200, 9000], pkQ: 1.4, pkGain: 1.5, attack: 0.001, decay: [0.01, 0.03], len: [0.08, 0.25] },
      perc: { wave: 'triangle', octave: 12, drop: 2.2, dropTime: 0.003, bpMul: 1, bpQ: 3, attack: 0.0006, decay: 0.006, len: 0.06, noise: 0.55, noiseHz: 6000, noiseQ: 2.5, noiseDecay: 0.004 },
      stab: { wave: 'triangle', jitter: 2, q: 2, cutMin: 500, cutRange: 6, env: [1, 1], envMax: 3600, envTau: 0.03, attack: 0.003, decayAt: 0.006, tauMin: 0.035, tauRange: 3, hp: 220, tail: 6, spread: 0.004 },
      pad: { osc: [['triangle', -6, 0, 1], ['sine', 6, 0, 0.8]], jitter: 2, attack: 2, release: 2.4, lp: 900, lpQ: 0.4, lfo: [0.03, 200], breath: [0.07, 0.1], spread: 1.2 },
      glint: { index: 1.1, indexEnd: 0.05, indexTau: 0.03, attack: 0.001, decayAt: 0.002, decay: 0.08, len: 0.5, ratio: 2 },
      waves: { lanes: [-0.5, 0, 0.5], hp: 120, lpBase: 300, lpPeak: 800, lpQ: 0.3, floor: 0.06, foam: 0, foamBand: [0, 0], rumble: 0.1, rumbleLp: 140, crackle: 0 },
      space: { ir: 'room', verbBand: [240, 7000], dlyBand: [500, 3600], dlyLpQ: 0.6, pan: 0.8, wow: [0.1, 0.0004], tape: 0, feedbackStart: 0.34 },
      throw: { feedback: 0.66, send: 1.4 },
      riser: { from: 300, to: 4000, q: 1 },
      duck: { attack: 0.01, release: 0.07 },
    },
  };

  U.patches = Object.freeze({ PATCHES: deepFreeze(PATCHES), IMPULSES: deepFreeze(IMPULSES) });
})((globalThis.Undertow = globalThis.Undertow || {}));
