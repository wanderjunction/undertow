/*
 * Undertow — WORLD（曲調）ごとの CONTENT
 *
 * パートの役割（kick / bass / hats / perc / stabs / pad / waves / glints）とセクションの種類は全 WORLD 共通。
 * WORLD が変えるのは中身だけ: テンポ、展開、パターンの選び方、和声、空間の深さ、予算。
 * 音色とミックスは js/audio/patches.js（WORLD ごとに持ち、WORLD をまたいで共有しない）。
 *
 * 名前（label）は表示用。変えても音や動きには影響しない。
 *
 * sections の cues: [セクション内の小節, 層, 目標の存在感, 何小節かけて]
 */
(function (U) {
  'use strict';
  const { deepFreeze } = U.util;

  const WORLDS = {
    // 静かな波の上の、ダブ・ミニマル。v1.0 の音
    tide: {
      label: 'tide',
      bpm: [116, 122],
      swing: [0.05, 0.11], // 奇数16分の遅れ（ステップ比）
      delaySteps: 3, // 付点8分のピンポン
      progressions: { ids: ['still', 'i-iv', 'i-VI', 'i-VII', 'i-v', 'wander', 'ebb'] },
      changeChance: { intro: 0.3, rise: 0.4, groove: 0.6, deep: 0.45, breakdown: 0.5 },
      budget: { density: 11, occupancy: 5.2, smear: 3.2, joint: 0.8 },
      drift: { bright: [27, 64, 150], decay: [35, 86], space: [44, 105] }, // 周期（小節）
      feedback: { base: 0.56, swing: 0.06, min: 0.4, max: 0.72 },
      throwChance: { groove: 0.3, deep: 0.3, rise: 0.2, breakdown: 0.5 },
      riser: true,
      percSlots: [3, 5, 7, 11, 13, 14, 15],
      percHits: [1, 3],
      waves: { periods: [3, 4, 5], chance: 0.85, rise: [20, 34], fall: [34, 58], peak: [0.35, 1] },
      glint: { starts: [0, 2, 3, 6, 7, 10], gaps: [3, 4, 6], range: [74, 91] },
      sections: {
        intro: {
          bars: [4], kickless: true, duck: 0, open: 0.85,
          stabPool: 'sparse', hatStyles: ['sparse'], bassPool: ['offbeat'], glint: 0.5,
          cues: [
            [0, 'waves', 1, 2], [0, 'pad', 1, 4], [0, 'stabs', 0.55, 4], [0, 'glints', 0.6, 4],
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0, 0], [0, 'perc', 0, 0],
            [2, 'kick', 0.22, 2], // 水面下の鼓動
          ],
          next: [['rise', 1]],
        },
        rise: {
          bars: [8], kickless: false, duck: 0.3, open: 0.9,
          stabPool: 'full', hatStyles: ['open'], bassPool: ['offbeat', 'sparse'], glint: 0.35,
          cues: [
            [0, 'kick', 1, 8], [0, 'stabs', 0.8, 4], [0, 'pad', 0.85, 8], [0, 'waves', 0.7, 8],
            [0, 'glints', 0.4, 4], [2, 'hats', 0.5, 6], [4, 'bass', 0.9, 4], [4, 'perc', 0.4, 4],
          ],
          next: [['groove', 1]],
        },
        groove: {
          bars: [24, 32, 32, 40], kickless: false, duck: 0.45, open: 1,
          stabPool: 'full', hatStyles: ['open', 'sixteenths'], bassPool: ['offbeat', 'ghost', 'rolling'], glint: 0.25,
          cues: [
            [0, 'kick', 1, 0], [0, 'bass', 1, 0], [0, 'hats', 1, 2], [0, 'perc', 0.75, 2],
            [0, 'stabs', 1, 2], [0, 'pad', 0.6, 4], [0, 'waves', 0.45, 4], [0, 'glints', 0.3, 4],
          ],
          next: [['deep', 0.5], ['breakdown', 0.35], ['groove', 0.15]],
        },
        deep: {
          bars: [16, 24, 32], kickless: false, duck: 0.4, open: 0.75,
          stabPool: 'sparse', hatStyles: ['sparse', 'open'], bassPool: ['offbeat', 'sparse'], glint: 0.45,
          cues: [
            [0, 'kick', 1, 0], [0, 'bass', 0.9, 2], [0, 'hats', 0.55, 4], [0, 'perc', 0.3, 4],
            [0, 'stabs', 0.75, 4], [0, 'pad', 0.85, 4], [0, 'waves', 0.6, 4], [0, 'glints', 0.5, 4],
          ],
          next: [['groove', 0.5], ['breakdown', 0.5]],
        },
        breakdown: {
          bars: [8, 12, 16], kickless: true, duck: 0, open: 1.35,
          stabPool: 'sparse', hatStyles: ['sparse'], bassPool: ['offbeat'], glint: 0.6,
          cues: [
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0.22, 2], [0, 'perc', 0, 2],
            [0, 'stabs', 0.9, 2], [0, 'pad', 1, 3], [0, 'waves', 1, 4], [0, 'glints', 0.8, 2],
          ],
          next: [['rise', 0.5], ['groove', 0.5]],
        },
      },
    },

    // ゆっくり漂うアンビエント。ビートは水面下に留まり、パッドがふわふわと主役になる
    drift: {
      label: 'drift',
      bpm: [96, 104],
      swing: [0.02, 0.06],
      delaySteps: 6, // 付点4分。遠くでゆっくり返る
      progressions: { ids: ['still', 'i-VI', 'i-VII', 'wander', 'ebb'], bars: [16] },
      changeChance: { intro: 0.2, rise: 0.3, groove: 0.45, deep: 0.35, breakdown: 0.4 },
      budget: { density: 7, occupancy: 7.5, smear: 5, joint: 0.8 },
      drift: { bright: [40, 96, 200], decay: [50, 120], space: [60, 140] },
      feedback: { base: 0.42, swing: 0.05, min: 0.32, max: 0.55 },
      throwChance: { groove: 0.1, deep: 0.1, rise: 0, breakdown: 0.15 },
      riser: false,
      percSlots: [6, 11, 14],
      percHits: [1, 2],
      waves: { periods: [4, 5, 7], chance: 0.8, rise: [32, 48], fall: [48, 80], peak: [0.3, 0.8] },
      glint: { starts: [0, 6, 10], gaps: [16], range: [62, 77] },
      // 澄んだ鈴: 小節の 3 拍目の裏で、ごくまれに（1 小節に 1 回の機会、8 % で）
      ride: [[10, 0.8]],
      rideChance: 0.08, // アクセント: 1 小節に 1 音まで（次の音は小節の外）、中音域
      sections: {
        intro: {
          bars: [8], kickless: true, duck: 0, open: 0.8,
          stabPool: 'drift', hatStyles: ['breath'], bassPool: ['swell'], glint: 0.6,
          cues: [
            [0, 'waves', 0.8, 4], [0, 'pad', 1, 6], [0, 'stabs', 0.5, 6], [0, 'glints', 0.5, 4],
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0, 0], [0, 'perc', 0, 0],
            [4, 'kick', 0.15, 4],
          ],
          next: [['rise', 1]],
        },
        rise: {
          bars: [8], kickless: false, duck: 0.1, open: 0.9,
          stabPool: 'drift', hatStyles: ['breath'], bassPool: ['swell'], glint: 0.5,
          cues: [
            [0, 'kick', 0.4, 8], [0, 'stabs', 0.6, 4], [0, 'pad', 1, 4], [0, 'waves', 0.6, 8],
            [0, 'glints', 0.5, 4], [2, 'hats', 0.4, 6], [4, 'bass', 0.7, 4], [4, 'perc', 0.3, 4],
          ],
          next: [['groove', 1]],
        },
        groove: {
          bars: [32, 40, 48], kickless: false, duck: 0.14, open: 1,
          stabPool: 'drift', hatStyles: ['breath', 'whisper'], bassPool: ['swell', 'sparse'], glint: 0.5,
          cues: [
            [0, 'kick', 0.45, 2], [0, 'bass', 0.75, 2], [0, 'hats', 0.55, 4], [0, 'perc', 0.4, 4],
            [0, 'stabs', 0.7, 4], [0, 'pad', 1, 4], [0, 'waves', 0.5, 4], [0, 'glints', 0.5, 4],
          ],
          next: [['deep', 0.45], ['breakdown', 0.4], ['groove', 0.15]],
        },
        deep: {
          bars: [24, 32], kickless: false, duck: 0.1, open: 0.8,
          stabPool: 'drift', hatStyles: ['breath'], bassPool: ['swell'], glint: 0.6,
          cues: [
            [0, 'kick', 0.3, 2], [0, 'bass', 0.6, 2], [0, 'hats', 0.3, 4], [0, 'perc', 0.2, 4],
            [0, 'stabs', 0.5, 4], [0, 'pad', 1, 4], [0, 'waves', 0.6, 4], [0, 'glints', 0.5, 4],
          ],
          next: [['groove', 0.5], ['breakdown', 0.5]],
        },
        breakdown: {
          bars: [12, 16], kickless: true, duck: 0, open: 1.2,
          stabPool: 'drift', hatStyles: ['breath'], bassPool: ['swell'], glint: 0.7,
          cues: [
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0.15, 2], [0, 'perc', 0, 2],
            [0, 'stabs', 0.6, 2], [0, 'pad', 1, 3], [0, 'waves', 0.8, 4], [0, 'glints', 0.5, 4],
          ],
          next: [['rise', 0.6], ['groove', 0.4]],
        },
      },
    },

    // ダブテクノ。1 つの和音（根音を抜いた短 9・短 11）をほぼ動かさず、1 小節の同じ形で刻み続け、フィルターが 16 小節かけて
    // 大きく開け閉めする。深いテープ・エコーとヒス。きらめきは鳴らさない（tide は波の上のダブ、echo はエコーの部屋の中の和音）
    echo: {
      label: 'echo',
      bpm: [118, 124],
      swing: [0.06, 0.12],
      delaySteps: 3,
      voicing: 'rootless',
      oneBar: true,
      sweep: { bars: 16, depth: 0.42 },
      progressions: { ids: ['still', 'dust-still'], bars: [16] }, // 和音はほぼ動かない（短 9 か短 11 のまま）
      changeChance: { intro: 0.3, rise: 0.4, groove: 0.55, deep: 0.45, breakdown: 0.5 },
      budget: { density: 11, occupancy: 6.2, smear: 3.8, joint: 0.8 },
      drift: { bright: [23, 56, 128], decay: [30, 74], space: [36, 88] },
      feedback: { base: 0.66, swing: 0.05, min: 0.54, max: 0.76 },
      throwChance: { groove: 0.5, deep: 0.45, rise: 0.3, breakdown: 0.7 },
      riser: true,
      percSlots: [3, 5, 7, 11, 13, 14, 15],
      percHits: [2, 4],
      waves: { periods: [3, 4, 5], chance: 0.5, rise: [20, 34], fall: [34, 58], peak: [0.2, 0.5] },
      glint: { starts: [2, 6, 10], gaps: [3, 6], range: [74, 91] },
      sections: {
        intro: {
          bars: [4], kickless: true, duck: 0, open: 0.9,
          stabPool: 'dubSparse', hatStyles: ['sparse'], bassPool: ['offbeat'], glint: 0.2,
          cues: [
            [0, 'waves', 0.6, 2], [0, 'pad', 0.25, 4], [0, 'stabs', 0.7, 2], [0, 'glints', 0, 0],
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0, 0], [0, 'perc', 0.3, 2],
            [2, 'kick', 0.22, 2],
          ],
          next: [['rise', 1]],
        },
        rise: {
          bars: [8], kickless: false, duck: 0.3, open: 0.95,
          stabPool: 'dub', hatStyles: ['open'], bassPool: ['offbeat', 'dub'], glint: 0.2,
          cues: [
            [0, 'kick', 1, 8], [0, 'stabs', 0.9, 4], [0, 'pad', 0.25, 8], [0, 'waves', 0.45, 8],
            [0, 'glints', 0, 0], [2, 'hats', 0.5, 6], [4, 'bass', 0.95, 4], [0, 'perc', 0.6, 4],
          ],
          next: [['groove', 1]],
        },
        groove: {
          bars: [24, 32, 40], kickless: false, duck: 0.4, open: 1,
          stabPool: 'dub', hatStyles: ['open', 'sparse'], bassPool: ['dub', 'offbeat'], glint: 0.2,
          cues: [
            [0, 'kick', 1, 0], [0, 'bass', 1, 0], [0, 'hats', 0.8, 2], [0, 'perc', 0.9, 2],
            [0, 'stabs', 1, 2], [0, 'pad', 0.2, 4], [0, 'waves', 0.35, 4], [0, 'glints', 0, 0],
          ],
          next: [['deep', 0.45], ['breakdown', 0.4], ['groove', 0.15]],
        },
        deep: {
          bars: [16, 24], kickless: false, duck: 0.35, open: 0.85,
          stabPool: 'dubSparse', hatStyles: ['sparse'], bassPool: ['dub', 'offbeat'], glint: 0.25,
          cues: [
            [0, 'kick', 1, 0], [0, 'bass', 0.95, 2], [0, 'hats', 0.45, 4], [0, 'perc', 0.6, 4],
            [0, 'stabs', 0.8, 4], [0, 'pad', 0.3, 4], [0, 'waves', 0.45, 4], [0, 'glints', 0, 0],
          ],
          next: [['groove', 0.5], ['breakdown', 0.5]],
        },
        breakdown: {
          bars: [8, 12], kickless: true, duck: 0, open: 1.3,
          stabPool: 'dub', hatStyles: ['sparse'], bassPool: ['offbeat'], glint: 0.3,
          cues: [
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0.2, 2], [0, 'perc', 0.5, 2],
            [0, 'stabs', 1, 2], [0, 'pad', 0.3, 3], [0, 'waves', 0.5, 4], [0, 'glints', 0, 0],
          ],
          next: [['rise', 0.4], ['groove', 0.6]],
        },
      },
    },

    // 明け方。唯一の長調。澄んだ和音と、木琴のようなきらめき
    dawn: {
      label: 'dawn',
      mode: 'major',
      bpm: [110, 116],
      swing: [0.03, 0.08],
      delaySteps: 3,
      progressions: { ids: ['I', 'I-IV', 'I-vi', 'I-IV-vi-V'] },
      changeChance: { intro: 0.3, rise: 0.4, groove: 0.55, deep: 0.45, breakdown: 0.5 },
      budget: { density: 11, occupancy: 5.2, smear: 3, joint: 0.8 },
      drift: { bright: [30, 70, 160], decay: [38, 90], space: [48, 110] },
      feedback: { base: 0.48, swing: 0.05, min: 0.36, max: 0.62 },
      throwChance: { groove: 0.15, deep: 0.15, rise: 0.1, breakdown: 0.3 },
      riser: true,
      percSlots: [3, 7, 11, 14, 15],
      percHits: [1, 3],
      waves: { periods: [4, 5, 6], chance: 0.7, rise: [24, 40], fall: [40, 64], peak: [0.25, 0.7] },
      glint: { starts: [0, 2, 4, 6, 8, 10], gaps: [2, 3, 4], range: [76, 93] },
      sections: {
        intro: {
          bars: [4], kickless: true, duck: 0, open: 0.9,
          stabPool: 'sparse', hatStyles: ['sparse'], bassPool: ['offbeat'], glint: 0.6,
          cues: [
            [0, 'waves', 0.8, 2], [0, 'pad', 1, 4], [0, 'stabs', 0.5, 4], [0, 'glints', 0.7, 2],
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0, 0], [0, 'perc', 0, 0],
            [2, 'kick', 0.25, 2],
          ],
          next: [['rise', 1]],
        },
        rise: {
          bars: [8], kickless: false, duck: 0.25, open: 1,
          stabPool: 'full', hatStyles: ['open'], bassPool: ['offbeat', 'sparse'], glint: 0.5,
          cues: [
            [0, 'kick', 1, 8], [0, 'stabs', 0.8, 4], [0, 'pad', 0.9, 8], [0, 'waves', 0.6, 8],
            [0, 'glints', 0.6, 4], [2, 'hats', 0.5, 6], [4, 'bass', 0.9, 4], [4, 'perc', 0.4, 4],
          ],
          next: [['groove', 1]],
        },
        groove: {
          bars: [24, 32, 40], kickless: false, duck: 0.35, open: 1.1,
          stabPool: 'full', hatStyles: ['open', 'sparse'], bassPool: ['offbeat', 'ghost', 'sparse'], glint: 0.45,
          cues: [
            [0, 'kick', 1, 0], [0, 'bass', 1, 0], [0, 'hats', 0.9, 2], [0, 'perc', 0.6, 2],
            [0, 'stabs', 0.9, 2], [0, 'pad', 0.7, 4], [0, 'waves', 0.4, 4], [0, 'glints', 0.6, 4],
          ],
          next: [['deep', 0.4], ['breakdown', 0.4], ['groove', 0.2]],
        },
        deep: {
          bars: [16, 24], kickless: false, duck: 0.3, open: 0.95,
          stabPool: 'sparse', hatStyles: ['sparse'], bassPool: ['offbeat', 'sparse'], glint: 0.55,
          cues: [
            [0, 'kick', 1, 0], [0, 'bass', 0.9, 2], [0, 'hats', 0.5, 4], [0, 'perc', 0.3, 4],
            [0, 'stabs', 0.7, 4], [0, 'pad', 0.9, 4], [0, 'waves', 0.5, 4], [0, 'glints', 0.7, 4],
          ],
          next: [['groove', 0.5], ['breakdown', 0.5]],
        },
        breakdown: {
          bars: [8, 12], kickless: true, duck: 0, open: 1.3,
          stabPool: 'sparse', hatStyles: ['sparse'], bassPool: ['offbeat'], glint: 0.7,
          cues: [
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0.2, 2], [0, 'perc', 0, 2],
            [0, 'stabs', 0.8, 2], [0, 'pad', 1, 3], [0, 'waves', 0.8, 4], [0, 'glints', 0.8, 2],
          ],
          next: [['rise', 0.5], ['groove', 0.5]],
        },
      },
    },

    // 月明かりの水面。質感の枠はノイズではなく、和音の音が光のように満ちては消える。こもった和音と柔らかなビート
    // （曲の作りは旧 rain / tape のまま）
    moon: {
      label: 'moon',
      bpm: [104, 110],
      swing: [0.04, 0.09],
      delaySteps: 4, // 4分。雨だれのように間をあけて返る
      progressions: { ids: ['still', 'i-iv', 'i-VI', 'ebb'], bars: [8, 16] },
      changeChance: { intro: 0.25, rise: 0.35, groove: 0.5, deep: 0.4, breakdown: 0.45 },
      budget: { density: 9, occupancy: 6.5, smear: 4, joint: 0.8 },
      drift: { bright: [36, 84, 180], decay: [44, 100], space: [52, 120] },
      feedback: { base: 0.46, swing: 0.05, min: 0.36, max: 0.6 },
      throwChance: { groove: 0.15, deep: 0.15, rise: 0.05, breakdown: 0.25 },
      riser: false,
      percSlots: [5, 7, 11, 13, 14],
      percHits: [1, 2],
      // tones: 波ひとつにつき、いま鳴っている和音から選ぶ音の数（光のように満ちては消える）
      waves: { periods: [4, 6, 7], chance: 0.7, rise: [28, 44], fall: [44, 72], peak: [0.3, 0.7], tones: [1, 2] },
      glint: { starts: [0, 3, 6, 10], gaps: [3, 5, 6], range: [72, 88] },
      sections: {
        intro: {
          bars: [8], kickless: true, duck: 0, open: 0.8,
          stabPool: 'drift', hatStyles: ['breath'], bassPool: ['swell'], glint: 0.4,
          cues: [
            [0, 'waves', 1, 2], [0, 'pad', 0.9, 6], [0, 'stabs', 0.6, 4], [0, 'glints', 0.5, 4],
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0, 0], [0, 'perc', 0, 0],
            [4, 'kick', 0.2, 4],
          ],
          next: [['rise', 1]],
        },
        rise: {
          bars: [8], kickless: false, duck: 0.15, open: 0.85,
          stabPool: 'drift', hatStyles: ['whisper'], bassPool: ['swell', 'sparse'], glint: 0.4,
          cues: [
            [0, 'kick', 0.6, 8], [0, 'stabs', 0.8, 4], [0, 'pad', 0.9, 4], [0, 'waves', 0.9, 8],
            [0, 'glints', 0.5, 4], [2, 'hats', 0.5, 6], [4, 'bass', 0.8, 4], [4, 'perc', 0.4, 4],
          ],
          next: [['groove', 1]],
        },
        groove: {
          bars: [32, 40], kickless: false, duck: 0.2, open: 0.9,
          stabPool: 'drift', hatStyles: ['whisper', 'breath'], bassPool: ['sparse', 'offbeat'], glint: 0.35,
          cues: [
            [0, 'kick', 0.65, 2], [0, 'bass', 0.9, 2], [0, 'hats', 0.7, 4], [0, 'perc', 0.5, 4],
            [0, 'stabs', 0.9, 4], [0, 'pad', 0.8, 4], [0, 'waves', 0.8, 4], [0, 'glints', 0.5, 4],
          ],
          next: [['deep', 0.45], ['breakdown', 0.4], ['groove', 0.15]],
        },
        deep: {
          bars: [16, 24], kickless: false, duck: 0.15, open: 0.75,
          stabPool: 'drift', hatStyles: ['breath'], bassPool: ['swell', 'sparse'], glint: 0.45,
          cues: [
            [0, 'kick', 0.5, 2], [0, 'bass', 0.8, 2], [0, 'hats', 0.4, 4], [0, 'perc', 0.3, 4],
            [0, 'stabs', 0.7, 4], [0, 'pad', 0.9, 4], [0, 'waves', 0.9, 4], [0, 'glints', 0.6, 4],
          ],
          next: [['groove', 0.5], ['breakdown', 0.5]],
        },
        breakdown: {
          bars: [8, 12], kickless: true, duck: 0, open: 1.05,
          stabPool: 'drift', hatStyles: ['breath'], bassPool: ['swell'], glint: 0.6,
          cues: [
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0.15, 2], [0, 'perc', 0, 2],
            [0, 'stabs', 0.7, 2], [0, 'pad', 1, 3], [0, 'waves', 1, 4], [0, 'glints', 0.7, 2],
          ],
          next: [['rise', 0.5], ['groove', 0.5]],
        },
      },
    },

    // ミニマル（Robert Hood の Minimal Nation のような）。主役は 1 小節の単音のモチーフ（SH-101 風）で、間を大事にして
    // 延々と繰り返し、フィルターのつまみだけがゆっくり動く。高いキックと低いキックが交互に鳴り、刻むハットとタムのループがうねる。
    // 和音・パッド・きらめきは鳴らさず、残響もほとんどない。グルーヴに入り込んで、それを続ける
    pulse: {
      label: 'pulse',
      bpm: [130, 134],
      swing: [0.06, 0.12],
      delaySteps: 3,
      voicing: 'mono',
      oneBar: true,
      kickTune: [0, 3, 0, 3],
      progressions: { ids: ['still', 'i-VII', 'i-iv'], bars: [16] },
      changeChance: { intro: 0.3, rise: 0.4, groove: 0.5, deep: 0.45, breakdown: 0.5 },
      budget: { density: 17, occupancy: 7, smear: 6, joint: 0.9 }, // 16 分のハット、タムのループ、5〜6 打のモチーフのぶん余裕を持たせる（単音のスタブは短い）
      drift: { bright: [20, 48, 120], decay: [28, 64], space: [34, 80] },
      feedback: { base: 0.3, swing: 0.05, min: 0.22, max: 0.4 },
      throwChance: { groove: 0, deep: 0, rise: 0, breakdown: 0 },
      riser: false,
      percSlots: [3, 7, 11, 14],
      percHits: [2, 3],
      // タム: キックと重ならない位置に、2 小節の決まった形で
      percLoop: [[3, 0.7], [7, 0.55], [11, 0.8], [14, 0.6], [19, 0.7], [23, 0.55], [26, 0.8], [30, 0.6], [31, 0.5]],
      sweep: { bars: 12, depth: 0.32 }, // モチーフのフィルターを 12 小節で一回り
      waves: { periods: [4, 5, 6], chance: 0.4, rise: [16, 28], fall: [28, 44], peak: [0.15, 0.35] },
      glint: { starts: [2, 6, 10, 14], gaps: [2, 4], range: [74, 91] },
      sections: {
        intro: {
          bars: [4], kickless: true, duck: 0, open: 0.85,
          stabPool: 'hood', hatStyles: ['sixteenths'], bassPool: ['offbeat'], glint: 0,
          cues: [
            [0, 'waves', 0.3, 2], [0, 'pad', 0, 0], [0, 'stabs', 0.6, 4], [0, 'glints', 0, 0],
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0.4, 2], [0, 'perc', 0, 0],
            [2, 'kick', 0.4, 2],
          ],
          next: [['rise', 1]],
        },
        rise: {
          bars: [8], kickless: false, duck: 0.2, open: 0.95,
          stabPool: 'hood', hatStyles: ['detroit16'], bassPool: ['offbeat'], glint: 0,
          cues: [
            [0, 'kick', 1, 4], [0, 'stabs', 0.85, 4], [0, 'pad', 0, 0], [0, 'waves', 0.2, 8],
            [0, 'glints', 0, 0], [0, 'hats', 0.85, 4], [4, 'bass', 0.9, 4], [2, 'perc', 0.7, 4],
          ],
          next: [['groove', 1]],
        },
        groove: {
          bars: [32, 40, 48], kickless: false, duck: 0.25, open: 1,
          stabPool: 'hood', hatStyles: ['detroit16', 'sixteenths', 'open'], bassPool: ['offbeat', 'ghost'], glint: 0,
          cues: [
            [0, 'kick', 1, 0], [0, 'bass', 1, 0], [0, 'hats', 1, 2], [0, 'perc', 0.9, 2],
            [0, 'stabs', 1, 2], [0, 'pad', 0, 0], [0, 'waves', 0.15, 4], [0, 'glints', 0, 0],
          ],
          next: [['deep', 0.5], ['breakdown', 0.25], ['groove', 0.25]],
        },
        deep: {
          // モチーフが引いて、打楽器だけのうねりになる
          bars: [16, 24], kickless: false, duck: 0.2, open: 0.8,
          stabPool: 'hood', hatStyles: ['detroit16', 'sixteenths'], bassPool: ['offbeat', 'rolling'], glint: 0,
          cues: [
            [0, 'kick', 1, 0], [0, 'bass', 1, 2], [0, 'hats', 0.9, 4], [0, 'perc', 1, 4],
            [0, 'stabs', 0.45, 4], [0, 'pad', 0, 0], [0, 'waves', 0.2, 4], [0, 'glints', 0, 0],
          ],
          next: [['groove', 0.65], ['breakdown', 0.35]],
        },
        breakdown: {
          bars: [4, 8], kickless: true, duck: 0, open: 1.2,
          stabPool: 'hood', hatStyles: ['sparse'], bassPool: ['offbeat'], glint: 0,
          cues: [
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0.4, 2], [0, 'perc', 0.3, 2],
            [0, 'stabs', 1, 2], [0, 'pad', 0, 0], [0, 'waves', 0.35, 4], [0, 'glints', 0, 0],
          ],
          next: [['rise', 0.3], ['groove', 0.7]],
        },
      },
    },

    // 静けさ。リラクゼーションに全振り。キックは遠い心拍ほど、シンギングボウルがまれに長く響き、光がゆっくり満ちる
    calm: {
      label: 'calm',
      bpm: [80, 88],
      swing: [0, 0.03],
      delaySteps: 8, // 2 分。ゆっくり遠くで返る
      progressions: { ids: ['still', 'i-VI', 'i-iv'], bars: [16] },
      changeChance: { intro: 0.15, rise: 0.2, groove: 0.3, deep: 0.25, breakdown: 0.3 },
      budget: { density: 5, occupancy: 9, smear: 6, joint: 0.8 },
      drift: { bright: [60, 140, 300], decay: [70, 170], space: [80, 190] },
      feedback: { base: 0.38, swing: 0.04, min: 0.3, max: 0.5 },
      throwChance: { groove: 0, deep: 0, rise: 0, breakdown: 0 },
      riser: false,
      percSlots: [6, 14],
      percHits: [1, 1],
      waves: { periods: [5, 7, 9], chance: 0.75, rise: [40, 64], fall: [64, 100], peak: [0.25, 0.6], tones: [1, 2] },
      glint: { starts: [0, 8], gaps: [12, 16], range: [55, 72] }, // シンギングボウルの音域
      sections: {
        intro: {
          bars: [8], kickless: true, duck: 0, open: 0.7,
          stabPool: 'drift', hatStyles: ['breath'], bassPool: ['swell'], glint: 0.6,
          cues: [
            [0, 'waves', 1, 6], [0, 'pad', 1, 8], [0, 'stabs', 0.3, 8], [0, 'glints', 0.8, 2],
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0, 0], [0, 'perc', 0, 0],
          ],
          next: [['rise', 1]],
        },
        rise: {
          bars: [8], kickless: false, duck: 0.05, open: 0.75,
          stabPool: 'drift', hatStyles: ['breath'], bassPool: ['swell'], glint: 0.55,
          cues: [
            [0, 'kick', 0.12, 8], [0, 'stabs', 0.35, 4], [0, 'pad', 1, 4], [0, 'waves', 0.9, 8],
            [0, 'glints', 0.8, 4], [4, 'hats', 0.12, 4], [4, 'bass', 0.5, 4], [4, 'perc', 0.1, 4],
          ],
          next: [['groove', 1]],
        },
        groove: {
          bars: [40, 56], kickless: false, duck: 0.05, open: 0.8,
          stabPool: 'drift', hatStyles: ['breath'], bassPool: ['swell'], glint: 0.5,
          cues: [
            [0, 'kick', 0.15, 4], [0, 'bass', 0.55, 4], [0, 'hats', 0.12, 4], [0, 'perc', 0.1, 4],
            [0, 'stabs', 0.35, 4], [0, 'pad', 1, 4], [0, 'waves', 0.9, 4], [0, 'glints', 0.8, 4],
          ],
          next: [['deep', 0.5], ['breakdown', 0.5]],
        },
        deep: {
          bars: [24, 32], kickless: false, duck: 0.03, open: 0.7,
          stabPool: 'drift', hatStyles: ['breath'], bassPool: ['swell'], glint: 0.6,
          cues: [
            [0, 'kick', 0.1, 4], [0, 'bass', 0.45, 4], [0, 'hats', 0.06, 4], [0, 'perc', 0, 4],
            [0, 'stabs', 0.25, 4], [0, 'pad', 1, 4], [0, 'waves', 1, 4], [0, 'glints', 0.9, 4],
          ],
          next: [['groove', 0.5], ['breakdown', 0.5]],
        },
        breakdown: {
          bars: [12, 16], kickless: true, duck: 0, open: 0.8,
          stabPool: 'drift', hatStyles: ['breath'], bassPool: ['swell'], glint: 0.7,
          cues: [
            [0, 'kick', 0, 0], [0, 'bass', 0.3, 4], [0, 'hats', 0, 2], [0, 'perc', 0, 2],
            [0, 'stabs', 0.3, 2], [0, 'pad', 1, 3], [0, 'waves', 1, 4], [0, 'glints', 1, 2],
          ],
          next: [['rise', 0.5], ['groove', 0.5]],
        },
      },
    },

    // 滑るように流れる。四つ打ちの上で、ベース（3 ステップ）・パーカッション（5 ステップ）・アルペジオ（形の長さ 5）が
    // 16 で割り切れない周期で回り、少しずつずれながら途切れなく流れる
    glide: {
      label: 'glide',
      bpm: [120, 124],
      swing: [0, 0],
      delaySteps: 3,
      progressions: { ids: ['still', 'i-iv', 'i-VI', 'i-VII'], bars: [8, 16] },
      changeChance: { intro: 0.3, rise: 0.4, groove: 0.5, deep: 0.4, breakdown: 0.45 },
      budget: { density: 13, occupancy: 6, smear: 3, joint: 0.85 },
      drift: { bright: [26, 60, 140], decay: [34, 80], space: [40, 96] },
      feedback: { base: 0.44, swing: 0.05, min: 0.34, max: 0.58 },
      throwChance: { groove: 0.15, deep: 0.15, rise: 0.1, breakdown: 0.3 },
      riser: true,
      percSlots: [3, 7, 11, 15],
      percHits: [1, 2],
      // poly: 周期のずれたパターン。この WORLD では、ふつうのベース・パーカッション・きらめきの代わりに使う
      poly: {
        bass: { cycle: 3, len: 0.9, accent: [1, 0.6, 0.75, 0.55] },
        perc: { cycle: 5, offset: 2 },
        arp: { every: 1, shape: [0, 2, 4, 3, 1], accent: [1, 0.55, 0.7] },
      },
      waves: { periods: [4, 5, 6], chance: 0.6, rise: [20, 32], fall: [32, 52], peak: [0.25, 0.6] },
      glint: { starts: [0], gaps: [4], range: [72, 91] },
      sections: {
        intro: {
          bars: [4], kickless: true, duck: 0, open: 0.85,
          stabPool: 'sparse', hatStyles: ['sparse'], bassPool: ['offbeat'], glint: 0.35,
          cues: [
            [0, 'waves', 0.6, 2], [0, 'pad', 0.8, 4], [0, 'stabs', 0.4, 4], [0, 'glints', 0.5, 4],
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0, 0], [0, 'perc', 0, 0],
            [2, 'kick', 0.25, 2],
          ],
          next: [['rise', 1]],
        },
        rise: {
          bars: [8], kickless: false, duck: 0.3, open: 0.95,
          stabPool: 'sparse', hatStyles: ['sixteenths'], bassPool: ['offbeat'], glint: 0.35,
          cues: [
            [0, 'kick', 1, 8], [0, 'stabs', 0.5, 4], [0, 'pad', 0.7, 8], [0, 'waves', 0.5, 8],
            [0, 'glints', 0.8, 6], [2, 'hats', 0.6, 6], [2, 'bass', 0.9, 4], [4, 'perc', 0.6, 4],
          ],
          next: [['groove', 1]],
        },
        groove: {
          bars: [32, 40], kickless: false, duck: 0.4, open: 1,
          stabPool: 'sparse', hatStyles: ['sixteenths', 'open'], bassPool: ['offbeat'], glint: 0.35,
          cues: [
            [0, 'kick', 1, 0], [0, 'bass', 1, 0], [0, 'hats', 0.8, 2], [0, 'perc', 0.8, 2],
            [0, 'stabs', 0.5, 2], [0, 'pad', 0.55, 4], [0, 'waves', 0.35, 4], [0, 'glints', 1, 2],
          ],
          next: [['deep', 0.45], ['breakdown', 0.4], ['groove', 0.15]],
        },
        deep: {
          bars: [16, 24], kickless: false, duck: 0.35, open: 0.85,
          stabPool: 'sparse', hatStyles: ['sparse'], bassPool: ['offbeat'], glint: 0.3,
          cues: [
            [0, 'kick', 1, 0], [0, 'bass', 0.9, 2], [0, 'hats', 0.5, 4], [0, 'perc', 0.5, 4],
            [0, 'stabs', 0.35, 4], [0, 'pad', 0.75, 4], [0, 'waves', 0.45, 4], [0, 'glints', 0.8, 4],
          ],
          next: [['groove', 0.55], ['breakdown', 0.45]],
        },
        breakdown: {
          bars: [8, 12], kickless: true, duck: 0, open: 1.2,
          stabPool: 'sparse', hatStyles: ['sparse'], bassPool: ['offbeat'], glint: 0.4,
          cues: [
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0.2, 2], [0, 'perc', 0.2, 2],
            [0, 'stabs', 0.8, 2], [0, 'pad', 1, 3], [0, 'waves', 0.95, 4], [0, 'glints', 0.9, 2],
          ],
          next: [['rise', 0.4], ['groove', 0.6]],
        },
      },
    },

    // 霧。拍を持たないドローン（Kali Malone や Sarah Davachi のような）。オルガンのような倍音の豊かな持続音が一声ずつ重なり、
    // 和音が変わるときも一声ずつ入れ替わる。純正律の和音がゆっくりうなりながら、霧の層と大聖堂の残響に溶ける
    fog: {
      label: 'fog',
      beatless: true, // 拍を持たない（キック・ハット・パーカッション・ベース・和音の打ち・きらめきを鳴らさない）
      bpm: [80, 88],
      swing: [0, 0],
      delaySteps: 6,
      progressions: { ids: ['still', 'i-VI', 'open-four'], bars: [16, 24] }, // 声部の入れ替わりに 30 秒ほどかかるので、和音は長めに
      changeChance: { intro: 0.3, rise: 0.4, groove: 0.5, deep: 0.4, breakdown: 0.45 },
      budget: { density: 9, occupancy: 5, smear: 3.6, joint: 0.8 },
      drift: { bright: [30, 70, 160], decay: [40, 90], space: [48, 110] },
      feedback: { base: 0.4, swing: 0.05, min: 0.3, max: 0.5 },
      throwChance: { groove: 0, deep: 0, rise: 0, breakdown: 0 },
      riser: false,
      percSlots: [7, 15],
      percHits: [1, 1],
      // 霧の層: 打ち寄せずに、10〜20 秒かけてゆっくり満ち引きする（tide のさざ波と被らないように）
      waves: { periods: [8, 10, 12], chance: 0.9, rise: [64, 96], fall: [96, 144], peak: [0.35, 0.7] },
      glint: { starts: [0], gaps: [8], range: [72, 88] },
      sections: {
        intro: {
          bars: [8], kickless: true, duck: 0, open: 0.9,
          stabPool: 'dubSparse', hatStyles: ['breath'], bassPool: ['sparse'], glint: 0,
          cues: [
            [0, 'pad', 1, 8], [0, 'waves', 0.6, 4], [0, 'stabs', 0, 0], [0, 'glints', 0, 0],
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0, 0], [0, 'perc', 0, 0],
          ],
          next: [['rise', 1]],
        },
        rise: {
          bars: [8], kickless: true, duck: 0, open: 0.95,
          stabPool: 'dubSparse', hatStyles: ['breath'], bassPool: ['sparse'], glint: 0,
          cues: [
            [0, 'pad', 1, 4], [0, 'waves', 0.7, 8], [0, 'stabs', 0, 0], [0, 'glints', 0, 0],
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0, 0], [0, 'perc', 0, 0],
          ],
          next: [['groove', 1]],
        },
        groove: {
          bars: [24, 32], kickless: true, duck: 0, open: 1,
          stabPool: 'dubSparse', hatStyles: ['breath'], bassPool: ['sparse'], glint: 0,
          cues: [
            [0, 'pad', 1, 4], [0, 'waves', 0.5, 4], [0, 'stabs', 0, 0], [0, 'glints', 0, 0],
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0, 0], [0, 'perc', 0, 0],
          ],
          next: [['deep', 0.45], ['breakdown', 0.4], ['groove', 0.15]],
        },
        deep: {
          // 霧が濃くなり、オルガンは少し遠のく
          bars: [16, 24], kickless: true, duck: 0, open: 0.85,
          stabPool: 'dubSparse', hatStyles: ['breath'], bassPool: ['sparse'], glint: 0,
          cues: [
            [0, 'pad', 0.8, 6], [0, 'waves', 0.85, 6], [0, 'stabs', 0, 0], [0, 'glints', 0, 0],
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0, 0], [0, 'perc', 0, 0],
          ],
          next: [['groove', 0.5], ['breakdown', 0.5]],
        },
        breakdown: {
          // ほとんど霧だけになる
          bars: [8, 12], kickless: true, duck: 0, open: 1.1,
          stabPool: 'dubSparse', hatStyles: ['breath'], bassPool: ['sparse'], glint: 0,
          cues: [
            [0, 'pad', 0.55, 6], [0, 'waves', 1, 6], [0, 'stabs', 0, 0], [0, 'glints', 0, 0],
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0, 0], [0, 'perc', 0, 0],
          ],
          next: [['rise', 0.5], ['groove', 0.5]],
        },
      },
    },

    // デトロイト（陰の側）。短調の和音だけを、ストリングス風のスタブが刻み、暗いパッドが後ろで満ちる。
    // リズム隊が前に出る。ドラムは TR-909 風（押し出しのあるキック、2 拍目と 4 拍目の手拍子、裏拍のオープンと 16 分のクローズ、
    // 55〜58% のシャッフル、機械らしく揺らさない）。きらめきは冷たい電子音（bleep）
    motor: {
      label: 'motor',
      bpm: [126, 131],
      swing: [0.1, 0.16], // 909 のシャッフル（16 分の後ろを 55〜58% の位置へ）
      machine: true, // ハットの強さとタイミングを揺らさない
      delaySteps: 3,
      voicing: 'rootless',
      progressions: { ids: ['motor-plane', 'motor-fall', 'motor-sink', 'motor-sus', 'motor-still', 'motor-hope', 'motor-soul'] },
      changeChance: { intro: 0.3, rise: 0.4, groove: 0.55, deep: 0.45, breakdown: 0.5 },
      budget: { density: 15, occupancy: 7.5, smear: 4, joint: 0.9 }, // 刻み続けるストリングスのぶん、占有と伸びに余裕を持たせる
      drift: { bright: [26, 60, 140], decay: [34, 80], space: [44, 100] },
      feedback: { base: 0.46, swing: 0.06, min: 0.36, max: 0.6 },
      throwChance: { groove: 0.2, deep: 0.2, rise: 0.15, breakdown: 0.4 },
      riser: true,
      percSlots: [3, 7, 11, 14, 15],
      percHits: [1, 3],
      // リム: キックと重ならない位置に、2 小節の決まった形で繰り返す（3・3・2 の割り方で、うねりを作る）
      percLoop: [[3, 0.85], [6, 0.6], [11, 0.85], [14, 0.6], [19, 0.85], [22, 0.6], [27, 0.85], [29, 0.5], [30, 0.7]],
      // 909 のアクセント: 16 分ごとの強さの倍率（ハット・リム・ベース）。拍の裏と最後の 16 分に山を作る
      accent: [0.85, 0.75, 1, 0.9, 0.85, 0.75, 1, 0.9, 0.85, 0.75, 1, 0.9, 0.85, 0.75, 1, 1],
      claps: [[4, 1], [12, 1]],
      ride: [[2, 0.8], [6, 0.6], [10, 0.8], [14, 0.6]], // 909 のライド: 拍の裏で「チーン」
      // リフ: 2 小節で一回りする短いフレーズ [位置（0..31）, 和音の高い方から数えた順位, 強さ]。曲ごとにどれか一つを繰り返す
      // リフ: 4 小節で一回りする、2〜3 音の小さな塊 [位置（0..63）, 和音の高い方から数えた順位, 強さ]。旋律を歌わせず、
      // 同じ塊を小節ごとにちがう位置へ置く（拍の頭を避け、動きは上の 3 音の中だけ）。曲ごとにどれか一つを繰り返す
      riff: {
        bars: 4,
        level: 0.9,
        shapes: [
          [[3, 1, 0.9], [6, 0, 1], [26, 1, 0.8], [38, 1, 0.9], [41, 0, 1], [59, 2, 0.7]],
          [[6, 0, 1], [14, 2, 0.7], [19, 0, 0.9], [38, 0, 1], [46, 2, 0.7], [53, 0, 0.9], [55, 1, 0.7]],
          [[2, 2, 0.8], [5, 0, 1], [27, 0, 0.9], [45, 2, 0.8], [50, 0, 1], [58, 1, 0.7]],
        ],
      },
      stabShift: [0, 0, 3, 5], // 3 小節目と 4 小節目は、同じ形を 3 / 5 ステップ横へずらす（「なんでそこ？」という引っ掛かり）
      sweep: { bars: 16, depth: 0.28 }, // スタブのフィルターを 16 小節で一回り開け閉めする // 手拍子（909 風）: 2 拍目と 4 拍目に毎小節。パーカッションの強さに従う
      waves: { periods: [6, 8, 10], chance: 0.6, rise: [40, 64], fall: [64, 96], peak: [0.25, 0.55] },
      glint: { starts: [0, 2, 6, 10], gaps: [3, 4, 6], range: [67, 84] },
      sections: {
        intro: {
          bars: [4], kickless: true, duck: 0, open: 0.85,
          stabPool: 'motorSparse', hatStyles: ['sparse'], bassPool: ['offbeat'], glint: 0.4,
          cues: [
            [0, 'waves', 0.5, 2], [0, 'pad', 1, 4], [0, 'stabs', 0.55, 4], [0, 'glints', 0.5, 4],
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0, 0], [0, 'perc', 0, 0],
            [2, 'kick', 0.25, 2],
          ],
          next: [['rise', 1]],
        },
        rise: {
          bars: [8], kickless: false, duck: 0.15, open: 0.95,
          stabPool: 'motor', hatStyles: ['detroit'], bassPool: ['offbeat'], glint: 0.3,
          cues: [
            [0, 'kick', 1, 8], [0, 'stabs', 0.8, 4], [0, 'pad', 0.85, 8], [0, 'waves', 0.4, 8],
            [0, 'glints', 0.4, 4], [2, 'hats', 0.6, 6], [4, 'bass', 0.9, 4], [4, 'perc', 0.45, 4],
          ],
          next: [['groove', 1]],
        },
        groove: {
          bars: [24, 32, 40], kickless: false, duck: 0.18, open: 1.05,
          stabPool: 'motor', hatStyles: ['detroit', 'detroit16'], bassPool: ['detroitCell', 'detroitCell2', 'detroitRoll'], glint: 0.25,
          cues: [
            [0, 'kick', 1, 0], [0, 'bass', 1, 0], [0, 'hats', 1, 2], [0, 'perc', 0.7, 2],
            [0, 'stabs', 1, 2], [0, 'pad', 0.7, 4], [0, 'waves', 0.3, 4], [0, 'glints', 0.35, 4],
          ],
          next: [['deep', 0.4], ['breakdown', 0.45], ['groove', 0.15]],
        },
        deep: {
          bars: [16, 24], kickless: false, duck: 0.15, open: 0.85,
          stabPool: 'motorSparse', hatStyles: ['detroit16', 'detroit'], bassPool: ['detroitCell2', 'detroitPush'], glint: 0.35,
          cues: [
            [0, 'kick', 1, 0], [0, 'bass', 0.9, 2], [0, 'hats', 0.8, 4], [0, 'perc', 0.55, 4],
            [0, 'stabs', 0.8, 4], [0, 'pad', 0.9, 4], [0, 'waves', 0.4, 4], [0, 'glints', 0.5, 4],
          ],
          next: [['groove', 0.55], ['breakdown', 0.45]],
        },
        breakdown: {
          bars: [8, 12, 16], kickless: true, duck: 0, open: 1.25,
          stabPool: 'motorSparse', hatStyles: ['sparse'], bassPool: ['offbeat'], glint: 0.6,
          cues: [
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0.2, 2], [0, 'perc', 0, 2],
            [0, 'stabs', 0.9, 2], [0, 'pad', 1, 3], [0, 'waves', 0.6, 4], [0, 'glints', 0.8, 2],
          ],
          next: [['rise', 0.5], ['groove', 0.5]],
        },
      },
    },

    // マイクロハウス。プチプチした細かなクリックと、跳ねるスウィング。低音は短く弾み、和音は小さく乾いている
    click: {
      label: 'click',
      bpm: [122, 126],
      swing: [0.1, 0.16],
      delaySteps: 3,
      progressions: { ids: ['still', 'i-v', 'i-iv'] },
      changeChance: { intro: 0.3, rise: 0.45, groove: 0.6, deep: 0.5, breakdown: 0.5 },
      budget: { density: 18, occupancy: 6.5, smear: 2.4, joint: 0.9 }, // 決まった形のクリック（2 小節 16 打）のぶん
      drift: { bright: [24, 56, 130], decay: [30, 70], space: [40, 90] },
      feedback: { base: 0.34, swing: 0.06, min: 0.24, max: 0.46 },
      throwChance: { groove: 0.15, deep: 0.15, rise: 0.1, breakdown: 0.3 },
      riser: false,
      percSlots: [1, 3, 5, 6, 7, 9, 11, 13, 14, 15],
      percHits: [6, 10], // 2 小節ぶん。クリックが主役
      // クリック: 細かく切り刻んだ 2 小節の決まった形で繰り返す（マイクロハウスのループ）。キックの拍は避ける
      percLoop: [[1, 0.6], [3, 0.9], [6, 0.7], [7, 0.5], [9, 0.6], [11, 1], [14, 0.8], [15, 0.5],
        [17, 0.6], [19, 0.9], [21, 0.5], [22, 0.7], [25, 0.6], [27, 1], [29, 0.7], [30, 0.8]],
      // 16 分ごとの強さの倍率（ハット・クリック・ベース）。16 分の最後を強くして跳ねさせる
      accent: [0.85, 0.65, 0.9, 1, 0.85, 0.65, 0.9, 1, 0.85, 0.65, 0.9, 1, 0.85, 0.65, 0.95, 1],
      stabShift: [0, 7, 0, 3], // 小さな和音を、2 小節目と 4 小節目だけ横へずらす
      waves: { periods: [6, 8, 10], chance: 0.5, rise: [40, 64], fall: [64, 96], peak: [0.2, 0.45] },
      glint: { starts: [3, 7, 11, 14], gaps: [3, 5], range: [76, 93] },
      sections: {
        intro: {
          bars: [4], kickless: true, duck: 0, open: 0.8,
          stabPool: 'click', hatStyles: ['sparse'], bassPool: ['pluck'], glint: 0.4,
          cues: [
            [0, 'waves', 0.4, 2], [0, 'pad', 0.5, 4], [0, 'stabs', 0.5, 2], [0, 'glints', 0.5, 2],
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0, 0], [0, 'perc', 0.6, 2],
            [2, 'kick', 0.3, 2],
          ],
          next: [['rise', 1]],
        },
        rise: {
          bars: [8], kickless: false, duck: 0.15, open: 0.9,
          stabPool: 'click', hatStyles: ['sixteenths'], bassPool: ['pluck'], glint: 0.35,
          cues: [
            [0, 'kick', 1, 4], [0, 'stabs', 0.7, 4], [0, 'pad', 0.4, 8], [0, 'waves', 0.3, 8],
            [0, 'glints', 0.45, 4], [0, 'perc', 0.8, 4], [2, 'hats', 0.6, 4], [4, 'bass', 0.9, 2],
          ],
          next: [['groove', 1]],
        },
        groove: {
          bars: [24, 32, 40], kickless: false, duck: 0.2, open: 1,
          stabPool: 'click', hatStyles: ['sixteenths', 'sparse'], bassPool: ['pluck', 'bounce'], glint: 0.3,
          cues: [
            [0, 'kick', 1, 0], [0, 'bass', 1, 0], [0, 'hats', 0.8, 2], [0, 'perc', 1, 2],
            [0, 'stabs', 0.85, 2], [0, 'pad', 0.35, 4], [0, 'waves', 0.2, 4], [0, 'glints', 0.4, 4],
          ],
          next: [['deep', 0.45], ['breakdown', 0.35], ['groove', 0.2]],
        },
        deep: {
          bars: [16, 24], kickless: false, duck: 0.2, open: 0.8,
          stabPool: 'click', hatStyles: ['sparse'], bassPool: ['bounce', 'pluck'], glint: 0.35,
          cues: [
            [0, 'kick', 1, 0], [0, 'bass', 0.9, 2], [0, 'hats', 0.5, 4], [0, 'perc', 0.85, 4],
            [0, 'stabs', 0.6, 4], [0, 'pad', 0.5, 4], [0, 'waves', 0.3, 4], [0, 'glints', 0.5, 4],
          ],
          next: [['groove', 0.6], ['breakdown', 0.4]],
        },
        breakdown: {
          bars: [8, 12], kickless: true, duck: 0, open: 1.1,
          stabPool: 'click', hatStyles: ['sparse'], bassPool: ['pluck'], glint: 0.5,
          cues: [
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0.25, 2], [0, 'perc', 0.7, 2],
            [0, 'stabs', 0.8, 2], [0, 'pad', 1, 3], [0, 'waves', 0.6, 4], [0, 'glints', 0.8, 2],
          ],
          next: [['rise', 0.4], ['groove', 0.6]],
        },
      },
    },

    // 夕暮れ（バレアリック）。暖かい長調の中で、ナイロンギターが和音を 1〜2 小節に 1 回だけ鳴らして余韻を聴かせ、
    // ときどき単音のフレーズを弾く（きらめきの役割をギターの単音で）。コンガとシェイカー、丸いベース
    sunset: {
      label: 'sunset',
      mode: 'major',
      voicing: 'guitar', // 和音はギターで押さえられる形（6 弦、低い弦に根音）
      bpm: [104, 110],
      swing: [0.03, 0.07],
      delaySteps: 3,
      progressions: { ids: ['sun-float', 'sun-drift', 'sun-six'] },
      changeChance: { intro: 0.3, rise: 0.4, groove: 0.55, deep: 0.45, breakdown: 0.5 },
      budget: { density: 12, occupancy: 6, smear: 3.4, joint: 0.85 },
      drift: { bright: [30, 70, 160], decay: [38, 90], space: [48, 110] },
      feedback: { base: 0.46, swing: 0.05, min: 0.36, max: 0.58 },
      throwChance: { groove: 0.15, deep: 0.15, rise: 0.1, breakdown: 0.3 },
      riser: false,
      percSlots: [3, 6, 7, 10, 11, 14, 15],
      percHits: [2, 4],
      waves: { periods: [6, 8, 10], chance: 0.5, rise: [40, 64], fall: [64, 96], peak: [0.2, 0.5] },
      glint: { starts: [2, 6, 10, 14], gaps: [3, 4, 6], range: [62, 81] }, // 単音はギターの音域（D4〜A5）
      sections: {
        intro: {
          bars: [4], kickless: true, duck: 0, open: 0.85,
          stabPool: 'letRing', hatStyles: ['sparse'], bassPool: ['sparse'], glint: 0.45,
          cues: [
            [0, 'waves', 0.4, 2], [0, 'pad', 1, 4], [0, 'stabs', 0.6, 2], [0, 'glints', 0.5, 4],
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0, 0], [0, 'perc', 0, 0],
            [2, 'kick', 0.25, 2],
          ],
          next: [['rise', 1]],
        },
        rise: {
          bars: [8], kickless: false, duck: 0.2, open: 0.9,
          stabPool: 'letRing', hatStyles: ['sparse'], bassPool: ['sparse', 'offbeat'], glint: 0.4,
          cues: [
            [0, 'kick', 0.9, 8], [0, 'stabs', 0.85, 4], [0, 'pad', 0.85, 8], [0, 'waves', 0.3, 8],
            [0, 'glints', 0.5, 4], [2, 'hats', 0.5, 6], [2, 'perc', 0.6, 4], [4, 'bass', 0.9, 4],
          ],
          next: [['groove', 1]],
        },
        groove: {
          bars: [24, 32, 40], kickless: false, duck: 0.25, open: 1,
          stabPool: 'letRing', hatStyles: ['sixteenths', 'sparse'], bassPool: ['offbeat', 'dub', 'sparse'], glint: 0.5,
          cues: [
            [0, 'kick', 0.9, 0], [0, 'bass', 1, 0], [0, 'hats', 0.7, 2], [0, 'perc', 0.85, 2],
            [0, 'stabs', 1, 2], [0, 'pad', 0.7, 4], [0, 'waves', 0.25, 4], [0, 'glints', 0.7, 4],
          ],
          next: [['deep', 0.4], ['breakdown', 0.45], ['groove', 0.15]],
        },
        deep: {
          bars: [16, 24], kickless: false, duck: 0.2, open: 0.85,
          stabPool: 'letRing', hatStyles: ['sparse'], bassPool: ['sparse', 'offbeat'], glint: 0.5,
          cues: [
            [0, 'kick', 0.85, 0], [0, 'bass', 0.9, 2], [0, 'hats', 0.5, 4], [0, 'perc', 0.6, 4],
            [0, 'stabs', 0.75, 4], [0, 'pad', 0.9, 4], [0, 'waves', 0.3, 4], [0, 'glints', 0.7, 4],
          ],
          next: [['groove', 0.55], ['breakdown', 0.45]],
        },
        breakdown: {
          bars: [8, 12, 16], kickless: true, duck: 0, open: 1.15,
          stabPool: 'letRing', hatStyles: ['sparse'], bassPool: ['sparse'], glint: 0.55,
          cues: [
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0.2, 2], [0, 'perc', 0.3, 2],
            [0, 'stabs', 0.9, 2], [0, 'pad', 1, 3], [0, 'waves', 0.45, 4], [0, 'glints', 0.8, 2],
          ],
          next: [['rise', 0.5], ['groove', 0.5]],
        },
      },
    },

    // ミニマル・アシッド。TB-303 風のベースが、強い共鳴のフィルターで一音ごとに鳴き、ときどき音程が滑る。
    // フィルターのつまみは数十小節かけてゆっくり回る。ブレイクでもキックなしで鳴き続ける
    acid: {
      label: 'acid',
      bpm: [122, 128],
      swing: [0, 0.03],
      delaySteps: 3,
      progressions: { ids: ['still', 'i-iv', 'i-v'], bars: [8, 16] },
      changeChance: { intro: 0.3, rise: 0.4, groove: 0.5, deep: 0.45, breakdown: 0.45 },
      budget: { density: 16, occupancy: 7, smear: 3, joint: 0.9 },
      drift: { bright: [28, 64, 150], decay: [34, 80], space: [44, 100] },
      feedback: { base: 0.5, swing: 0.06, min: 0.38, max: 0.62 },
      throwChance: { groove: 0.25, deep: 0.25, rise: 0.15, breakdown: 0.4 },
      riser: true,
      percSlots: [4, 12, 7, 15],
      percHits: [1, 2],
      acid: { tweak: [10, 18, 32], breath: 16 }, // フィルターのつまみが回る周期（小節）
      waves: { periods: [6, 8, 10], chance: 0.4, rise: [40, 64], fall: [64, 96], peak: [0.2, 0.45] },
      glint: { starts: [0, 6, 10], gaps: [4, 6], range: [74, 91] },
      sections: {
        intro: {
          bars: [4], kickless: true, duck: 0, open: 0.8,
          stabPool: 'dubSparse', hatStyles: ['sparse'], bassPool: ['acidSparse'], glint: 0.3,
          cues: [
            [0, 'waves', 0.3, 2], [0, 'pad', 0.6, 4], [0, 'stabs', 0.3, 4], [0, 'glints', 0.3, 4],
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0, 0], [0, 'perc', 0, 0],
            [2, 'kick', 0.3, 2],
          ],
          next: [['rise', 1]],
        },
        rise: {
          bars: [8], kickless: false, duck: 0.25, open: 0.85,
          stabPool: 'dubSparse', hatStyles: ['sixteenths'], bassPool: ['acidSparse'], glint: 0.25,
          cues: [
            [0, 'kick', 1, 4], [0, 'bass', 0.85, 4], [0, 'stabs', 0.35, 4], [0, 'pad', 0.5, 8],
            [0, 'waves', 0.2, 8], [0, 'glints', 0.3, 4], [2, 'hats', 0.6, 4], [4, 'perc', 0.5, 4],
          ],
          next: [['groove', 1]],
        },
        groove: {
          bars: [24, 32, 40], kickless: false, duck: 0.35, open: 1,
          stabPool: 'dubSparse', hatStyles: ['sixteenths', 'open'], bassPool: ['acidRoll', 'acidSwing', 'acidSparse'], glint: 0.2,
          cues: [
            [0, 'kick', 1, 0], [0, 'bass', 1, 0], [0, 'hats', 0.8, 2], [0, 'perc', 0.6, 2],
            [0, 'stabs', 0.35, 2], [0, 'pad', 0.4, 4], [0, 'waves', 0.15, 4], [0, 'glints', 0.25, 4],
          ],
          next: [['deep', 0.4], ['breakdown', 0.45], ['groove', 0.15]],
        },
        deep: {
          bars: [16, 24], kickless: false, duck: 0.3, open: 0.85,
          stabPool: 'dubSparse', hatStyles: ['sparse'], bassPool: ['acidSparse', 'acidDrop'], glint: 0.3,
          cues: [
            [0, 'kick', 1, 0], [0, 'bass', 0.9, 2], [0, 'hats', 0.5, 4], [0, 'perc', 0.4, 4],
            [0, 'stabs', 0.3, 4], [0, 'pad', 0.6, 4], [0, 'waves', 0.2, 4], [0, 'glints', 0.35, 4],
          ],
          next: [['groove', 0.55], ['breakdown', 0.45]],
        },
        breakdown: {
          // キックが引いても、アシッドだけは鳴き続ける（キックが無いので低域は重ならない）
          bars: [8, 12], kickless: true, duck: 0, open: 1.2,
          stabPool: 'dubSparse', hatStyles: ['sparse'], bassPool: ['acidSparse'], glint: 0.4,
          cues: [
            [0, 'kick', 0, 0], [0, 'bass', 0.7, 2], [0, 'hats', 0.2, 2], [0, 'perc', 0, 2],
            [0, 'stabs', 0.4, 2], [0, 'pad', 0.8, 3], [0, 'waves', 0.3, 4], [0, 'glints', 0.5, 2],
          ],
          next: [['rise', 0.4], ['groove', 0.6]],
        },
      },
    },

    // ライヒ風のフェイズ。マリンバのような撥弦の音が 16 分で途切れなく流れ、7 音の形・7 ステップ・6 ステップの周期が
    // 16 とずれながら、少しずつ模様を変えていく
    phase: {
      label: 'phase',
      bpm: [112, 118],
      swing: [0, 0],
      delaySteps: 3,
      progressions: { ids: ['still', 'i-VI', 'i-iv'], bars: [16] },
      changeChance: { intro: 0.3, rise: 0.4, groove: 0.5, deep: 0.4, breakdown: 0.45 },
      budget: { density: 15, occupancy: 7, smear: 3, joint: 0.9 },
      drift: { bright: [28, 64, 150], decay: [34, 80], space: [44, 100] },
      feedback: { base: 0.38, swing: 0.05, min: 0.3, max: 0.5 },
      throwChance: { groove: 0.1, deep: 0.1, rise: 0.05, breakdown: 0.2 },
      riser: false,
      percSlots: [3, 7, 11, 15],
      percHits: [1, 2],
      poly: {
        bass: { cycle: 6, len: 1.5, accent: [1, 0.7, 0.85, 0.6] },
        perc: { cycle: 7, offset: 3 },
        arp: { every: 1, shape: [0, 2, 4, 1, 3, 5, 2], accent: [1, 0.6, 0.8, 0.5] },
      },
      waves: { periods: [6, 8, 10], chance: 0.5, rise: [40, 64], fall: [64, 96], peak: [0.2, 0.45] },
      glint: { starts: [0], gaps: [4], range: [60, 79] },
      sections: {
        intro: {
          bars: [4], kickless: true, duck: 0, open: 0.85,
          stabPool: 'sparse', hatStyles: ['sparse'], bassPool: ['offbeat'], glint: 0.35,
          cues: [
            [0, 'waves', 0.5, 2], [0, 'pad', 0.8, 4], [0, 'stabs', 0.3, 4], [0, 'glints', 0.6, 4],
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0, 0], [0, 'perc', 0, 0],
            [2, 'kick', 0.25, 2],
          ],
          next: [['rise', 1]],
        },
        rise: {
          bars: [8], kickless: false, duck: 0.2, open: 0.95,
          stabPool: 'sparse', hatStyles: ['sparse'], bassPool: ['offbeat'], glint: 0.35,
          cues: [
            [0, 'kick', 0.85, 8], [0, 'stabs', 0.3, 4], [0, 'pad', 0.7, 8], [0, 'waves', 0.4, 8],
            [0, 'glints', 0.85, 6], [2, 'hats', 0.4, 6], [2, 'bass', 0.8, 4], [4, 'perc', 0.6, 4],
          ],
          next: [['groove', 1]],
        },
        groove: {
          bars: [32, 40], kickless: false, duck: 0.25, open: 1,
          stabPool: 'sparse', hatStyles: ['sparse', 'sixteenths'], bassPool: ['offbeat'], glint: 0.35,
          cues: [
            [0, 'kick', 0.85, 0], [0, 'bass', 0.9, 0], [0, 'hats', 0.55, 2], [0, 'perc', 0.8, 2],
            [0, 'stabs', 0.3, 2], [0, 'pad', 0.55, 4], [0, 'waves', 0.3, 4], [0, 'glints', 1, 2],
          ],
          next: [['deep', 0.45], ['breakdown', 0.4], ['groove', 0.15]],
        },
        deep: {
          bars: [16, 24], kickless: false, duck: 0.2, open: 0.85,
          stabPool: 'sparse', hatStyles: ['sparse'], bassPool: ['offbeat'], glint: 0.3,
          cues: [
            [0, 'kick', 0.85, 0], [0, 'bass', 0.8, 2], [0, 'hats', 0.35, 4], [0, 'perc', 0.5, 4],
            [0, 'stabs', 0.25, 4], [0, 'pad', 0.75, 4], [0, 'waves', 0.4, 4], [0, 'glints', 0.8, 4],
          ],
          next: [['groove', 0.55], ['breakdown', 0.45]],
        },
        breakdown: {
          bars: [8, 12], kickless: true, duck: 0, open: 1.15,
          stabPool: 'sparse', hatStyles: ['sparse'], bassPool: ['offbeat'], glint: 0.4,
          cues: [
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0.15, 2], [0, 'perc', 0.3, 2],
            [0, 'stabs', 0.4, 2], [0, 'pad', 1, 3], [0, 'waves', 0.6, 4], [0, 'glints', 0.9, 2],
          ],
          next: [['rise', 0.4], ['groove', 0.6]],
        },
      },
    },

    // ダブ・ギター。ミュートした短いギターの刻みを裏拍に置き、深いエコーへ投げ込む。太いダブのベースとリムショット
    skank: {
      label: 'skank',
      voicing: 'guitar',
      bpm: [112, 118],
      swing: [0.02, 0.06],
      delaySteps: 3,
      progressions: { ids: ['still', 'i-iv', 'i-VII'] },
      changeChance: { intro: 0.3, rise: 0.4, groove: 0.55, deep: 0.45, breakdown: 0.5 },
      budget: { density: 14, occupancy: 7, smear: 3.2, joint: 0.9 },
      drift: { bright: [26, 60, 140], decay: [34, 80], space: [44, 100] },
      feedback: { base: 0.56, swing: 0.07, min: 0.42, max: 0.7 },
      throwChance: { groove: 0.4, deep: 0.4, rise: 0.2, breakdown: 0.55 },
      riser: false,
      percSlots: [3, 7, 11, 13],
      percHits: [1, 2],
      waves: { periods: [6, 8, 10], chance: 0.4, rise: [40, 64], fall: [64, 96], peak: [0.2, 0.4] },
      glint: { starts: [2, 6, 10], gaps: [4, 6], range: [72, 88] },
      sections: {
        intro: {
          bars: [4], kickless: true, duck: 0, open: 0.85,
          stabPool: 'skank', hatStyles: ['sparse'], bassPool: ['dub'], glint: 0.3,
          cues: [
            [0, 'waves', 0.4, 2], [0, 'pad', 0.6, 4], [0, 'stabs', 0.6, 2], [0, 'glints', 0.3, 4],
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0, 0], [0, 'perc', 0, 0],
            [2, 'kick', 0.3, 2],
          ],
          next: [['rise', 1]],
        },
        rise: {
          bars: [8], kickless: false, duck: 0.3, open: 0.95,
          stabPool: 'skank', hatStyles: ['open'], bassPool: ['dub'], glint: 0.25,
          cues: [
            [0, 'kick', 1, 8], [0, 'stabs', 0.85, 4], [0, 'pad', 0.5, 8], [0, 'waves', 0.3, 8],
            [0, 'glints', 0.25, 4], [2, 'hats', 0.5, 6], [4, 'bass', 0.9, 4], [4, 'perc', 0.5, 4],
          ],
          next: [['groove', 1]],
        },
        groove: {
          bars: [24, 32, 40], kickless: false, duck: 0.4, open: 1,
          stabPool: 'skank', hatStyles: ['open', 'sparse'], bassPool: ['dub', 'offbeat'], glint: 0.2,
          cues: [
            [0, 'kick', 1, 0], [0, 'bass', 1, 0], [0, 'hats', 0.7, 2], [0, 'perc', 0.7, 2],
            [0, 'stabs', 1, 2], [0, 'pad', 0.4, 4], [0, 'waves', 0.2, 4], [0, 'glints', 0.2, 4],
          ],
          next: [['deep', 0.4], ['breakdown', 0.45], ['groove', 0.15]],
        },
        deep: {
          bars: [16, 24], kickless: false, duck: 0.35, open: 0.85,
          stabPool: 'skank', hatStyles: ['sparse'], bassPool: ['dub', 'sparse'], glint: 0.25,
          cues: [
            [0, 'kick', 1, 0], [0, 'bass', 0.9, 2], [0, 'hats', 0.5, 4], [0, 'perc', 0.5, 4],
            [0, 'stabs', 0.8, 4], [0, 'pad', 0.6, 4], [0, 'waves', 0.3, 4], [0, 'glints', 0.3, 4],
          ],
          next: [['groove', 0.55], ['breakdown', 0.45]],
        },
        breakdown: {
          bars: [8, 12], kickless: true, duck: 0, open: 1.2,
          stabPool: 'skank', hatStyles: ['sparse'], bassPool: ['dub'], glint: 0.35,
          cues: [
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0.2, 2], [0, 'perc', 0.3, 2],
            [0, 'stabs', 0.8, 2], [0, 'pad', 0.8, 3], [0, 'waves', 0.4, 4], [0, 'glints', 0.4, 2],
          ],
          next: [['rise', 0.5], ['groove', 0.5]],
        },
      },
    },

    // 水辺の箏。箏のような単音が、弾いたあとに音程をゆっくり揺らし（揺り）、長いエコーの中に消えていく。
    // 3 度を持たない開いた和音、遠い柔らかなキック
    shore: {
      label: 'shore',
      bpm: [88, 96],
      swing: [0.02, 0.05],
      delaySteps: 6,
      progressions: { ids: ['still', 'i-VII', 'open-four'] },
      changeChance: { intro: 0.3, rise: 0.4, groove: 0.45, deep: 0.4, breakdown: 0.45 },
      budget: { density: 10, occupancy: 5.4, smear: 3.6, joint: 0.8 },
      drift: { bright: [30, 70, 160], decay: [40, 90], space: [48, 110] },
      feedback: { base: 0.48, swing: 0.05, min: 0.38, max: 0.6 },
      throwChance: { groove: 0.15, deep: 0.15, rise: 0.1, breakdown: 0.3 },
      riser: false,
      percSlots: [7, 15],
      percHits: [0, 1],
      waves: { periods: [8, 10, 12], chance: 0.7, rise: [64, 96], fall: [96, 144], peak: [0.25, 0.55] },
      glint: { starts: [0, 3, 6, 10], gaps: [2, 3, 4], range: [57, 81] },
      sections: {
        intro: {
          bars: [4], kickless: true, duck: 0, open: 0.85,
          stabPool: 'dubSparse', hatStyles: ['breath'], bassPool: ['sparse'], glint: 0.6,
          cues: [
            [0, 'waves', 0.6, 2], [0, 'pad', 0.8, 4], [0, 'stabs', 0.2, 4], [0, 'glints', 0.8, 2],
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0, 0], [0, 'perc', 0, 0],
          ],
          next: [['rise', 1]],
        },
        rise: {
          bars: [8], kickless: false, duck: 0.15, open: 0.9,
          stabPool: 'dubSparse', hatStyles: ['breath'], bassPool: ['sparse'], glint: 0.55,
          cues: [
            [0, 'kick', 0.6, 8], [0, 'stabs', 0.25, 4], [0, 'pad', 0.7, 8], [0, 'waves', 0.5, 8],
            [0, 'glints', 0.85, 4], [2, 'hats', 0.25, 6], [4, 'bass', 0.7, 4], [4, 'perc', 0.3, 4],
          ],
          next: [['groove', 1]],
        },
        groove: {
          bars: [24, 32], kickless: false, duck: 0.15, open: 1,
          stabPool: 'dubSparse', hatStyles: ['breath'], bassPool: ['sparse', 'swell'], glint: 0.65,
          cues: [
            [0, 'kick', 0.6, 0], [0, 'bass', 0.8, 0], [0, 'hats', 0.3, 2], [0, 'perc', 0.3, 2],
            [0, 'stabs', 0.25, 2], [0, 'pad', 0.6, 4], [0, 'waves', 0.4, 4], [0, 'glints', 0.95, 2],
          ],
          next: [['deep', 0.45], ['breakdown', 0.4], ['groove', 0.15]],
        },
        deep: {
          bars: [16, 24], kickless: false, duck: 0.12, open: 0.85,
          stabPool: 'dubSparse', hatStyles: ['breath'], bassPool: ['swell', 'sparse'], glint: 0.6,
          cues: [
            [0, 'kick', 0.55, 0], [0, 'bass', 0.7, 2], [0, 'hats', 0.2, 4], [0, 'perc', 0.2, 4],
            [0, 'stabs', 0.2, 4], [0, 'pad', 0.8, 4], [0, 'waves', 0.5, 4], [0, 'glints', 0.9, 4],
          ],
          next: [['groove', 0.5], ['breakdown', 0.5]],
        },
        breakdown: {
          bars: [8, 12, 16], kickless: true, duck: 0, open: 1.15,
          stabPool: 'dubSparse', hatStyles: ['breath'], bassPool: ['sparse'], glint: 0.7,
          cues: [
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0.1, 2], [0, 'perc', 0, 2],
            [0, 'stabs', 0.25, 2], [0, 'pad', 1, 3], [0, 'waves', 0.7, 4], [0, 'glints', 1, 2],
          ],
          next: [['rise', 0.5], ['groove', 0.5]],
        },
      },
    },

    // エレクトロニカ（Jan Jelinek の Loop-Finding-Jazz-Records や Oval のような）。主役はループ: ジャズのレコードの一瞬のような
    // エレピの和音の断片から、長さのちがうループ（3・5・7 ステップ）を切り出して少しずつずらして重ね、揺らめく模様（モアレ）を作る。
    // ループの位置はときどき見つけ直し、フレーズの終わりには CD が飛んだように細かく繰り返す。レコードのプチプチがハットとリムになり、
    // キックは柔らかく、ベースは深い。スタブときらめきは鳴らさない（ループがその役を担う）
    dust: {
      label: 'dust',
      bpm: [108, 116],
      swing: [0.04, 0.1],
      delaySteps: 3,
      progressions: { ids: ['dust-dorian', 'dust-still', 'dust-float'] },
      changeChance: { intro: 0.3, rise: 0.4, groove: 0.5, deep: 0.45, breakdown: 0.45 },
      budget: { density: 12, occupancy: 6, smear: 4, joint: 0.9 },
      drift: { bright: [24, 56, 130], decay: [30, 72], space: [40, 96] },
      feedback: { base: 0.42, swing: 0.06, min: 0.32, max: 0.55 },
      throwChance: { groove: 0.1, deep: 0.15, rise: 0, breakdown: 0.25 },
      riser: false,
      percSlots: [3, 7, 10, 13, 15],
      percHits: [2, 4],
      // ループの層: part の強さで鳴らし、cycles から長さを選ぶ。gate は長さのうち鳴らす割合、rate は再生の速さ
      // （2 層目をわずかに速くして、同じ断片どうしをうならせる）。find はフレーズごとに位置を見つけ直す確率、stutter は CD が飛ぶ確率
      loops: {
        layers: [
          { part: 'stabs', cycles: [3, 5], gate: 0.95, level: 1, pan: -0.35, rate: 1 },
          { part: 'glints', cycles: [5, 7, 6], gate: 0.8, level: 0.75, pan: 0.4, rate: 1.004 },
        ],
        find: 0.4,
        stutter: 0.35,
      },
      waves: { periods: [8, 12, 16], chance: 0.5, rise: [48, 80], fall: [80, 120], peak: [0.2, 0.4] },
      glint: { starts: [0], gaps: [4], range: [60, 84] },
      sections: {
        intro: {
          bars: [8], kickless: true, duck: 0, open: 0.9,
          stabPool: 'dubSparse', hatStyles: ['whisper'], bassPool: ['swell'], glint: 0,
          cues: [
            [0, 'waves', 0.6, 2], [0, 'stabs', 0.8, 4], [0, 'pad', 0.3, 8], [0, 'glints', 0, 0],
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0.4, 4], [0, 'perc', 0, 0],
            [4, 'glints', 0.5, 4],
          ],
          next: [['rise', 1]],
        },
        rise: {
          bars: [8], kickless: false, duck: 0.15, open: 1,
          stabPool: 'dubSparse', hatStyles: ['whisper', 'breath'], bassPool: ['swell', 'dub'], glint: 0,
          cues: [
            [0, 'kick', 0.7, 8], [0, 'stabs', 1, 2], [0, 'glints', 0.7, 4], [0, 'pad', 0.3, 4],
            [0, 'waves', 0.45, 4], [0, 'hats', 0.7, 4], [4, 'bass', 0.9, 4], [4, 'perc', 0.6, 4],
          ],
          next: [['groove', 1]],
        },
        groove: {
          bars: [24, 32, 40], kickless: false, duck: 0.2, open: 1,
          stabPool: 'dubSparse', hatStyles: ['whisper', 'sixteenths'], bassPool: ['dub', 'sparse', 'swell'], glint: 0,
          cues: [
            [0, 'kick', 0.8, 2], [0, 'bass', 1, 2], [0, 'hats', 0.8, 2], [0, 'perc', 0.7, 2],
            [0, 'stabs', 1, 2], [0, 'glints', 0.8, 4], [0, 'pad', 0.25, 4], [0, 'waves', 0.4, 4],
          ],
          next: [['deep', 0.45], ['breakdown', 0.35], ['groove', 0.2]],
        },
        deep: {
          // 2 層目のループが前に出て、模様が変わる
          bars: [16, 24], kickless: false, duck: 0.15, open: 0.9,
          stabPool: 'dubSparse', hatStyles: ['whisper'], bassPool: ['dub', 'swell'], glint: 0,
          cues: [
            [0, 'kick', 0.75, 2], [0, 'bass', 0.9, 2], [0, 'hats', 0.55, 4], [0, 'perc', 0.5, 4],
            [0, 'stabs', 0.7, 4], [0, 'glints', 1, 4], [0, 'pad', 0.4, 4], [0, 'waves', 0.5, 4],
          ],
          next: [['groove', 0.55], ['breakdown', 0.45]],
        },
        breakdown: {
          bars: [8, 12], kickless: true, duck: 0, open: 1.1,
          stabPool: 'dubSparse', hatStyles: ['whisper'], bassPool: ['swell'], glint: 0,
          cues: [
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0.3, 2], [0, 'perc', 0.2, 2],
            [0, 'stabs', 0.9, 2], [0, 'glints', 0.5, 2], [0, 'pad', 0.5, 3], [0, 'waves', 0.8, 4],
          ],
          next: [['rise', 0.5], ['groove', 0.5]],
        },
      },
    },
  };

  // IDS はすべての WORLD（テストと URL での指定）。VISIBLE はメニューと auto・ランダムな選曲に出す WORLD
  U.worlds = Object.freeze({
    WORLDS: deepFreeze(WORLDS),
    IDS: Object.freeze(Object.keys(WORLDS)),
    VISIBLE: Object.freeze(Object.keys(WORLDS).filter((id) => !WORLDS[id].hidden)),
  });
})((globalThis.Undertow = globalThis.Undertow || {}));
