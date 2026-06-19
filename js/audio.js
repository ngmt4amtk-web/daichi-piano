/* audio.js — Web Audio 合成ピアノ + メトロノーム + ご褒美音 + iOS解錠
 * 依存なし。サンプル音源を同梱せず合成（完全無料・原盤権なし）。
 * エラーレス原則: 失敗音は一切用意しない。 */
(function (global) {
  'use strict';
  var DP = global.DP || (global.DP = {});

  var ctx = null, master = null;
  var softAttack = false;   // 感覚過敏向け: アタックを柔らかく
  var muted = false;

  function ensure() {
    if (ctx) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    return ctx;
  }

  // iOS Safari: ユーザー操作内で resume + 無音再生して解錠
  function unlock() {
    ensure();
    if (ctx.state === 'suspended') ctx.resume();
    var b = ctx.createBuffer(1, 1, 22050);
    var s = ctx.createBufferSource();
    s.buffer = b; s.connect(master); s.start(0);
  }

  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function now() { return ensure().currentTime; }

  // 1音を when(秒)に dur(秒) で鳴らす。velocity 0..1
  function note(midi, when, dur, velocity) {
    if (muted) return;
    ensure();
    when = when == null ? ctx.currentTime : when;
    dur = dur == null ? 0.5 : dur;
    velocity = velocity == null ? 0.8 : velocity;
    var f = midiToFreq(midi);

    var g = ctx.createGain();
    g.connect(master);
    var atk = softAttack ? 0.03 : 0.006;
    var peak = 0.18 * velocity;
    var rel = Math.min(dur, 1.6);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + atk);
    // ピアノらしい指数減衰
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.28), when + atk + rel * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, when + rel + 0.25);

    // 倍音3層（基音 triangle + 2倍音 sine + 軽い3倍音）
    var partials = [
      { type: 'triangle', mul: 1, gain: 1.0, detune: 0 },
      { type: 'sine', mul: 2, gain: 0.5, detune: 1 },
      { type: 'sine', mul: 3, gain: 0.18, detune: -1 }
    ];
    var oscs = [];
    for (var i = 0; i < partials.length; i++) {
      var p = partials[i];
      var o = ctx.createOscillator();
      o.type = p.type;
      o.frequency.value = f * p.mul;
      o.detune.value = p.detune;
      var pg = ctx.createGain();
      pg.gain.value = p.gain;
      o.connect(pg); pg.connect(g);
      o.start(when);
      o.stop(when + rel + 0.3);
      oscs.push(o);
    }
  }

  // メトロノーム/カウントイン
  function tick(when, accent) {
    if (muted) return;
    ensure();
    when = when == null ? ctx.currentTime : when;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.frequency.value = accent ? 1600 : 1100;
    o.connect(g); g.connect(master);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(accent ? 0.16 : 0.09, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
    o.start(when); o.stop(when + 0.08);
  }

  // ご褒美音（明るい上昇アルペジオ）。intensity: 'quiet'|'normal'|'lively'
  function reward(intensity) {
    if (muted) return;
    ensure();
    var t0 = ctx.currentTime + 0.01;
    var seq, vol;
    if (intensity === 'quiet') { seq = [72, 76]; vol = 0.5; }
    else if (intensity === 'lively') { seq = [72, 76, 79, 84, 88]; vol = 1.0; }
    else { seq = [72, 76, 79, 84]; vol = 0.75; }
    for (var i = 0; i < seq.length; i++) note(seq[i], t0 + i * 0.085, 0.5, vol);
  }

  // 正解の小さな「ピロン」（自動送り用・控えめ）
  function correctBlip() {
    if (muted) return;
    note(84, now() + 0.005, 0.18, 0.5);
    note(91, now() + 0.06, 0.2, 0.45);
  }

  DP.audio = {
    ensure: ensure, unlock: unlock, now: now,
    note: note, tick: tick, reward: reward, correctBlip: correctBlip,
    setSoftAttack: function (v) { softAttack = !!v; },
    setMuted: function (v) { muted = !!v; },
    get context() { return ensure(); }
  };
})(window);
