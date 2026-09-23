/*
 * Undertow — コアの約束を確かめる（ブラウザも音も使わない）
 *   node --test tests/core.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

for (const f of ['util.js', 'rng.js', 'content.js', 'worlds.js', 'director.js']) require(path.join(__dirname, '..', 'js', 'core', f));
const U = globalThis.Undertow;
const { Director, rampAt, select } = U.core;
const { CONFIRMED, CONTENT } = U.content;
const { WORLDS, IDS } = U.worlds;

const SEEDS = Array.from({ length: 24 }, (_, i) => Math.imul(i + 1, 2654435761) >>> 0);

function run(seed, bars, world) {
  const d = new Director({ seed, world });
  const out = [];
  for (let i = 0; i < bars; i++) {
    const plan = d.nextBar();
    out.push({ plan, state: d.state });
  }
  return { d, bars: out };
}

// seed まかせ（WORLD が混ざる）と、WORLD を固定したものの両方で回す
function* cases(seedCount, bars) {
  for (const seed of SEEDS.slice(0, seedCount)) yield { seed, ...run(seed, bars) };
  for (const world of IDS) for (const seed of SEEDS.slice(0, Math.max(2, seedCount / 4))) yield { seed, world, ...run(seed, bars, world) };
}

const pcs = (notes) => new Set(notes.map((n) => ((n % 12) + 12) % 12));

test('同じ seed からは、同じ曲が最初から最後まで再現される', () => {
  for (const world of [undefined, ...IDS]) {
    const a = run(0x9e3779b1, 300, world).bars.map((b) => b.plan);
    const b = run(0x9e3779b1, 300, world).bars.map((b) => b.plan);
    assert.equal(JSON.stringify(a), JSON.stringify(b), String(world));
  }
});

test('seed が違えば曲も違う', () => {
  const a = run(1, 64).bars.map((b) => b.plan);
  const b = run(2, 64).bars.map((b) => b.plan);
  assert.notEqual(JSON.stringify(a), JSON.stringify(b));
});

test('乱数の stream は目的ごとに独立している（他の目的の消費で値がずれない）', () => {
  const fresh = U.rng.derive(42, 'harmony');
  const expected = Array.from({ length: 8 }, () => fresh.next());
  const noisy = U.rng.derive(42, 'form');
  for (let i = 0; i < 1000; i++) noisy.next();
  const again = U.rng.derive(42, 'harmony');
  assert.deepEqual(Array.from({ length: 8 }, () => again.next()), expected);
  assert.notEqual(U.rng.derive(42, 'form').next(), U.rng.derive(42, 'harmony').next());
});

test('WORLD: seed から決まり、固定もでき、テンポはその WORLD の範囲に収まる', () => {
  const seen = new Set();
  for (let i = 1; i <= 300; i++) {
    const seed = Math.imul(i, 2654435761) >>> 0;
    const id = new Director({ seed }).identity;
    assert.equal(id.world, new Director({ seed }).identity.world);
    seen.add(id.world);
  }
  assert.deepEqual([...seen].sort(), [...IDS].sort(), 'どの WORLD も選ばれる');
  for (const world of IDS) {
    for (const seed of SEEDS) {
      const id = new Director({ seed, world }).identity;
      const W = WORLDS[world];
      assert.equal(id.world, world);
      assert.ok(id.bpm >= W.bpm[0] && id.bpm <= W.bpm[1], `${world} bpm ${id.bpm}`);
      assert.equal(id.delaySteps, W.delaySteps);
    }
  }
  assert.throws(() => new Director({ seed: 1, world: 'nope' }));
});

test('パートの役割とセクションの種類は、全 WORLD で共通', () => {
  for (const world of IDS) {
    const W = WORLDS[world];
    assert.deepEqual(Object.keys(W.sections).sort(), [...CONFIRMED.SECTION_TYPES].sort(), world);
    for (const [type, S] of Object.entries(W.sections)) {
      const cued = new Set(S.cues.map((c) => c[1])); // 入る小節は遅れてもいい（rise のベースなど）
      for (const part of CONFIRMED.PARTS) assert.ok(cued.has(part), `${world}.${type}: ${part} の目標がない`);
      for (const c of S.cues) assert.ok(CONFIRMED.PARTS.includes(c[1]), `${world}.${type}: 未知のパート ${c[1]}`);
      assert.ok(CONTENT.STABS[S.stabPool], `${world}.${type}: stabPool ${S.stabPool}`);
      for (const b of S.bassPool) assert.ok(CONTENT.BASS[b], `${world}.${type}: bass ${b}`);
      for (const h of S.hatStyles) assert.ok(CONTENT.HATS[h], `${world}.${type}: hats ${h}`);
      for (const [next] of S.next) assert.ok(W.sections[next], `${world}.${type}: next ${next}`);
    }
    for (const id of W.progressions.ids) assert.ok(CONTENT.PROGRESSIONS.some((p) => p.id === id), `${world}: progression ${id}`);
  }
});

test('四つ打ち: キックは 0/4/8/12 にだけ鳴り、キックのある小節では毎拍鳴る', () => {
  for (const { d, bars } of cases(8, 300)) {
    const W = WORLDS[d.identity.world];
    for (const { plan, state } of bars) {
      const kicks = plan.events.filter((e) => e.voice === 'kick');
      for (const k of kicks) assert.ok(CONFIRMED.KICK_STEPS.includes(k.step), `kick at step ${k.step}`);
      const present = CONFIRMED.KICK_STEPS.every((s) => rampAt(state.levels.kick, plan.bar + s / 16) >= 0.05);
      if (!present) continue;
      const sec = state.section;
      const dropLast = sec.end - plan.bar === 1 && W.sections[sec.next].kickless; // 沈む直前の一拍だけ抜く
      assert.equal(kicks.length, dropLast ? 3 : 4, `${d.identity.world} bar ${plan.bar} (${sec.type})`);
    }
  }
});

test('ベースの音はキックの拍をまたがない（低域を同時に鳴らさない）', () => {
  for (const { plan } of [...cases(24, 300)].flatMap((c) => c.bars)) {
    const kicks = plan.events.filter((e) => e.voice === 'kick').map((e) => e.step).concat([16]);
    for (const b of plan.events.filter((e) => e.voice === 'bass')) {
      for (const k of kicks) assert.ok(!(b.step < k && k < b.step + b.len), `bar ${plan.bar}: bass ${b.step}+${b.len} over kick ${k}`);
    }
  }
});

test('状態の書き手は Director だけ: 状態もプランも凍結されている', () => {
  const d = new Director({ seed: 7 });
  const plan = d.nextBar();
  assert.ok(Object.isFrozen(d.state) && Object.isFrozen(d.state.parts) && Object.isFrozen(d.state.levels.kick));
  assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.events) && Object.isFrozen(d.identity));
  assert.throws(() => {
    d.state = {};
  }, TypeError);
  assert.throws(() => {
    d.state.parts.bass = 'rolling';
  }, TypeError);
  assert.throws(() => {
    plan.events.push({});
  }, TypeError);
});

test('予算: 鳴らすスタブは「打数 × 減衰 × ディレイの伸び」が WORLD の上限を超えない', () => {
  for (const { d, bars } of cases(24, 400)) {
    const budget = WORLDS[d.identity.world].budget.smear;
    for (const { plan, state } of bars) {
      const space = plan.controls.find((c) => c.kind === 'space');
      const tail = 1 / (1 - space.feedback);
      const hits = (state.parts.stabs.a.length + state.parts.stabs.b.length) / 2;
      for (const s of plan.events.filter((e) => e.voice === 'stab')) {
        assert.ok(hits * s.decay * tail <= budget + 1e-6, `${d.identity.world} bar ${plan.bar}: smear ${hits * s.decay * tail}`);
      }
    }
  }
});

test('Selector は予算違反の候補を選ばず、全滅なら変えない（-1）', () => {
  const r = U.rng.derive(1, 'test');
  const ok = { changed: ['stabs'], magnitude: 0.4, warnings: [] };
  const bad = { changed: ['hats'], magnitude: 0.4, warnings: ['smear'] };
  for (let i = 0; i < 50; i++) assert.equal(select([bad, ok, bad], 0.4, r), 1);
  assert.equal(select([bad, bad], 0.4, r), -1);
});

test('ミニマル: フレーズの変化はほぼ一度に一パートまで、候補の全滅はまれ', () => {
  for (const world of IDS) {
    let changes = 0;
    let multi = 0;
    let rejected = 0;
    let phrases = 0;
    for (const seed of SEEDS) {
      let prevPhrase = -1;
      for (const { state } of run(seed, 500, world).bars) {
        const ev = state.evolution;
        if (ev.phrase === prevPhrase || ev.last === 'section') {
          prevPhrase = ev.phrase;
          continue;
        }
        prevPhrase = ev.phrase;
        phrases++;
        if (ev.last === 'all-rejected') rejected++;
        else if (ev.last !== 'stasis') {
          changes++;
          if (ev.last.includes('+')) multi++;
        }
      }
    }
    assert.ok(phrases > 400, `${world}: phrases ${phrases}`);
    assert.ok(multi / changes < 0.05, `${world}: multi-part ${multi}/${changes}`);
    assert.ok(rejected / phrases < 0.03, `${world}: all-rejected ${rejected}/${phrases}`);
  }
});

test('パート間の和声: ベース・パッド・きらめき・音のある波は、いま鳴っているスタブの和音から外れない', () => {
  for (const { plan, state } of [...cases(8, 300)].flatMap((c) => c.bars)) {
    const chord = pcs(state.chord.stab);
    assert.ok(chord.has(((state.chord.bass % 12) + 12) % 12), 'bass root');
    for (const e of plan.events) {
      if (e.voice === 'stab') assert.deepEqual(pcs(e.notes), chord);
      if (e.voice === 'glint') assert.ok(chord.has(e.note % 12), `glint ${e.note}`);
      if (e.voice === 'bass') assert.ok(chord.has(e.note % 12), `bass ${e.note}`);
      if (e.voice === 'wave' && e.notes) {
        for (const n of e.notes) assert.ok(chord.has(n % 12), `wave ${n}`);
        for (let i = 1; i < e.notes.length; i++) assert.ok(e.notes[i] - e.notes[i - 1] >= 3, `wave notes too close ${e.notes}`);
      }
    }
    for (const c of plan.controls) if (c.kind === 'pad') assert.deepEqual(pcs(c.notes), chord);
  }
});

test('イベントの値はすべて有限で、決められた範囲に収まる', () => {
  const unit = ['vel', 'presence', 'duck', 'bright', 'decay', 'peak'];
  for (const { plan } of [...cases(12, 300)].flatMap((c) => c.bars)) {
    for (const e of plan.events) {
      assert.ok(e.step >= 0 && e.step < 16, `step ${e.step}`);
      for (const k of unit) if (k in e) assert.ok(Number.isFinite(e[k]) && e[k] >= 0 && e[k] <= 1, `${e.voice}.${k}=${e[k]}`);
      if ('pan' in e) assert.ok(e.pan >= -1 && e.pan <= 1);
      for (const n of e.notes || (e.note !== undefined ? [e.note] : [])) assert.ok(Number.isInteger(n) && n >= 24 && n <= 100, `note ${n}`);
    }
  }
});

test('形式: どの WORLD も intro → rise → groove で始まり、長く聴けば全部の流れを巡る', () => {
  for (const world of IDS) {
    for (const seed of SEEDS.slice(0, 6)) {
      const order = [];
      const seen = new Set();
      for (const { state } of run(seed, 700, world).bars) {
        if (state.section.start === state.bar) order.push(state.section.type);
        seen.add(state.section.type);
        assert.ok(WORLDS[world].sections[state.section.type].bars.includes(state.section.end - state.section.start));
      }
      assert.deepEqual(order.slice(0, 3), ['intro', 'rise', 'groove'], world);
      assert.deepEqual([...seen].sort(), [...CONFIRMED.SECTION_TYPES].sort(), `${world} ${seed}`);
    }
  }
});

test('うねり: 毎小節ひとつ、-1..1 に収まり、小節ごとにはほとんど動かない（数分かけて寄せては返す）', () => {
  for (const { bars } of cases(8, 600)) {
    let prev = null;
    let lo = 1;
    let hi = -1;
    for (const { plan } of bars) {
      const sw = plan.controls.filter((c) => c.kind === 'swell');
      assert.equal(sw.length, 1);
      const v = sw[0].value;
      assert.ok(Number.isFinite(v) && v >= -1 && v <= 1, 'swell out of range: ' + v);
      if (prev !== null) assert.ok(Math.abs(v - prev) <= 0.08, 'swell jumped: ' + prev + ' → ' + v);
      prev = v;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    assert.ok(hi - lo > 0.3, 'swell hardly moves over 600 bars');
  }
});
