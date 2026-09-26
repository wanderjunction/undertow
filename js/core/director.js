/*
 * Undertow — Director（音楽状態のただ一人の書き手）
 *
 *   Generator  候補を作る（良し悪しは判断しない）
 *   features   状態からその都度計算する（保存しない）
 *   evaluate   変化を多軸で測る（好みを持たない）
 *   select     好みはここだけ。ミニマル = 一度に変えるのは一つまで
 *   Director   いつ・どれだけ変えるか。状態を書き換えるのは nextBar() だけ
 *
 * ここは AudioNode も波形も知らない。出力は記号的な「小節プラン」（凍結済み）。
 * 時間の単位は小節とステップ（16分）。秒への変換は Transport の仕事。
 * 曲調ごとの値は WORLD（js/core/worlds.js）から読む。
 */
(function (U) {
  'use strict';
  const { deepFreeze, clamp, mod, smooth } = U.util;
  const { derive, formatSeed } = U.rng;
  const { CONFIRMED, CALIBRATION: CAL, CONTENT } = U.content;
  const { STABS, BASS, HATS, OPS, CHORDS, PROGRESSIONS, NOTE_NAMES, GUITAR } = CONTENT;
  const { WORLDS, VISIBLE: WORLD_IDS } = U.worlds; // ランダムに選ぶのは、非表示でない WORLD だけ

  const STEPS = CONFIRMED.STEPS_PER_BAR;
  const PARTS = CONFIRMED.PARTS;
  const CONTINUOUS = { pad: true, waves: true }; // 持続音の層は Renderer がゲインで動かす
  const round = (x, d = 1000) => Math.round(x * d) / d;

  // ---------------------------------------------------------------------------
  // 存在感のランプ（音楽時間 = 小節）
  // ---------------------------------------------------------------------------
  const ramp = (from, to, b0, b1) => ({ from, to, b0, b1 });

  function rampAt(r, pos) {
    if (pos <= r.b0) return r.from;
    if (pos >= r.b1) return r.to;
    return r.from + (r.to - r.from) * smooth((pos - r.b0) / (r.b1 - r.b0));
  }

  function retarget(r, to, pos, bars) {
    return ramp(round(rampAt(r, pos)), to, pos, pos + Math.max(bars, 1e-6));
  }

  // 何分もかけて動く、ゆっくりした揺らぎ（-1..1）。小節位置だけの関数なので再現できる
  function makeDrift(stream, periods) {
    const parts = periods.map((p) => ({
      w: (2 * Math.PI) / (p * stream.range(0.8, 1.25)),
      ph: stream.range(0, 2 * Math.PI),
    }));
    return (pos) => {
      let s = 0;
      for (const q of parts) s += Math.sin(q.w * pos + q.ph);
      return s / parts.length;
    };
  }

  // ---------------------------------------------------------------------------
  // 一回の再生を通して変わらないもの
  // ---------------------------------------------------------------------------
  // WORLD は seed から（専用の stream で）選ぶ。world を渡せば固定できる
  function worldOf(seed, forced) {
    if (forced) {
      if (!WORLDS[forced]) throw new Error('unknown world: ' + forced);
      return forced;
    }
    return derive(seed, 'world').pick(WORLD_IDS);
  }

  function makeIdentity(seed, forcedWorld) {
    const world = worldOf(seed, forcedWorld);
    const W = WORLDS[world];
    const r = derive(seed, 'identity');
    const bpm = r.int(W.bpm[0], W.bpm[1]);
    const keyPc = r.int(0, 11);
    const fifth = (keyPc + 7) % 12;
    // キックの基音は F1..B1 の中で、キーの根音か5度に合わせる
    let kickNote = 0;
    for (const pc of [keyPc, fifth]) {
      for (let m = 29; m <= 35 && !kickNote; m++) if (m % 12 === pc) kickNote = m;
    }
    return deepFreeze({
      seed: seed >>> 0,
      seedText: formatSeed(seed),
      world,
      worldLabel: W.label,
      bpm,
      keyPc,
      keyName: NOTE_NAMES[keyPc] + (W.mode === 'major' ? ' major' : ' minor'),
      swing: round(r.range(W.swing[0], W.swing[1])),
      kickNote,
      percNote: 79 + mod(r.pick([keyPc, fifth]) - 79, 12),
      glintRatio: r.pick([2, 3, 3.5]),
      stabDetune: round(r.range(5, 9), 10),
      delaySteps: W.delaySteps,
      waveOffsets: W.waves.periods.map((p) => r.int(0, p - 1)),
      calibration: CAL.version,
    });
  }

  // 一つの和音から、スタブ・パッド・ベース・きらめきの音をまとめて決める（パート間で和声を揃える）
  // ギターの押さえ方（sunset）: 標準チューニングの 6 弦で、実際に押さえられる形を探す。
  // 低い弦に根音、和音の音はすべて含む。弾く弦は根音の弦から 1 弦（高い E）まで途切れずに続ける
  // （Renderer は、配列の後ろから 1 弦・2 弦…と弦を割り当てる）。押さえる指は 4 本まで（いちばん低いフレットはセーハ）、
  // 幅は 4 フレット以内（見つからなければ 5 フレット）。開放弦と低い位置を好み、隣の弦どうしの半音のぶつかりを避ける
  const guitarShapes = new Map();
  function guitarVoicing(pc, iv) {
    const key = pc + ':' + iv.join(',');
    if (guitarShapes.has(key)) return guitarShapes.get(key);
    const tones = new Set(iv.map((i) => mod(pc + i, 12)));
    let best = null;
    for (let span = GUITAR.span; span <= GUITAR.span + 1 && !best; span++) {
      let bestScore = Infinity;
      for (let s0 = 0; s0 <= 2; s0++) {
        const opts = [];
        for (let s = s0; s < 6; s++) {
          const o = [];
          for (let f = 0; f <= GUITAR.frets; f++) {
            const n = mod(GUITAR.tuning[s] + f, 12);
            if (s === s0 ? n === pc : tones.has(n)) o.push(f);
          }
          opts.push(o);
        }
        const pick = [];
        const walk = (k) => {
          if (k < opts.length) {
            for (const f of opts[k]) {
              pick.push(f);
              walk(k + 1);
              pick.pop();
            }
            return;
          }
          const notes = pick.map((f, i) => GUITAR.tuning[s0 + i] + f);
          if (new Set(notes.map((n) => mod(n, 12))).size !== tones.size) return;
          const fretted = pick.filter((f) => f > 0);
          let low = 0;
          if (fretted.length) {
            low = Math.min(...fretted);
            if (Math.max(...fretted) - low > span) return;
            const barre = fretted.filter((f) => f === low).length;
            if (barre >= 2 && pick.includes(0)) return; // セーハと開放弦は一緒に鳴らさない
            if (fretted.length - barre + 1 > GUITAR.fingers) return;
          }
          let score = low * 0.6 - notes.length * 0.8 - pick.filter((f) => f === 0).length * 0.5 + fretted.length * 0.2;
          for (let i = 1; i < notes.length; i++) {
            const d = notes[i] - notes[i - 1];
            if (d === 1 || d === -1) score += 1.5;
            if (d < 0) score += 0.8;
          }
          if (notes[0] > 52) score += (notes[0] - 52) * 0.2;
          if (score < bestScore) {
            bestScore = score;
            best = notes;
          }
        };
        walk(0);
      }
    }
    guitarShapes.set(key, best);
    return best;
  }

  // ベースの型の音程を「和音の中の順位」で書いたもの（'r0' 根音、'r2' 根音から数えて 3 つ目の和音の音。オクターブの中へ畳む）。
  // 和音が変わっても、同じ型のまま和音の音だけを弾く（motor の回るベース）
  function chordTone(chord, spec) {
    const iv = chord.pad.map((n) => n - chord.pad[0]);
    return mod(iv[Math.min(Number(spec.slice(1)), iv.length - 1)], 12);
  }

  function voiceChord(keyPc, off, type, glintRange, voicing) {
    const iv = CHORDS[type];
    const pc = mod(keyPc + off, 12);
    const root = 45 + mod(pc - 45, 12); // A2..G♯3
    const close = iv.map((i) => root + i);
    // rootless（motor）: スタブは根音を抜いて上の音だけで鳴らし、根音はベースに任せる（浮いた響き）
    const stab = (voicing === 'guitar' && guitarVoicing(pc, iv)) || (voicing === 'rootless' ? close.slice(1) : close);
    const tones = iv.map((i) => mod(pc + i, 12));
    const glint = [];
    for (let m = glintRange[0]; m <= glintRange[1]; m++) if (tones.includes(m % 12)) glint.push(m);
    return {
      key: off + ':' + type,
      name: NOTE_NAMES[pc] + type,
      root,
      bass: 33 + mod(pc - 33, 12), // A1..G♯2
      stab,
      pad: close.map((n) => n + 12), // パッドはいつも鍵盤の形（ギターの形は和音の打ち方だけ）
      glint,
    };
  }

  // ---------------------------------------------------------------------------
  // Generator
  // ---------------------------------------------------------------------------
  function stabPattern(r, pool, allowEmpty) {
    return r.pick(STABS[pool].filter((p) => allowEmpty || p.length > 0));
  }

  function percHits(r, W) {
    if (W.percLoop) return W.percLoop.map(([pos, v]) => [pos, v]); // 決まった形で繰り返す（motor のリム）
    const hits = new Map();
    const n = r.int(W.percHits[0], W.percHits[1]);
    for (let i = 0; i < n; i++) hits.set(r.int(0, 1) * STEPS + r.pick(W.percSlots), round(r.range(0.5, 1), 100));
    return [...hits.entries()].sort((a, b) => a[0] - b[0]);
  }

  function initialParts(type, r, W) {
    const S = W.sections[type];
    const a = stabPattern(r, S.stabPool, false);
    return {
      stabs: { a, b: r.chance(0.45) ? a : stabPattern(r, S.stabPool, true) },
      bass: r.pick(S.bassPool),
      hats: { style: r.pick(S.hatStyles), density: round(r.range(0.2, 0.55), 100) },
      perc: percHits(r, W),
      glint: S.glint,
      spaceBias: 0,
      decayBias: 0,
    };
  }

  function safeParts(type, W) {
    const S = W.sections[type];
    return {
      stabs: { a: STABS[S.stabPool].find((p) => p.length > 0), b: [] },
      bass: S.bassPool[0],
      hats: { style: S.hatStyles[0], density: 0.2 },
      perc: [[W.percSlots[0], 0.7]],
      glint: round(S.glint * 0.5, 100),
      spaceBias: 0,
      decayBias: 0,
    };
  }

  function applyOp(op, p, type, r, W) {
    const S = W.sections[type];
    switch (op) {
      case 'stabs.a':
        return { ...p, stabs: { ...p.stabs, a: stabPattern(r, S.stabPool, false) } };
      case 'stabs.b':
        return { ...p, stabs: { ...p.stabs, b: stabPattern(r, S.stabPool, true) } };
      case 'stabs.echo': // 2小節目を空けてディレイに語らせる / 戻す
        return { ...p, stabs: { ...p.stabs, b: p.stabs.b.length ? [] : p.stabs.a } };
      case 'hats.density':
        return { ...p, hats: { ...p.hats, density: round(clamp(p.hats.density + r.pick([-0.18, 0.18]), 0.1, 0.8), 100) } };
      case 'hats.style': {
        const other = S.hatStyles.filter((x) => x !== p.hats.style);
        return other.length ? { ...p, hats: { ...p.hats, style: r.pick(other) } } : p;
      }
      case 'perc.reroll':
        return { ...p, perc: percHits(r, W) };
      case 'bass.pattern': {
        const other = S.bassPool.filter((x) => x !== p.bass);
        return other.length ? { ...p, bass: r.pick(other) } : p;
      }
      case 'glint.rate':
        return { ...p, glint: round(clamp(p.glint + r.pick([-0.15, 0.15]), 0, 0.8), 100) };
      case 'space.bias':
        return { ...p, spaceBias: round(clamp(p.spaceBias + r.pick([-0.05, 0.05]), -0.12, 0.1), 100) };
      case 'decay.bias':
        return { ...p, decayBias: round(clamp(p.decayBias + r.pick([-0.15, 0.15]), -0.3, 0.3), 100) };
    }
    return p;
  }

  function generate(parts, type, r, W) {
    const ops = [];
    const n = r.chance(0.7) ? 1 : 2;
    while (ops.length < n) {
      const op = r.pick(OPS);
      if (!ops.includes(op)) ops.push(op);
    }
    let p = parts;
    for (const op of ops) p = applyOp(op, p, type, r, W);
    return { parts: p, ops };
  }

  // ---------------------------------------------------------------------------
  // Features（記号的な状態から計算する。保存しない）
  // ---------------------------------------------------------------------------
  function hatExpectation(hats) {
    let count = 0;
    let open = 0;
    for (const e of HATS[hats.style]) {
      if (!e) continue;
      const p = clamp(e[2] + hats.density * e[3], 0, 1);
      count += p;
      if (e[1]) open += p;
    }
    return { count, open };
  }

  // ベースが鳴っている最中にキックの拍が来る割合（2 パート間の低域マスキング）
  function bassOverlap(pattern, swingMax) {
    let hit = 0;
    for (const k of [...CONFIRMED.KICK_STEPS, STEPS]) {
      for (const [st, , len] of pattern) {
        const s0 = st % 2 ? st + swingMax : st;
        if (s0 < k && k < s0 + len) hit++;
      }
    }
    return hit / CONFIRMED.KICK_STEPS.length;
  }

  function features(parts, ctx) {
    const { lv, W } = ctx;
    const stabHits = ((parts.stabs.a.length + parts.stabs.b.length) / 2) * lv.stabs;
    const hats = hatExpectation(parts.hats);
    const hatCount = hats.count * lv.hats;
    const hatOpen = hats.open * lv.hats;
    const percHitsPerBar = (parts.perc.length / 2) * lv.perc;
    const bass = BASS[parts.bass];
    let bassLen = 0;
    for (const n of bass) bassLen += n[2];
    const fb = clamp(ctx.feedback + parts.spaceBias, W.feedback.min, W.feedback.max);
    const tail = 1 / (1 - fb); // ディレイの実効的な伸び（等比級数の和）
    const decay = clamp(ctx.decay + parts.decayBias, 0, 1);
    const glint = parts.glint * lv.glints;
    return {
      density: stabHits + hatCount * 0.35 + percHitsPerBar * 0.8 + bass.length * lv.bass * 0.4 + glint * 1.5,
      occupancy:
        stabHits * (0.25 + decay) * tail * 0.6 +
        hatOpen * 0.25 +
        (hatCount - hatOpen) * 0.04 +
        percHitsPerBar * 0.15 * tail +
        (bassLen / STEPS) * lv.bass +
        glint * 0.8,
      smear: stabHits * decay * tail,
      lowOverlap: lv.kick > CAL.audible && lv.bass > CAL.audible ? bassOverlap(bass, W.swing[1]) : 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Evaluator（測るだけ） / Selector（好みはここだけ）
  // ---------------------------------------------------------------------------
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // 内容で比べる（参照や ID が違うだけのものを「変化」と数えない）。聞こえないパートの変化も数えない
  function changedParts(a, b, lv) {
    const out = [];
    const audible = (p) => lv[p] > CAL.audible;
    if (!same(a.stabs, b.stabs) && audible('stabs')) out.push('stabs');
    if (!same(a.hats, b.hats) && audible('hats')) out.push('hats');
    if (!same(a.perc, b.perc) && audible('perc')) out.push('perc');
    if (a.bass !== b.bass && audible('bass')) out.push('bass');
    if (a.glint !== b.glint && audible('glints')) out.push('glints');
    if ((a.spaceBias !== b.spaceBias || a.decayBias !== b.decayBias) && (audible('stabs') || audible('perc'))) out.push('space');
    return out;
  }

  function evaluate(base, cand, changed, budget) {
    const dDensity = (cand.density - base.density) / Math.max(1, base.density);
    const dOccupancy = (cand.occupancy - base.occupancy) / Math.max(0.5, base.occupancy);
    const warnings = [];
    if (cand.lowOverlap > 0) warnings.push('low-overlap');
    if (cand.smear > budget.smear) warnings.push('smear');
    if (cand.density > budget.density) warnings.push('density');
    if (cand.occupancy > budget.occupancy) warnings.push('occupancy');
    if (cand.density > budget.density * budget.joint && cand.occupancy > budget.occupancy * budget.joint) warnings.push('dense+long');
    return {
      changed,
      dDensity,
      dOccupancy,
      magnitude: changed.length * 0.25 + Math.abs(dDensity) + 0.5 * Math.abs(dOccupancy),
      warnings,
    };
  }

  function select(evals, target, r) {
    let best = -1;
    let bestScore = Infinity;
    evals.forEach((e, i) => {
      if (e.warnings.length) return;
      const score =
        Math.abs(e.magnitude - target) +
        Math.max(0, e.changed.length - 1) * CAL.extraPartPenalty +
        r.range(0, 0.04);
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    return best; // -1 = 全候補が予算違反 → 変えない
  }

  // ---------------------------------------------------------------------------
  // Director
  // ---------------------------------------------------------------------------
  class Director {
    constructor({ seed, world }) {
      this.identity = makeIdentity(seed, world);
      this.W = WORLDS[this.identity.world];
      const s = this.identity.seed;
      this._form = derive(s, 'form');
      this._harmony = derive(s, 'harmony');
      this._variation = derive(s, 'variation');
      const d = derive(s, 'drift');
      this._drift = {
        bright: makeDrift(d, this.W.drift.bright),
        decay: makeDrift(d, this.W.drift.decay),
        space: makeDrift(d, this.W.drift.space),
      };
      // うねりは専用の stream から作る（ほかの決定の乱数を一つも動かさない）
      this._swell = makeDrift(derive(s, 'swell'), this.W.swell || CAL.swell);
      // アシッドのつまみ: フィルターの開き具合が、数十小節かけてゆっくり回る（acid の WORLD だけ。専用の stream）
      this._acid = this.W.acid ? makeDrift(derive(s, 'acid'), this.W.acid.tweak) : null;
      this._state = null;
      this._bar = 0;
    }

    get state() {
      return this._state;
    }

    // 唯一の書き込み口。次の小節の状態を作り、その小節のプランを返す
    nextBar() {
      const bar = this._bar;
      const controls = [];
      const state = this._advance(this._state, bar, controls);
      const plan = this._plan(state, bar, controls);
      this._state = state;
      this._bar = bar + 1;
      return plan;
    }

    _initial() {
      const levels = {};
      for (const p of PARTS) levels[p] = ramp(0, 0, 0, 0);
      return {
        bar: 0,
        section: null,
        harmony: null,
        chord: null,
        parts: null,
        levels,
        duck: ramp(0, 0, 0, 0),
        open: ramp(1, 1, 0, 0),
        evolution: null,
      };
    }

    _context(s, pos) {
      const lv = {};
      for (const p of PARTS) lv[p] = rampAt(s.levels[p], pos);
      const F = this.W.feedback;
      return {
        W: this.W,
        lv,
        decay: 0.45 + 0.35 * this._drift.decay(pos),
        feedback: F.base + F.swing * this._drift.space(pos),
      };
    }

    _advance(prev, bar, controls) {
      const SECTIONS = this.W.sections;
      let s = prev ? { ...prev } : this._initial();
      if (!prev || bar >= prev.section.end) s = this._enterSection(s, prev ? prev.section.next : 'intro', bar);

      const sec = s.section;
      const S = SECTIONS[sec.type];
      const rel = bar - sec.start;
      const left = sec.end - bar;

      let levels = s.levels;
      for (const [at, part, value, bars] of S.cues) {
        if (at !== rel) continue;
        levels = { ...levels, [part]: retarget(levels[part], value, bar, bars) };
        if (CONTINUOUS[part]) controls.push({ kind: 'level', part, value, step: 0, steps: bars * STEPS });
      }
      // 拍のないセクションの 2 小節前から、キックを水面下へ沈めていく
      if (left === 2 && SECTIONS[sec.next].kickless && levels.kick.to > 0) {
        levels = { ...levels, kick: retarget(levels.kick, 0, bar, 2), bass: retarget(levels.bass, 0, bar, 1.5) };
      }
      s.levels = levels;

      if (rel > 0 && rel % CONFIRMED.PHRASE_BARS === 0) this._evolve(s, bar);

      const h = s.harmony;
      const [off, type] = h.chords[Math.floor((bar - h.start) / h.bars) % h.chords.length];
      if (!s.chord || s.chord.key !== off + ':' + type) {
        s.chord = voiceChord(this.identity.keyPc, off, type, this.W.glint.range, this.W.voicing);
        controls.push({ kind: 'pad', step: 0, notes: s.chord.pad });
      }
      s.bar = bar;
      return deepFreeze(s);
    }

    _enterSection(s, type, bar) {
      const S = this.W.sections[type];
      s.section = { type, start: bar, end: bar + this._form.pick(S.bars), next: this._form.weighted(S.next) };
      s.duck = retarget(s.duck, S.duck, bar, 2);
      s.open = retarget(s.open, S.open, bar, 4);
      if (!s.harmony || type === 'breakdown' || (type === 'groove' && this._harmony.chance(0.35))) {
        s.harmony = this._progression(s.harmony, bar);
      }
      s.parts = this._initialParts(type, s, bar);
      s.evolution = { phrase: 0, stasis: 0, last: 'section', ops: [] };
      return s;
    }

    _progression(prev, bar) {
      const r = this._harmony;
      const P = this.W.progressions;
      const all = P.ids.map((id) => PROGRESSIONS.find((p) => p.id === id));
      const pool = prev ? all.filter((p) => p.id !== prev.id) : all;
      const p = r.pick(pool);
      return { id: p.id, chords: p.chords, bars: r.pick(P.bars || p.bars), start: bar };
    }

    // セクションの頭のパート。予算を満たす候補が見つからなければ、安全な既定値へ（無限に探さない）
    _initialParts(type, s, bar) {
      const ctx = this._context(s, bar);
      for (const [, part, value] of this.W.sections[type].cues) ctx.lv[part] = Math.max(ctx.lv[part], value);
      for (let attempt = 0; attempt < 8; attempt++) {
        const parts = initialParts(type, this._variation, this.W);
        const f = features(parts, ctx);
        if (!evaluate(f, f, [], this.W.budget).warnings.length) return parts;
      }
      return safeParts(type, this.W);
    }

    // フレーズ境界での変化: Director が「どれだけ変えたいか」を決め、候補から Selector が選ぶ
    _evolve(s, bar) {
      const r = this._variation;
      const ev = s.evolution;
      const type = s.section.type;
      const wantChange = ev.stasis >= CAL.maxStasis || r.chance(this.W.changeChance[type]);
      const target = wantChange ? CAL.changeTarget : 0;
      const ctx = this._context(s, bar);
      const base = features(s.parts, ctx);

      const cands = [{ parts: s.parts, ops: [] }];
      for (let i = 0; i < CAL.candidates; i++) cands.push(generate(s.parts, type, r, this.W));
      const evals = cands.map((c) =>
        evaluate(base, features(c.parts, ctx), changedParts(s.parts, c.parts, ctx.lv), this.W.budget)
      );
      const pick = select(evals, target, r);

      const changed = pick >= 0 ? evals[pick].changed : [];
      if (pick >= 0) s.parts = cands[pick].parts;
      s.evolution = {
        phrase: ev.phrase + 1,
        stasis: changed.length ? 0 : ev.stasis + 1,
        last: pick < 0 ? 'all-rejected' : changed.length ? changed.join('+') : 'stasis',
        ops: pick >= 0 ? cands[pick].ops : [],
      };
    }

    _plan(s, bar, controls) {
      const id = this.identity;
      const W = this.W;
      const h = derive(id.seed, 'bar:' + bar); // この小節だけの揺らぎ（状態を持たない）
      const L = s.levels;
      const P = s.parts;
      const sec = s.section;
      const next = W.sections[sec.next];
      const left = sec.end - bar;
      const at = (step) => bar + step / STEPS;
      const swing = (step) => (step % 2 === 1 ? step + id.swing : step);
      const events = [];

      // キック（四つ打ち）。沈む直前の最後の一拍だけ抜く
      const dropLast = left === 1 && next.kickless;
      for (const k of CONFIRMED.KICK_STEPS) {
        const p = rampAt(L.kick, at(k));
        if (p < 0.02 || (dropLast && k === 12)) continue;
        events.push({
          voice: 'kick',
          step: k,
          vel: round(h.range(0.94, 1)),
          presence: round(p),
          duck: round(rampAt(s.duck, at(k)) * p),
        });
      }

      let prevBass = null;
      if (!W.poly) for (const [st, v, len, oct, fx] of BASS[P.bass]) {
        const p = rampAt(L.bass, at(st));
        if (p < 0.02) continue;
        const e = { voice: 'bass', step: swing(st), note: s.chord.bass + (typeof oct === 'string' ? chordTone(s.chord, oct) : oct), vel: round(v * p * h.range(0.9, 1) * (W.accent ? W.accent[st] : 1)), len };
        if (fx === 'g' && prevBass !== null) e.from = prevBass; // 前の音から滑って入る
        if (this._acid) e.cut = round(clamp(0.5 + 0.38 * this._acid(at(st)) + 0.3 * (rampAt(s.open, at(st)) - 1), 0.05, 0.95));
        prevBass = e.note;
        events.push(e);
      }

      HATS[P.hats.style].forEach((e, st) => {
        if (!e) return;
        const p = rampAt(L.hats, at(st));
        if (p < 0.02 || !h.chance(clamp(e[2] + P.hats.density * e[3], 0, 1))) return;
        // W.machine（motor）: ドラムマシンのように、強さもタイミングも揺らさない（位置もいつも同じ）
        events.push({
          voice: 'hat',
          step: W.machine ? swing(st) : round(swing(st) + h.range(0, 0.02)),
          vel: round(e[0] * p * (W.machine ? 1 : h.range(0.8, 1)) * (W.accent ? W.accent[st] : 1)),
          open: e[1] === 1,
          pan: W.machine ? 0.15 : round(h.range(-0.3, 0.3)),
        });
      });

      if (!W.poly) for (const [pos, v] of P.perc) {
        if (Math.floor(pos / STEPS) !== bar % 2) continue;
        const st = pos % STEPS;
        const p = rampAt(L.perc, at(st));
        if (p < 0.02) continue;
        events.push({ voice: 'perc', step: swing(st), note: id.percNote, vel: round(v * p * (W.accent ? W.accent[st] : 1)), pan: round(h.range(-0.5, 0.5)) });
      }

      // ライド（motor）: W.ride の位置に毎小節。ハットの強さに従い、揺らさない
      if (W.ride && !W.poly) for (const [st, v] of W.ride) {
        const p = rampAt(L.hats, at(st));
        if (p >= 0.02) events.push({ voice: 'hat', ride: true, step: swing(st), vel: round(v * p), open: false, pan: -0.2 });
      }

      // 手拍子（motor）: W.claps の位置に毎小節。パーカッションの強さに従い、ドラムマシンらしく強さを揺らさない（乱数を使わない）
      if (W.claps && !W.poly) for (const [st, v] of W.claps) {
        const p = rampAt(L.perc, at(st));
        if (p >= 0.02) events.push({ voice: 'clap', step: swing(st), vel: round(v * p) });
      }

      // スタブ。打数とフィードバックが多いほど減衰を短くする（長い減衰 × 高密度を同時に起こさない）
      // 上限は、実際に鳴らす（丸めた後の）値で守る
      const ctx = this._context(s, bar);
      const fb = round(clamp(ctx.feedback + P.spaceBias, W.feedback.min, W.feedback.max));
      const hitsAvg = (P.stabs.a.length + P.stabs.b.length) / 2;
      let decay = clamp(ctx.decay + P.decayBias, 0, 1);
      if (hitsAvg > 0) decay = Math.min(decay, (W.budget.smear * (1 - fb)) / hitsAvg);
      decay = Math.floor(decay * 1000) / 1000;
      const bright = clamp(0.5 + 0.32 * this._drift.bright(bar) + 0.45 * (rampAt(s.open, bar) - 1), 0.05, 0.95);
      const throwHere = bar % 8 === 7 && h.chance(W.throwChance[sec.type] || 0);
      let lastStab = null;
      // W.stabShift（motor）: 4 小節のうち決まった小節だけ、同じ形のまま横へずらす（和声は動かないのに、置き場所で曲が動く）
      const shift = W.stabShift ? W.stabShift[bar % W.stabShift.length] : 0;
      const stabSteps = (bar % 2 ? P.stabs.b : P.stabs.a).map((x) => (x + shift) % STEPS).sort((x, y) => x - y);
      for (const st of stabSteps) {
        const p = rampAt(L.stabs, at(st));
        if (p < 0.02 || !h.chance(0.92)) continue;
        lastStab = {
          voice: 'stab',
          step: swing(st),
          notes: s.chord.stab,
          vel: round(p * h.range(0.78, 1)),
          // W.sweep（motor）: フィルターのつまみを数小節かけて回すように、明るさを小節をまたいでゆっくり上下させる（乱数は使わない）
          bright: round(W.sweep ? clamp(bright + W.sweep.depth * Math.sin((2 * Math.PI * (bar + st / STEPS)) / W.sweep.bars), 0.05, 0.95) : bright),
          decay: round(decay),
        };
        events.push(lastStab);
      }
      if (throwHere && lastStab) controls.push({ kind: 'throw', step: lastStab.step, bars: 1.25 });
      controls.push({ kind: 'space', step: 0, feedback: round(fb) });
      // うねり（-1 = 遠い、+1 = 近い）。どう聞かせるかは Renderer がパッチで決める
      controls.push({ kind: 'swell', step: 0, value: round(this._swell(bar)) });

      const gl = P.glint * rampAt(L.glints, bar);
      // W.riff（motor）: 短いフレーズ（リフ）を riff.bars 小節ごとに繰り返す。形は曲ごとに一つ（seed で決まる）。
      // 音は和音の高い方から数えた順位で持つので、和音が変わると同じ形のまま音だけ移る
      if (W.riff) {
        const shape = W.riff.shapes[id.seed % W.riff.shapes.length];
        const pool = s.chord.glint;
        const lv = rampAt(L.glints, bar) * W.riff.level;
        if (lv > 0.02) for (const [pos, rank, v] of shape) {
          if (Math.floor(pos / STEPS) !== bar % (W.riff.bars || 2)) continue;
          const st = pos % STEPS;
          events.push({ voice: 'glint', step: swing(st), note: pool[Math.max(0, pool.length - 1 - rank)], vel: round(clamp(v * lv, 0, 1)), pan: round(0.3 * Math.sin(pos)) });
        }
      } else if (!W.poly && gl > 0.02 && h.chance(0.12 + 0.5 * gl)) {
        const pool = s.chord.glint;
        let idx = h.int(Math.floor(pool.length / 2), pool.length - 1);
        let st = h.pick(W.glint.starts);
        const n = h.chance(0.35) ? h.int(2, 3) : 1;
        for (let i = 0; i < n && st < STEPS; i++) {
          events.push({
            voice: 'glint',
            step: swing(st),
            note: pool[idx],
            vel: round(h.range(0.55, 1) * clamp(gl * 1.6, 0.3, 1)),
            pan: round(h.range(-0.6, 0.6)),
          });
          st += h.pick(W.glint.gaps);
          idx = Math.max(0, idx - h.int(1, 2));
        }
      }

      // glide: 16 で割り切れない周期で回るパターン。何小節もかけてずれ、なかなか元の形に戻らない
      if (W.poly) {
        const Y = W.poly;
        const pool = s.chord.glint;
        for (let st = 0; st < STEPS; st++) {
          const abs = bar * STEPS + st;
          // ベース: 3 ステップ周期。キックの拍（st % 4 === 0）には置かない（低域を重ねない）
          const pb = rampAt(L.bass, at(st));
          if (pb > 0.02 && abs % Y.bass.cycle === 0 && st % 4 !== 0) {
            const accent = Y.bass.accent[Math.floor(abs / Y.bass.cycle) % Y.bass.accent.length];
            events.push({ voice: 'bass', step: st, note: s.chord.bass, vel: round(accent * pb * h.range(0.9, 1)), len: Y.bass.len });
          }
          // パーカッション: 5 ステップ周期
          const pp = rampAt(L.perc, at(st));
          if (pp > 0.02 && abs % Y.perc.cycle === Y.perc.offset && st % 4 !== 0) {
            events.push({ voice: 'perc', step: st, note: id.percNote, vel: round(0.7 * pp * h.range(0.85, 1)), pan: round(h.range(-0.5, 0.5)) });
          }
          // アルペジオ: 和音の高い音を、長さ 5 の形でなぞる（強弱は長さ 3 で回る）
          if (gl > 0.02 && abs % Y.arp.every === 0) {
            const k = Math.floor(abs / Y.arp.every);
            const note = pool[Y.arp.shape[k % Y.arp.shape.length] % pool.length];
            const accent = Y.arp.accent[k % Y.arp.accent.length];
            events.push({ voice: 'glint', step: st, note, vel: round(clamp(accent * gl * 1.6, 0, 1)), pan: round(0.35 * Math.sin(k * 0.7)) });
          }
        }
      }

      const WV = W.waves;
      WV.periods.forEach((period, lane) => {
        if ((bar + id.waveOffsets[lane]) % period !== 0 || !h.chance(WV.chance)) return;
        const wave = {
          voice: 'wave',
          lane,
          step: round(h.range(0, 12)),
          peak: round(h.range(WV.peak[0], WV.peak[1])),
          rise: round(h.range(WV.rise[0], WV.rise[1])),
          fall: round(h.range(WV.fall[0], WV.fall[1])),
        };
        // 音のある波（moon）: いま鳴っている和音の高い音から選ぶ。澄んだ音同士が隣り合うとうなりが濁るので、
        // 2 音目は 3 半音（短 3 度）以上離れたものだけ。見つからなければ 1 音で鳴らす
        if (WV.tones) {
          const pool = s.chord.glint;
          const count = h.int(WV.tones[0], WV.tones[1]);
          const notes = [];
          for (let tries = 0; notes.length < count && tries < 12; tries++) {
            const m = h.pick(pool);
            if (notes.every((x) => Math.abs(x - m) >= 3)) notes.push(m);
          }
          wave.notes = notes.sort((a, b) => a - b);
        }
        events.push(wave);
      });

      // ブレイクから一気に戻る前の 2 小節、せり上がり
      if (W.riser && left === 2 && sec.type === 'breakdown' && sec.next === 'groove') {
        controls.push({ kind: 'riser', step: 0, steps: 2 * STEPS });
      }

      events.sort((a, b) => a.step - b.step);
      return deepFreeze({
        bar,
        section: sec.type,
        chord: s.chord.name,
        evolution: s.evolution.last,
        events,
        controls,
      });
    }
  }

  U.core = Object.freeze({ Director, features, evaluate, select, changedParts, rampAt, voiceChord, guitarVoicing, makeIdentity, worldOf });
})((globalThis.Undertow = globalThis.Undertow || {}));
