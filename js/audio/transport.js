/*
 * Undertow — Transport（音楽時間 → 秒）と、セッションの組み立て
 *
 * Transport は Director に次の小節を頼み、その小節を秒に置いて Renderer に渡すだけ。
 * 音楽のことは決めない。先読みの幅は呼び出し側（app.js / テスト）が決める。
 */
(function (U) {
  'use strict';
  const STEPS = U.content.CONFIRMED.STEPS_PER_BAR;

  class Transport {
    constructor({ director, voices }) {
      this.director = director;
      this.voices = voices;
      this.stepDur = 60 / director.identity.bpm / 4; // 16分音符
      this.barDur = this.stepDur * STEPS;
      this.t0 = 0;
      this.nextBarTime = 0;
      this.running = false;
      this.timeline = []; // 直近の小節の [開始時刻, 小節, セクション] — 画面表示用
    }

    start(t0) {
      this.t0 = t0;
      this.nextBarTime = t0;
      this.running = true;
      this.voices.start(t0);
    }

    // until より前に始まる小節を、まとめて予約する
    pump(until, now) {
      if (!this.running) return;
      while (this.nextBarTime < until) {
        const barTime = this.nextBarTime;
        const plan = this.director.nextBar();
        this.voices.render(plan, barTime, now);
        this.timeline.push({ t: barTime, bar: plan.bar, section: plan.section, chord: plan.chord });
        if (this.timeline.length > 8) this.timeline.shift();
        this.nextBarTime = this.t0 + (plan.bar + 1) * this.barDur;
      }
    }

    at(time) {
      let current = null;
      for (const e of this.timeline) if (e.t <= time) current = e;
      return current;
    }
  }

  // Composition Root: 依存はここで組み立てて渡す（中で勝手に new しない）
  // world を省くと、seed から WORLD が決まる
  function createSession(ctx, { seed, world }) {
    const director = new U.core.Director({ seed, world });
    const voices = new U.Voices(ctx, director.identity);
    const transport = new Transport({ director, voices });
    return {
      identity: director.identity,
      connect: (dest) => voices.connect(dest),
      start: (t0) => transport.start(t0),
      pump: (until, now) => transport.pump(until, now),
      stop: (t, fade) => voices.stop(t, fade),
      dispose: () => {
        transport.running = false;
        voices.dispose();
      },
      at: (time) => transport.at(time),
    };
  }

  U.Transport = Transport;
  U.createSession = createSession;
})((globalThis.Undertow = globalThis.Undertow || {}));
