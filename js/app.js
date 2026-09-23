/*
 * Undertow — 画面（再生・停止・チェンジ・音量）と、海の描画
 *
 * 状態は idle / playing / error の三つ。失敗も状態として画面に出す
 * （黙って別の方法に切り替えない・勝手に再試行し続けない）。
 */
(function (U) {
  'use strict';

  const LOOKAHEAD = 0.25; // 表示中の先読み（秒）
  const LOOKAHEAD_HIDDEN = 1.5; // 裏のタブでタイマーが間引かれても途切れない幅
  const FADE_OUT = 1.4;
  // 長く聴いたとき: 1 曲を 15〜25 分聴いたら、次のブレイク（静かな区間）で次の曲へつなぐ。来なければ 10 分後に移る
  const NEXT_AFTER = [15 * 60, 25 * 60];
  const NEXT_GRACE = 10 * 60;
  const VOLUME_KEY = 'undertow.volume';
  const SECTION_NAMES = { intro: 'still', rise: 'swell', groove: 'current', deep: 'deep', breakdown: 'slack' };
  const IDLE_TEXT = '再生するたびに、ちがう潮が満ちてきます。';

  const root = document.documentElement;
  const toggle = document.getElementById('toggle');
  const change = document.getElementById('change');
  const volume = document.getElementById('volume');
  const volumeValue = document.getElementById('volume-value');
  const readout = document.getElementById('readout');
  const elapsed = document.getElementById('elapsed');
  const status = document.getElementById('status');
  const canvas = document.getElementById('sea');
  const lowest = document.getElementById('worlds'); // 水平線は曲調ボタンの下に引く（波にかからないように）

  let ctx = null;
  let input = null;
  let master = null;
  let analyser = null;
  let session = null;
  const fading = new Set();
  let worker = null;
  let interval = 0;
  let shown = '';
  let lastChange = -Infinity;
  let picked = null; // 画面で選んだ曲調（null = auto）
  let lastWorld = null; // auto で同じ曲調が 2 回続かないように

  // ---------------------------------------------------------------------------
  // 音量
  // ---------------------------------------------------------------------------
  function storedVolume() {
    try {
      const raw = localStorage.getItem(VOLUME_KEY);
      const v = raw === null ? NaN : Number(raw);
      if (Number.isFinite(v) && v >= 0 && v <= 100) return v;
    } catch (e) {
      /* 保存できない環境でも既定値で動く */
    }
    return 70;
  }

  function showVolume() {
    const v = Number(volume.value);
    volumeValue.textContent = String(v);
    volume.setAttribute('aria-valuetext', v + '%');
    volume.style.setProperty('--fill', v + '%');
  }

  function applyVolume(smooth) {
    if (!master) return;
    const g = Math.pow(Number(volume.value) / 100, 2); // 耳の感じ方に近い二乗カーブ
    if (smooth) master.gain.setTargetAtTime(g, ctx.currentTime, 0.04);
    else master.gain.value = g;
  }

  volume.value = String(storedVolume());
  showVolume();
  volume.addEventListener('input', () => {
    showVolume();
    applyVolume(true);
    try {
      localStorage.setItem(VOLUME_KEY, volume.value);
    } catch (e) {
      /* 同上 */
    }
  });

  // ---------------------------------------------------------------------------
  // 時計: Worker のタイマー（裏のタブでも間引かれにくい）と setInterval を併走させる。
  // pump は何度呼んでも同じ結果なので、二重に呼ばれても害はない
  // ---------------------------------------------------------------------------
  function tick() {
    if (!ctx) return;
    const now = ctx.currentTime;
    const until = now + (document.hidden ? LOOKAHEAD_HIDDEN : LOOKAHEAD);
    if (session) session.pump(until, now);
    for (const s of fading) s.pump(until, now);
    if (session) {
      updateReadout();
      autoNext(now);
    }
  }

  function startClock() {
    if (!interval) interval = setInterval(tick, 50);
    if (worker === null) {
      try {
        const src = 'var id=0;onmessage=function(e){clearInterval(id);if(e.data)id=setInterval(function(){postMessage(0)},25)}';
        worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
        worker.onmessage = tick;
      } catch (e) {
        worker = false; // Worker が使えない環境。setInterval と先読みだけで回る
      }
    }
    if (worker) worker.postMessage(1);
  }

  function stopClock() {
    clearInterval(interval);
    interval = 0;
    if (worker) worker.postMessage(0);
  }

  // ---------------------------------------------------------------------------
  // 再生・停止
  // ---------------------------------------------------------------------------
  function ensureAudio() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('no-webaudio');
    try {
      ctx = new AC({ latencyHint: 'balanced' });
    } catch (e) {
      ctx = new AC();
    }
    input = ctx.createGain();
    master = ctx.createGain();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    input.connect(master);
    master.connect(ctx.destination);
    input.connect(analyser); // 描画は音量に左右されない
    applyVolume(false);
  }

  // URL の末尾で曲や曲調を固定できる（試聴・調整用）
  //   #9E3779B1        その seed の曲（曲調も seed で決まる）
  //   #drift           曲調だけ固定（曲は毎回ちがう）
  //   #drift-9E3779B1  曲調と seed の両方を固定
  function fromHash() {
    const text = location.hash.replace(/^#/, '');
    const seed = U.rng.parseSeed(text);
    if (seed !== null) return { seed, world: null };
    const m = /^([a-z]+)(?:-([0-9a-f]{8}))?$/i.exec(text);
    const world = m && U.worlds.WORLDS[m[1].toLowerCase()] ? m[1].toLowerCase() : null;
    return { world, seed: world && m[2] ? parseInt(m[2], 16) >>> 0 : null };
  }

  function waitRunning(ms) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      (function check() {
        if (ctx.state === 'running') resolve(true);
        else if (performance.now() - t0 > ms) resolve(false);
        else setTimeout(check, 100);
      })();
    });
  }

  function play(lead = '再生中。') {
    try {
      ensureAudio();
    } catch (e) {
      fail(
        e.message === 'no-webaudio'
          ? 'このブラウザは Web Audio に対応していないため、再生できません。'
          : '音声の準備に失敗しました。ページを再読み込みしてください。'
      );
      return;
    }
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback'; // iOS のマナーモードでも鳴らす
    } catch (e) {
      /* 非対応 */
    }
    const resumed = ctx.resume();
    const pinned = fromHash();
    const world = picked || pinned.world || undefined;
    let seed = pinned.seed;
    if (seed === null) {
      // auto では、直前と違う曲調になる seed を引き直す（曲調は seed から決まる）
      do seed = U.rng.randomSeed();
      while (!world && lastWorld && U.core.worldOf(seed) === lastWorld);
    }
    const s = U.createSession(ctx, { seed, world });
    lastWorld = s.identity.world;
    s.connect(input);
    s.start(ctx.currentTime + 0.1);
    session = s;
    s.startedAt = ctx.currentTime;
    s.nextAt = s.startedAt + NEXT_AFTER[0] + Math.random() * (NEXT_AFTER[1] - NEXT_AFTER[0]);
    setWorldLook(s.identity.world);
    startClock();
    tick();
    setState('playing');
    announce(lead + s.identity.worldLabel + '、' + s.identity.keyName + '、' + s.identity.bpm + ' BPM');
    Promise.resolve(resumed)
      .then(() => waitRunning(2000))
      .catch(() => false)
      .then((ok) => {
        if (ok || session !== s) return;
        session = null;
        discard(s);
        fail('音声を開始できませんでした。もう一度押してください。');
      });
  }

  // 鳴っている潮をフェードで引かせる。フェードの間も音楽は進み続ける
  function fadeOut(s) {
    s.stop(ctx.currentTime, FADE_OUT);
    fading.add(s);
    setTimeout(() => {
      discard(s);
      if (!session && !fading.size) {
        stopClock();
        ctx.suspend().catch(() => {});
      }
    }, (FADE_OUT + 0.25) * 1000);
  }

  function stop() {
    const s = session;
    if (!s) return;
    session = null;
    fadeOut(s);
    setState('idle');
    announce('停止しました');
  }

  // 1 曲を十分聴いたら、ブレイクの間に次の曲へ（中身はチェンジと同じ）
  function autoNext(now) {
    if (now < session.nextAt) return;
    const cur = session.at(now);
    if ((cur && cur.section === 'breakdown') || now > session.nextAt + NEXT_GRACE) changeTide('次の潮。');
  }

  // チェンジ = 停止 → 再生。古い潮が引いていく間に、新しい潮が intro から満ちてくる
  function changeTide(lead = '新しい潮。') {
    const t = performance.now();
    if (t - lastChange < 700) return; // 二度押しで二つ先まで飛ばない
    lastChange = t;
    if (!session) {
      play();
      return;
    }
    const old = session;
    session = null;
    fadeOut(old);
    play(typeof lead === 'string' ? lead : '新しい潮。');
  }

  function discard(s) {
    fading.delete(s);
    try {
      s.dispose();
    } catch (e) {
      /* すでに片付いている */
    }
  }

  function fail(message) {
    setState('error', message);
    announce(message);
  }

  // ---------------------------------------------------------------------------
  // 表示
  // ---------------------------------------------------------------------------
  function write(text) {
    if (text === shown) return;
    readout.textContent = text;
    shown = text;
  }

  function announce(text) {
    status.textContent = text;
  }

  // いまの曲の経過時間（チェンジや自動の曲替えで 0:00 に戻る）
  function writeElapsed(sec) {
    const t = Math.max(0, Math.floor(sec));
    const text = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    if (elapsed.textContent !== text) elapsed.textContent = text;
  }

  function updateReadout() {
    writeElapsed(ctx.currentTime - session.startedAt);
    const id = session.identity;
    const now = session.at(ctx.currentTime);
    const parts = [id.worldLabel, id.seedText, id.keyName, id.bpm + ' BPM'];
    if (now) parts.push(SECTION_NAMES[now.section] || now.section);
    write(parts.join('  ·  '));
  }

  // いま鳴っている曲調のボタンに印をつける（auto のときも、どの曲調が鳴っているかわかるように）
  function markNow(world) {
    for (const b of document.querySelectorAll('#worlds button')) {
      if (b.dataset.world === world) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    }
  }

  function setState(next, message) {
    root.dataset.state = next;
    const playing = next === 'playing';
    markNow(playing && session ? session.identity.world : null);
    toggle.setAttribute('aria-label', playing ? '停止' : '再生');
    toggle.title = playing ? '停止（Space）' : '再生（Space）';
    if (next === 'error') write(message);
    else if (playing) updateReadout();
    else write(IDLE_TEXT);
    if (!playing) writeElapsed(0);
  }

  toggle.addEventListener('click', () => (session ? stop() : play()));
  change.addEventListener('click', changeTide);

  // 曲調の切り替え: おまかせ（ランダム）か、tide / drift / echo に固定。鳴っている間に選ぶと、その曲調へチェンジする
  const worldsBox = document.getElementById('worlds');
  const shuffle = document.getElementById('shuffle');
  function pick(id, button) {
    picked = id || null;
    shuffle.setAttribute('aria-pressed', String(!picked));
    for (const x of worldsBox.children) x.setAttribute('aria-pressed', String(x === button));
    // 鳴っていればその曲調へチェンジ、止まっていればその曲調で再生を始める
    lastChange = -Infinity;
    changeTide();
  }
  shuffle.addEventListener('click', () => pick(null, null));
  for (const id of U.worlds.IDS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.world = id;
    b.textContent = U.worlds.WORLDS[id].label;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => pick(id, b));
    worldsBox.appendChild(b);
  }

  // about: 説明を開く。閉じるボタン、Esc、外側のクリックで閉じる
  const about = document.getElementById('about');
  document.getElementById('about-open').addEventListener('click', () => about.showModal());
  document.getElementById('about-close').addEventListener('click', () => about.close());
  about.addEventListener('click', (e) => {
    if (e.target === about) about.close();
  });

  // 説明の言語: 日本語 ⇄ 英語。選んだ方を覚えておく
  const LANG_KEY = 'undertow.aboutLang';
  const langButton = document.getElementById('about-lang');
  function showLang(lang) {
    for (const el of about.querySelectorAll('.about-text')) el.hidden = el.dataset.lang !== lang;
    langButton.textContent = lang === 'en' ? '日本語' : 'eng';
    langButton.lang = lang === 'en' ? 'ja' : 'en';
    about.setAttribute('aria-label', lang === 'en' ? 'About Undertow' : 'Undertow について');
  }
  let aboutLang = 'ja';
  try {
    if (localStorage.getItem(LANG_KEY) === 'en') aboutLang = 'en';
  } catch (e) {
    /* 保存できない環境 */
  }
  showLang(aboutLang);
  langButton.addEventListener('click', () => {
    aboutLang = aboutLang === 'en' ? 'ja' : 'en';
    showLang(aboutLang);
    about.scrollTop = 0;
    try {
      localStorage.setItem(LANG_KEY, aboutLang);
    } catch (e) {
      /* 保存できない環境 */
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    if (about.open) return; // 説明を読んでいる間は、Space でスクロールする
    const el = e.target;
    if (el instanceof HTMLButtonElement || el instanceof HTMLTextAreaElement || el.isContentEditable) return;
    if (el instanceof HTMLInputElement && el.type !== 'range') return;
    e.preventDefault();
    if (session) stop();
    else play();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !ctx) return;
    tick();
    if (session && ctx.state !== 'running') ctx.resume().catch(() => {});
  });

  // ---------------------------------------------------------------------------
  // 海: 水平線から手前へ。遠いほど細かく静かに、近いほど大きくうねる。音の強さで少し波立つ
  // ---------------------------------------------------------------------------
  const g2 = canvas.getContext('2d');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const td = new Float32Array(1024);
  // 線と光の色は曲調ごとに CSS（--line-rgb / --glow-rgb）で決まる。切り替わったら数秒かけて近づける
  const rgbOf = (name, fallback) => (getComputedStyle(root).getPropertyValue(name).trim() || fallback).split(',').map(Number);
  let lineTo = rgbOf('--line-rgb', '196, 216, 228');
  let glowTo = rgbOf('--glow-rgb', '104, 150, 196');
  let lineNow = lineTo.slice();
  let glowNow = glowTo.slice();
  const rgb = (c) => c.map(Math.round).join(', ');

  function setWorldLook(world) {
    root.dataset.world = world;
    lineTo = rgbOf('--line-rgb', '196, 216, 228');
    glowTo = rgbOf('--glow-rgb', '104, 150, 196');
    if (motion.matches) {
      lineNow = lineTo.slice();
      glowNow = glowTo.slice();
      draw(0);
    }
  }
  let W = 0;
  let H = 0;
  let dpr = 1;
  let horizon = 0;
  let energy = 0;
  let raf = 0;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    horizon = Math.min(H - 48, Math.max(lowest.getBoundingClientRect().bottom + 28, H * 0.55));
    if (motion.matches) draw(0);
  }

  function level() {
    if (!analyser || (!session && !fading.size)) return 0;
    analyser.getFloatTimeDomainData(td);
    let sum = 0;
    for (let i = 0; i < td.length; i++) sum += td[i] * td[i];
    return Math.min(1, Math.sqrt(sum / td.length) * 4.5);
  }

  function draw(ms) {
    const t = ms / 1000;
    g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    g2.clearRect(0, 0, W, H);

    const glow = g2.createRadialGradient(W / 2, horizon, 0, W / 2, horizon, Math.max(W, H) * 0.55);
    glow.addColorStop(0, 'rgba(' + rgb(glowNow) + ', ' + (0.09 + energy * 0.07) + ')');
    glow.addColorStop(1, 'rgba(' + rgb(glowNow) + ', 0)');
    g2.fillStyle = glow;
    g2.fillRect(0, 0, W, H);

    const lines = 18;
    const depth = H - horizon;
    g2.lineWidth = 1;
    for (let i = 0; i < lines; i++) {
      const z = i / (lines - 1);
      const y0 = horizon + depth * Math.pow(z, 1.7) * 0.97;
      const amp = (0.6 + 15 * Math.pow(z, 1.4)) * (0.45 + 0.9 * energy);
      const k = 0.011 - 0.0075 * z;
      const speed = 0.16 + 0.22 * z;
      g2.beginPath();
      for (let x = -8; x <= W + 8; x += 6) {
        const y =
          y0 +
          amp *
            (0.62 * Math.sin(x * k + t * speed + i * 1.3) +
              0.28 * Math.sin(x * k * 2.1 - t * speed * 1.3 + i * 0.7) +
              0.1 * Math.sin(x * k * 4.3 + t * 0.9));
        if (x === -8) g2.moveTo(x, y);
        else g2.lineTo(x, y);
      }
      g2.strokeStyle = 'rgba(' + rgb(lineNow) + ', ' + (0.46 - 0.34 * z) * (0.8 + 0.2 * energy) + ')';
      g2.stroke();
    }
  }

  function frame(ms) {
    const target = level();
    energy += (target - energy) * (target > energy ? 0.3 : 0.05);
    for (let i = 0; i < 3; i++) {
      lineNow[i] += (lineTo[i] - lineNow[i]) * 0.02;
      glowNow[i] += (glowTo[i] - glowNow[i]) * 0.02;
    }
    toggle.style.setProperty('--pulse', energy.toFixed(3));
    draw(ms);
    raf = requestAnimationFrame(frame);
  }

  function setMotion() {
    cancelAnimationFrame(raf);
    if (motion.matches) {
      energy = 0;
      toggle.style.setProperty('--pulse', '0');
      draw(0);
    } else {
      raf = requestAnimationFrame(frame);
    }
  }

  window.addEventListener('resize', resize);
  if (document.fonts) document.fonts.ready.then(resize); // 文字の幅が決まると、ボタンの折り返しが変わる
  window.addEventListener('load', resize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);
  if (motion.addEventListener) motion.addEventListener('change', setMotion);

  setState('idle');
  resize();
  setMotion();
})(globalThis.Undertow);
