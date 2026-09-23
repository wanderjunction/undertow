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
      glint: { starts: [0, 2, 4, 8], gaps: [4, 6, 8], range: [72, 88] },
      sections: {
        intro: {
          bars: [8], kickless: true, duck: 0, open: 0.8,
          stabPool: 'drift', hatStyles: ['breath'], bassPool: ['swell'], glint: 0.6,
          cues: [
            [0, 'waves', 0.8, 4], [0, 'pad', 1, 6], [0, 'stabs', 0.5, 6], [0, 'glints', 0.7, 4],
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
            [0, 'glints', 0.6, 4], [2, 'hats', 0.4, 6], [4, 'bass', 0.7, 4], [4, 'perc', 0.3, 4],
          ],
          next: [['groove', 1]],
        },
        groove: {
          bars: [32, 40, 48], kickless: false, duck: 0.14, open: 1,
          stabPool: 'drift', hatStyles: ['breath', 'whisper'], bassPool: ['swell', 'sparse'], glint: 0.5,
          cues: [
            [0, 'kick', 0.45, 2], [0, 'bass', 0.75, 2], [0, 'hats', 0.55, 4], [0, 'perc', 0.4, 4],
            [0, 'stabs', 0.7, 4], [0, 'pad', 1, 4], [0, 'waves', 0.5, 4], [0, 'glints', 0.6, 4],
          ],
          next: [['deep', 0.45], ['breakdown', 0.4], ['groove', 0.15]],
        },
        deep: {
          bars: [24, 32], kickless: false, duck: 0.1, open: 0.8,
          stabPool: 'drift', hatStyles: ['breath'], bassPool: ['swell'], glint: 0.6,
          cues: [
            [0, 'kick', 0.3, 2], [0, 'bass', 0.6, 2], [0, 'hats', 0.3, 4], [0, 'perc', 0.2, 4],
            [0, 'stabs', 0.5, 4], [0, 'pad', 1, 4], [0, 'waves', 0.6, 4], [0, 'glints', 0.7, 4],
          ],
          next: [['groove', 0.5], ['breakdown', 0.5]],
        },
        breakdown: {
          bars: [12, 16], kickless: true, duck: 0, open: 1.2,
          stabPool: 'drift', hatStyles: ['breath'], bassPool: ['swell'], glint: 0.7,
          cues: [
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0.15, 2], [0, 'perc', 0, 2],
            [0, 'stabs', 0.6, 2], [0, 'pad', 1, 3], [0, 'waves', 0.8, 4], [0, 'glints', 0.9, 2],
          ],
          next: [['rise', 0.6], ['groove', 0.4]],
        },
      },
    },

    // ダブ寄り。深いテープ・エコーにスタブとリムショットを投げ込み、太いベースで支える
    echo: {
      label: 'echo',
      bpm: [112, 118],
      swing: [0.06, 0.12],
      delaySteps: 3,
      progressions: { ids: ['still', 'i-iv', 'i-v', 'i-VII'], bars: [8, 16] },
      changeChance: { intro: 0.3, rise: 0.4, groove: 0.55, deep: 0.45, breakdown: 0.5 },
      budget: { density: 11, occupancy: 6.2, smear: 3.8, joint: 0.8 },
      drift: { bright: [23, 56, 128], decay: [30, 74], space: [36, 88] },
      feedback: { base: 0.62, swing: 0.05, min: 0.5, max: 0.74 },
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
            [0, 'waves', 0.6, 2], [0, 'pad', 0.4, 4], [0, 'stabs', 0.7, 2], [0, 'glints', 0.3, 4],
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0, 0], [0, 'perc', 0.3, 2],
            [2, 'kick', 0.22, 2],
          ],
          next: [['rise', 1]],
        },
        rise: {
          bars: [8], kickless: false, duck: 0.3, open: 0.95,
          stabPool: 'dub', hatStyles: ['open'], bassPool: ['offbeat', 'dub'], glint: 0.2,
          cues: [
            [0, 'kick', 1, 8], [0, 'stabs', 0.9, 4], [0, 'pad', 0.4, 8], [0, 'waves', 0.45, 8],
            [0, 'glints', 0.25, 4], [2, 'hats', 0.5, 6], [4, 'bass', 0.95, 4], [0, 'perc', 0.6, 4],
          ],
          next: [['groove', 1]],
        },
        groove: {
          bars: [24, 32, 40], kickless: false, duck: 0.4, open: 1,
          stabPool: 'dub', hatStyles: ['open', 'sparse'], bassPool: ['dub', 'offbeat'], glint: 0.2,
          cues: [
            [0, 'kick', 1, 0], [0, 'bass', 1, 0], [0, 'hats', 0.8, 2], [0, 'perc', 0.9, 2],
            [0, 'stabs', 1, 2], [0, 'pad', 0.35, 4], [0, 'waves', 0.35, 4], [0, 'glints', 0.3, 4],
          ],
          next: [['deep', 0.45], ['breakdown', 0.4], ['groove', 0.15]],
        },
        deep: {
          bars: [16, 24], kickless: false, duck: 0.35, open: 0.85,
          stabPool: 'dubSparse', hatStyles: ['sparse'], bassPool: ['dub', 'offbeat'], glint: 0.25,
          cues: [
            [0, 'kick', 1, 0], [0, 'bass', 0.95, 2], [0, 'hats', 0.45, 4], [0, 'perc', 0.6, 4],
            [0, 'stabs', 0.8, 4], [0, 'pad', 0.5, 4], [0, 'waves', 0.45, 4], [0, 'glints', 0.35, 4],
          ],
          next: [['groove', 0.5], ['breakdown', 0.5]],
        },
        breakdown: {
          bars: [8, 12], kickless: true, duck: 0, open: 1.3,
          stabPool: 'dub', hatStyles: ['sparse'], bassPool: ['offbeat'], glint: 0.3,
          cues: [
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0.2, 2], [0, 'perc', 0.5, 2],
            [0, 'stabs', 1, 2], [0, 'pad', 0.5, 3], [0, 'waves', 0.5, 4], [0, 'glints', 0.4, 2],
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

    // うねり。いちばんテクノ寄り。16分のハットと細かく動くベース、乾いた短い和音
    pulse: {
      label: 'pulse',
      bpm: [122, 126],
      swing: [0.04, 0.1],
      delaySteps: 3,
      progressions: { ids: ['still', 'i-iv', 'i-v', 'i-VII'], bars: [8, 16] },
      changeChance: { intro: 0.35, rise: 0.45, groove: 0.65, deep: 0.5, breakdown: 0.5 },
      budget: { density: 13, occupancy: 4.6, smear: 2.4, joint: 0.8 },
      drift: { bright: [20, 48, 120], decay: [28, 64], space: [34, 80] },
      feedback: { base: 0.4, swing: 0.06, min: 0.3, max: 0.56 },
      throwChance: { groove: 0.2, deep: 0.2, rise: 0.15, breakdown: 0.35 },
      riser: true,
      percSlots: [3, 5, 7, 9, 11, 13, 15],
      percHits: [2, 4],
      waves: { periods: [4, 5, 6], chance: 0.5, rise: [16, 28], fall: [28, 44], peak: [0.2, 0.5] },
      glint: { starts: [2, 6, 10, 14], gaps: [2, 4], range: [74, 91] },
      sections: {
        intro: {
          bars: [4], kickless: true, duck: 0, open: 0.9,
          stabPool: 'sparse', hatStyles: ['sixteenths'], bassPool: ['offbeat'], glint: 0.2,
          cues: [
            [0, 'waves', 0.4, 2], [0, 'pad', 0.6, 2], [0, 'stabs', 0.6, 2], [0, 'glints', 0.3, 2],
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0.3, 2], [0, 'perc', 0, 0],
            [2, 'kick', 0.3, 2],
          ],
          next: [['rise', 1]],
        },
        rise: {
          bars: [8], kickless: false, duck: 0.35, open: 1,
          stabPool: 'full', hatStyles: ['sixteenths'], bassPool: ['offbeat', 'rolling'], glint: 0.2,
          cues: [
            [0, 'kick', 1, 6], [0, 'stabs', 0.9, 4], [0, 'pad', 0.5, 8], [0, 'waves', 0.3, 8],
            [0, 'glints', 0.3, 4], [0, 'hats', 0.8, 6], [2, 'bass', 1, 4], [2, 'perc', 0.6, 4],
          ],
          next: [['groove', 1]],
        },
        groove: {
          bars: [24, 32, 40], kickless: false, duck: 0.5, open: 1.05,
          stabPool: 'full', hatStyles: ['sixteenths', 'open'], bassPool: ['rolling', 'ghost', 'offbeat'], glint: 0.15,
          cues: [
            [0, 'kick', 1, 0], [0, 'bass', 1, 0], [0, 'hats', 1, 2], [0, 'perc', 0.85, 2],
            [0, 'stabs', 1, 2], [0, 'pad', 0.4, 4], [0, 'waves', 0.25, 4], [0, 'glints', 0.25, 4],
          ],
          next: [['deep', 0.45], ['breakdown', 0.35], ['groove', 0.2]],
        },
        deep: {
          bars: [16, 24], kickless: false, duck: 0.45, open: 0.85,
          stabPool: 'sparse', hatStyles: ['sixteenths'], bassPool: ['rolling', 'offbeat'], glint: 0.2,
          cues: [
            [0, 'kick', 1, 0], [0, 'bass', 1, 2], [0, 'hats', 0.8, 4], [0, 'perc', 0.6, 4],
            [0, 'stabs', 0.7, 4], [0, 'pad', 0.55, 4], [0, 'waves', 0.3, 4], [0, 'glints', 0.3, 4],
          ],
          next: [['groove', 0.6], ['breakdown', 0.4]],
        },
        breakdown: {
          bars: [8], kickless: true, duck: 0, open: 1.3,
          stabPool: 'full', hatStyles: ['sparse'], bassPool: ['offbeat'], glint: 0.3,
          cues: [
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0.35, 2], [0, 'perc', 0.2, 2],
            [0, 'stabs', 0.9, 2], [0, 'pad', 0.8, 3], [0, 'waves', 0.5, 4], [0, 'glints', 0.4, 2],
          ],
          next: [['rise', 0.3], ['groove', 0.7]],
        },
      },
    },

    // ガラス。透明で冷たい。高い短い音が主役で、低音は細く、空間は広い
    glass: {
      label: 'glass',
      bpm: [118, 122],
      swing: [0.02, 0.06],
      delaySteps: 3,
      progressions: { ids: ['still', 'i-VI', 'i-VII', 'wander'], bars: [8, 16] },
      changeChance: { intro: 0.3, rise: 0.4, groove: 0.6, deep: 0.45, breakdown: 0.5 },
      budget: { density: 12, occupancy: 5, smear: 2.8, joint: 0.8 },
      drift: { bright: [24, 58, 136], decay: [32, 78], space: [40, 96] },
      feedback: { base: 0.52, swing: 0.06, min: 0.4, max: 0.66 },
      throwChance: { groove: 0.25, deep: 0.25, rise: 0.15, breakdown: 0.45 },
      riser: false,
      percSlots: [1, 3, 5, 7, 9, 11, 13, 15],
      percHits: [2, 4],
      waves: { periods: [3, 5, 7], chance: 0.6, rise: [16, 28], fall: [28, 48], peak: [0.2, 0.55] },
      glint: { starts: [0, 1, 3, 5, 6, 9, 11], gaps: [1, 2, 3], range: [84, 100] },
      sections: {
        intro: {
          bars: [4], kickless: true, duck: 0, open: 1,
          stabPool: 'sparse', hatStyles: ['sparse'], bassPool: ['sparse'], glint: 0.7,
          cues: [
            [0, 'waves', 0.6, 2], [0, 'pad', 0.8, 4], [0, 'stabs', 0.5, 4], [0, 'glints', 0.8, 2],
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0, 0], [0, 'perc', 0.3, 2],
            [2, 'kick', 0.25, 2],
          ],
          next: [['rise', 1]],
        },
        rise: {
          bars: [8], kickless: false, duck: 0.3, open: 1.05,
          stabPool: 'sparse', hatStyles: ['sparse'], bassPool: ['sparse'], glint: 0.6,
          cues: [
            [0, 'kick', 1, 8], [0, 'stabs', 0.7, 4], [0, 'pad', 0.7, 8], [0, 'waves', 0.5, 8],
            [0, 'glints', 0.8, 4], [2, 'hats', 0.6, 6], [4, 'bass', 0.8, 4], [0, 'perc', 0.6, 4],
          ],
          next: [['groove', 1]],
        },
        groove: {
          bars: [24, 32, 40], kickless: false, duck: 0.4, open: 1.15,
          stabPool: 'sparse', hatStyles: ['sparse', 'whisper'], bassPool: ['sparse', 'offbeat'], glint: 0.6,
          cues: [
            [0, 'kick', 1, 0], [0, 'bass', 0.85, 0], [0, 'hats', 0.9, 2], [0, 'perc', 0.9, 2],
            [0, 'stabs', 0.7, 2], [0, 'pad', 0.6, 4], [0, 'waves', 0.4, 4], [0, 'glints', 0.8, 4],
          ],
          next: [['deep', 0.45], ['breakdown', 0.4], ['groove', 0.15]],
        },
        deep: {
          bars: [16, 24], kickless: false, duck: 0.35, open: 0.95,
          stabPool: 'sparse', hatStyles: ['whisper'], bassPool: ['sparse'], glint: 0.7,
          cues: [
            [0, 'kick', 1, 0], [0, 'bass', 0.7, 2], [0, 'hats', 0.6, 4], [0, 'perc', 0.7, 4],
            [0, 'stabs', 0.5, 4], [0, 'pad', 0.8, 4], [0, 'waves', 0.5, 4], [0, 'glints', 0.9, 4],
          ],
          next: [['groove', 0.5], ['breakdown', 0.5]],
        },
        breakdown: {
          bars: [8, 12], kickless: true, duck: 0, open: 1.3,
          stabPool: 'sparse', hatStyles: ['sparse'], bassPool: ['sparse'], glint: 0.8,
          cues: [
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0.25, 2], [0, 'perc', 0.4, 2],
            [0, 'stabs', 0.6, 2], [0, 'pad', 1, 3], [0, 'waves', 0.7, 4], [0, 'glints', 1, 2],
          ],
          next: [['rise', 0.5], ['groove', 0.5]],
        },
      },
    },

    // 深海。drift より重く暗い。低いドローンとゆっくり開く響きだけの世界
    deep: {
      label: 'deep',
      bpm: [100, 106],
      swing: [0.02, 0.05],
      delaySteps: 6,
      progressions: { ids: ['still', 'i-VI', 'i-iv'], bars: [16] },
      changeChance: { intro: 0.2, rise: 0.25, groove: 0.4, deep: 0.3, breakdown: 0.35 },
      budget: { density: 6, occupancy: 8, smear: 5, joint: 0.8 },
      drift: { bright: [48, 110, 240], decay: [60, 140], space: [70, 160] },
      feedback: { base: 0.44, swing: 0.05, min: 0.34, max: 0.56 },
      throwChance: { groove: 0.08, deep: 0.08, rise: 0, breakdown: 0.12 },
      riser: false,
      percSlots: [6, 14],
      percHits: [1, 2],
      waves: { periods: [5, 7, 9], chance: 0.8, rise: [40, 64], fall: [64, 96], peak: [0.35, 0.9] },
      glint: { starts: [0, 4, 8], gaps: [6, 8], range: [67, 84] },
      sections: {
        intro: {
          bars: [8], kickless: true, duck: 0, open: 0.7,
          stabPool: 'drift', hatStyles: ['breath'], bassPool: ['swell'], glint: 0.4,
          cues: [
            [0, 'waves', 1, 4], [0, 'pad', 1, 8], [0, 'stabs', 0.4, 8], [0, 'glints', 0.4, 6],
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0, 0], [0, 'perc', 0, 0],
            [4, 'kick', 0.12, 4],
          ],
          next: [['rise', 1]],
        },
        rise: {
          bars: [8], kickless: false, duck: 0.08, open: 0.8,
          stabPool: 'drift', hatStyles: ['breath'], bassPool: ['swell'], glint: 0.4,
          cues: [
            [0, 'kick', 0.35, 8], [0, 'stabs', 0.5, 4], [0, 'pad', 1, 4], [0, 'waves', 0.9, 8],
            [0, 'glints', 0.5, 4], [4, 'hats', 0.25, 4], [4, 'bass', 0.8, 4], [4, 'perc', 0.25, 4],
          ],
          next: [['groove', 1]],
        },
        groove: {
          bars: [32, 48], kickless: false, duck: 0.1, open: 0.85,
          stabPool: 'drift', hatStyles: ['breath'], bassPool: ['swell', 'sparse'], glint: 0.4,
          cues: [
            [0, 'kick', 0.4, 2], [0, 'bass', 0.9, 2], [0, 'hats', 0.35, 4], [0, 'perc', 0.35, 4],
            [0, 'stabs', 0.55, 4], [0, 'pad', 1, 4], [0, 'waves', 0.8, 4], [0, 'glints', 0.5, 4],
          ],
          next: [['deep', 0.5], ['breakdown', 0.35], ['groove', 0.15]],
        },
        deep: {
          bars: [24, 32], kickless: false, duck: 0.06, open: 0.7,
          stabPool: 'drift', hatStyles: ['breath'], bassPool: ['swell'], glint: 0.5,
          cues: [
            [0, 'kick', 0.25, 4], [0, 'bass', 0.8, 2], [0, 'hats', 0.2, 4], [0, 'perc', 0.2, 4],
            [0, 'stabs', 0.4, 4], [0, 'pad', 1, 4], [0, 'waves', 1, 4], [0, 'glints', 0.6, 4],
          ],
          next: [['groove', 0.5], ['breakdown', 0.5]],
        },
        breakdown: {
          bars: [12, 16], kickless: true, duck: 0, open: 1,
          stabPool: 'drift', hatStyles: ['breath'], bassPool: ['swell'], glint: 0.5,
          cues: [
            [0, 'kick', 0, 0], [0, 'bass', 0.5, 4], [0, 'hats', 0.1, 2], [0, 'perc', 0, 2],
            [0, 'stabs', 0.5, 2], [0, 'pad', 1, 3], [0, 'waves', 1, 4], [0, 'glints', 0.7, 2],
          ],
          next: [['rise', 0.6], ['groove', 0.4]],
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

    // 残り火。暖かくくすんだ音。丸いアナログ風の和音と柔らかなキック、6th・add9・sus2 の少し切ない和声
    ember: {
      label: 'ember',
      bpm: [108, 114],
      swing: [0.04, 0.09],
      delaySteps: 3,
      progressions: { ids: ['dusk-i-iv', 'dusk-four', 'dusk-i-III'] },
      changeChance: { intro: 0.3, rise: 0.4, groove: 0.55, deep: 0.45, breakdown: 0.5 },
      budget: { density: 10, occupancy: 5.6, smear: 3.4, joint: 0.8 },
      drift: { bright: [30, 70, 160], decay: [38, 90], space: [48, 110] },
      feedback: { base: 0.5, swing: 0.05, min: 0.38, max: 0.64 },
      throwChance: { groove: 0.2, deep: 0.2, rise: 0.1, breakdown: 0.35 },
      riser: false,
      percSlots: [3, 7, 11, 14],
      percHits: [1, 2],
      waves: { periods: [4, 5, 6], chance: 0.7, rise: [24, 40], fall: [40, 64], peak: [0.25, 0.65] },
      glint: { starts: [2, 6, 10], gaps: [3, 4, 6], range: [72, 88] },
      sections: {
        intro: {
          bars: [4], kickless: true, duck: 0, open: 0.8,
          stabPool: 'sparse', hatStyles: ['sparse'], bassPool: ['offbeat'], glint: 0.4,
          cues: [
            [0, 'waves', 0.8, 2], [0, 'pad', 1, 4], [0, 'stabs', 0.55, 4], [0, 'glints', 0.5, 4],
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0, 0], [0, 'perc', 0, 0],
            [2, 'kick', 0.25, 2],
          ],
          next: [['rise', 1]],
        },
        rise: {
          bars: [8], kickless: false, duck: 0.25, open: 0.9,
          stabPool: 'full', hatStyles: ['open'], bassPool: ['offbeat', 'sparse'], glint: 0.35,
          cues: [
            [0, 'kick', 0.9, 8], [0, 'stabs', 0.8, 4], [0, 'pad', 0.9, 8], [0, 'waves', 0.6, 8],
            [0, 'glints', 0.4, 4], [2, 'hats', 0.45, 6], [4, 'bass', 0.9, 4], [4, 'perc', 0.35, 4],
          ],
          next: [['groove', 1]],
        },
        groove: {
          bars: [24, 32, 40], kickless: false, duck: 0.3, open: 1,
          stabPool: 'full', hatStyles: ['open', 'sparse'], bassPool: ['offbeat', 'ghost'], glint: 0.3,
          cues: [
            [0, 'kick', 0.9, 0], [0, 'bass', 1, 0], [0, 'hats', 0.75, 2], [0, 'perc', 0.55, 2],
            [0, 'stabs', 0.95, 2], [0, 'pad', 0.75, 4], [0, 'waves', 0.4, 4], [0, 'glints', 0.35, 4],
          ],
          next: [['deep', 0.45], ['breakdown', 0.4], ['groove', 0.15]],
        },
        deep: {
          bars: [16, 24], kickless: false, duck: 0.25, open: 0.85,
          stabPool: 'sparse', hatStyles: ['sparse'], bassPool: ['offbeat', 'sparse'], glint: 0.4,
          cues: [
            [0, 'kick', 0.9, 0], [0, 'bass', 0.9, 2], [0, 'hats', 0.45, 4], [0, 'perc', 0.3, 4],
            [0, 'stabs', 0.7, 4], [0, 'pad', 0.9, 4], [0, 'waves', 0.5, 4], [0, 'glints', 0.5, 4],
          ],
          next: [['groove', 0.5], ['breakdown', 0.5]],
        },
        breakdown: {
          bars: [8, 12], kickless: true, duck: 0, open: 1.15,
          stabPool: 'sparse', hatStyles: ['sparse'], bassPool: ['offbeat'], glint: 0.5,
          cues: [
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0.2, 2], [0, 'perc', 0, 2],
            [0, 'stabs', 0.8, 2], [0, 'pad', 1, 3], [0, 'waves', 0.8, 4], [0, 'glints', 0.6, 2],
          ],
          next: [['rise', 0.5], ['groove', 0.5]],
        },
      },
    },

    // 霧の中の四つ打ち。キックは音量 0 で鳴っていて（ゴースト・キック）、聞こえないまま拍ごとにほかの音を呼吸させる。
    // ベースも鳴らさない。低音を埋めずに、パッドと残響だけで漂う
    fog: {
      label: 'fog',
      bpm: [110, 116],
      swing: [0.02, 0.06],
      delaySteps: 3,
      progressions: { ids: ['still', 'i-iv', 'i-VI', 'ebb'], bars: [8, 16] },
      changeChance: { intro: 0.3, rise: 0.4, groove: 0.5, deep: 0.4, breakdown: 0.45 },
      budget: { density: 9, occupancy: 5, smear: 3.6, joint: 0.8 },
      drift: { bright: [30, 70, 160], decay: [40, 90], space: [48, 110] },
      feedback: { base: 0.52, swing: 0.06, min: 0.4, max: 0.66 },
      throwChance: { groove: 0.2, deep: 0.2, rise: 0.1, breakdown: 0.4 },
      riser: false,
      percSlots: [3, 7, 11, 14],
      percHits: [1, 2],
      // 波ではなく霧: 打ち寄せずに、10〜20 秒かけてゆっくり満ち引きする（tide のさざ波と被らないように）
      waves: { periods: [8, 10, 12], chance: 0.9, rise: [64, 96], fall: [96, 144], peak: [0.35, 0.7] },
      glint: { starts: [2, 6, 10], gaps: [4, 6], range: [72, 88] },
      sections: {
        intro: {
          bars: [4], kickless: true, duck: 0, open: 0.8,
          stabPool: 'dubSparse', hatStyles: ['breath'], bassPool: ['sparse'], glint: 0.4,
          cues: [
            [0, 'waves', 0.9, 2], [0, 'pad', 1, 4], [0, 'stabs', 0.5, 4], [0, 'glints', 0.5, 4],
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0, 0], [0, 'perc', 0, 0],
          ],
          next: [['rise', 1]],
        },
        rise: {
          bars: [8], kickless: false, duck: 0.35, open: 0.9,
          stabPool: 'dubSparse', hatStyles: ['breath'], bassPool: ['sparse'], glint: 0.35,
          cues: [
            [0, 'kick', 1, 8], [0, 'stabs', 0.7, 4], [0, 'pad', 0.95, 8], [0, 'waves', 0.7, 8],
            [0, 'glints', 0.4, 4], [2, 'hats', 0.4, 6], [0, 'bass', 0, 0], [4, 'perc', 0.3, 4],
          ],
          next: [['groove', 1]],
        },
        groove: {
          bars: [24, 32, 40], kickless: false, duck: 0.5, open: 1,
          stabPool: 'dubSparse', hatStyles: ['whisper', 'breath'], bassPool: ['sparse'], glint: 0.3,
          cues: [
            [0, 'kick', 1, 0], [0, 'bass', 0, 0], [0, 'hats', 0.7, 2], [0, 'perc', 0.45, 2],
            [0, 'stabs', 0.85, 2], [0, 'pad', 1, 4], [0, 'waves', 0.5, 4], [0, 'glints', 0.35, 4],
          ],
          next: [['deep', 0.45], ['breakdown', 0.4], ['groove', 0.15]],
        },
        deep: {
          bars: [16, 24], kickless: false, duck: 0.4, open: 0.8,
          stabPool: 'dubSparse', hatStyles: ['breath'], bassPool: ['sparse'], glint: 0.4,
          cues: [
            [0, 'kick', 1, 0], [0, 'bass', 0, 0], [0, 'hats', 0.45, 4], [0, 'perc', 0.25, 4],
            [0, 'stabs', 0.65, 4], [0, 'pad', 1, 4], [0, 'waves', 0.65, 4], [0, 'glints', 0.5, 4],
          ],
          next: [['groove', 0.5], ['breakdown', 0.5]],
        },
        breakdown: {
          bars: [8, 12, 16], kickless: true, duck: 0, open: 1.2,
          stabPool: 'dubSparse', hatStyles: ['breath'], bassPool: ['sparse'], glint: 0.5,
          cues: [
            [0, 'kick', 0, 0], [0, 'bass', 0, 0], [0, 'hats', 0.15, 2], [0, 'perc', 0, 2],
            [0, 'stabs', 0.8, 2], [0, 'pad', 1, 3], [0, 'waves', 0.9, 4], [0, 'glints', 0.7, 2],
          ],
          next: [['rise', 0.5], ['groove', 0.5]],
        },
      },
    },
  };

  U.worlds = Object.freeze({ WORLDS: deepFreeze(WORLDS), IDS: Object.freeze(Object.keys(WORLDS)) });
})((globalThis.Undertow = globalThis.Undertow || {}));
