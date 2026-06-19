/* app.js — メインコントローラ
 * 再生(おてほん/いっしょ/まつ) + 手ごと足場 + 一小節 + 児童プロファイル + 先生ゾーン
 * + エラーレス報酬 + 曲取り込み。依存: theory/songs/audio/pitch/render/keyboard */
(function (global) {
  'use strict';
  var DP = global.DP || (global.DP = {});
  var $ = function (id) { return document.getElementById(id); };

  // ---- 児童プロファイル（深掘り軍団の所見を既定値に） ----
  var PROFILES = {
    wakana: { label: 'わかな', practiceHand: 'both', view: 'measure',
      layers: { RH: { name: 0.6, color: 1, finger: 0 }, LH: { name: 1, color: 1, finger: 0.6 } },
      falling: false, playMode: 'wait', tempo: 80, reward: 'lively', kana: true },
    mikoto: { label: 'みこと', practiceHand: 'both', view: 'full',
      layers: { RH: { name: 0, color: 0.5, finger: 0 }, LH: { name: 0, color: 0.7, finger: 0 } },
      falling: false, playMode: 'guide', tempo: 96, reward: 'normal', kana: true },
    taichi: { label: 'たいち', practiceHand: 'RH', view: 'measure',
      layers: { RH: { name: 1, color: 1, finger: 1 }, LH: { name: 1, color: 1, finger: 1 } },
      falling: true, playMode: 'wait', tempo: 70, reward: 'normal', kana: true },
    kaho: { label: 'かほ', practiceHand: 'both', view: 'measure',
      layers: { RH: { name: 0, color: 1, finger: 0 }, LH: { name: 0, color: 1, finger: 0 } },
      falling: true, playMode: 'wait', tempo: 84, reward: 'lively', kana: true }
  };

  var state = {
    songIndex: 0, song: null,
    hands: { RH: true, LH: true },     // 表示
    practiceHand: 'both',              // 練習する手（エンジン対象）
    view: 'full', measureIndex: 1, loopMeasure: false,
    layers: { RH: { name: 1, color: 1, finger: 0 }, LH: { name: 1, color: 1, finger: 0 } },
    falling: false,
    playMode: 'wait',                  // demo | guide | wait
    micOn: false,
    tempo: 88, kana: true,
    reward: { score: 0, stars: 0, unlockTarget: 5, intensity: 'normal', soundOn: true, celebrateOn: true },
    profileName: null
  };

  var idx = null, kb = null;
  var transport = { playing: false, raf: 0 };
  var waitCtx = null;
  var customSongs = [];

  // ====== ライブラリ ======
  function allSongs() { return DP.songs.library.concat(customSongs); }
  function loadCustom() {
    try { var s = JSON.parse(localStorage.getItem('dp_custom') || '[]'); customSongs = s.map(function (t) { var p = DP.songs.parse(t); p.custom = true; p.source = t; return p; }); } catch (e) { customSongs = []; }
  }
  function saveCustom() {
    try { localStorage.setItem('dp_custom', JSON.stringify(customSongs.map(function (s) { return s.source; }))); } catch (e) {}
  }

  // ====== 描画 ======
  function computeRange(song) {
    var min = 200, max = 0;
    function scan(ev) { for (var i = 0; i < ev.length; i++) for (var c = 0; c < ev[i].midis.length; c++) { min = Math.min(min, ev[i].midis[c]); max = Math.max(max, ev[i].midis[c]); } }
    scan(song.RH); scan(song.LH);
    if (max === 0) { min = 48; max = 72; }
    var lo = min - 2, hi = max + 2;
    while (((lo % 12) + 12) % 12 !== 0) lo--;       // 下端をCに
    while (((hi % 12) + 12) % 12 !== 0) hi++;       // 上端をCに
    if (hi - lo < 24) hi = lo + 24;
    return { lo: lo, hi: hi };
  }

  function renderScore() {
    idx = DP.render.draw($('score'), state.song, {
      hands: state.hands, layers: state.layers, kana: state.kana,
      mode: state.view, measureIndex: state.measureIndex
    });
  }
  function buildKeyboard() {
    var host = $('keyboard');
    var r = computeRange(state.song);
    kb = DP.keyboard.create(host, {
      lo: r.lo, hi: r.hi, showNames: true, kbHeight: 130,
      onPlay: function (midi) { if (state.playMode === 'wait') tryAdvanceByPitch(midi); }
    });
    kb.setFallingHeight(state.falling ? 150 : 0);
  }

  function renderAll() {
    state.song = allSongs()[state.songIndex];
    $('songTitle').textContent = state.song.title;
    $('copyright').textContent = state.song.copyright || '';
    renderScore();
    buildKeyboard();
    updateUI();
    primeWaitOrGuide();
  }

  function updateUI() {
    // 手
    setActive('handRH', state.practiceHand === 'RH');
    setActive('handLH', state.practiceHand === 'LH');
    setActive('handBoth', state.practiceHand === 'both');
    // ビュー
    setActive('viewFull', state.view === 'full');
    setActive('viewMeasure', state.view === 'measure');
    $('measureNav').style.display = state.view === 'measure' ? 'flex' : 'none';
    $('measureLabel').textContent = state.measureIndex + ' / ' + state.song.measureCount;
    // playMode
    setActive('pmDemo', state.playMode === 'demo');
    setActive('pmGuide', state.playMode === 'guide');
    setActive('pmWait', state.playMode === 'wait');
    // layers
    chk('rhName', state.layers.RH.name); chk('rhColor', state.layers.RH.color); chk('rhFinger', state.layers.RH.finger);
    chk('lhName', state.layers.LH.name); chk('lhColor', state.layers.LH.color); chk('lhFinger', state.layers.LH.finger);
    chk('visRH', state.hands.RH); chk('visLH', state.hands.LH);
    chk('falling', state.falling); chk('micOn', state.micOn); chk('kana', state.kana);
    chk('soundOn', state.reward.soundOn); chk('celebrateOn', state.reward.celebrateOn);
    setActive('rwQuiet', state.reward.intensity === 'quiet');
    setActive('rwNormal', state.reward.intensity === 'normal');
    setActive('rwLively', state.reward.intensity === 'lively');
    if ($('tempo')) { $('tempo').value = state.tempo; $('tempoVal').textContent = state.tempo; }
    $('starCount').textContent = '⭐ ' + state.reward.stars;
    // プロファイル名
    for (var p in PROFILES) setActive('prof_' + p, state.profileName === p);
  }
  function setActive(id, on) { var e = $(id); if (e) e.classList.toggle('active', !!on); }
  function chk(id, v) { var e = $(id); if (e) e.checked = (v > 0); }

  // ====== 再生エンジン ======
  function beatDur() { return 60 / state.tempo; }
  function scope() {
    if (state.view === 'measure' || state.loopMeasure) {
      var bpm = state.song.beatsPerMeasure;
      return { start: (state.measureIndex - 1) * bpm, end: state.measureIndex * bpm };
    }
    return { start: 0, end: state.song.totalBeats };
  }
  function soundingHands() {
    if (state.playMode === 'demo') return ['RH', 'LH'];
    if (state.playMode === 'guide') {
      // 練習しない手を伴奏で鳴らす
      if (state.practiceHand === 'RH') return ['LH'];
      if (state.practiceHand === 'LH') return ['RH'];
      return []; // both練習→メトロノームのみ
    }
    return [];
  }

  function clearHL() { if (idx) DP.render.highlight(idx, function () { return false; }); if (kb) kb.allOff(); }

  function stop() {
    transport.playing = false;
    if (transport.raf) cancelAnimationFrame(transport.raf);
    if (kb) kb.clearFalling();
    $('btnPlay').classList.remove('playing');
  }

  function play() {
    if (state.playMode === 'wait') { startWait(); return; }
    startTransport();
  }

  function startTransport() {
    DP.audio.unlock();
    stop();
    transport.playing = true;
    $('btnPlay').classList.add('playing');
    var sc = scope();
    var bd = beatDur();
    var bpm = state.song.beatsPerMeasure;
    var countIn = bpm;
    var t0 = DP.audio.now() + 0.12;
    // カウントイン
    for (var i = 0; i < countIn; i++) DP.audio.tick(t0 + i * bd, i === 0);
    var startTime = t0 + countIn * bd;
    var snd = soundingHands();
    var fired = {}; // key hand+i

    function loop() {
      if (!transport.playing) return;
      var now = DP.audio.now();
      var beat = sc.start + (now - startTime) * state.tempo / 60;
      if (now < startTime) beat = sc.start; // カウントイン中
      // ループ末尾
      if (beat >= sc.end) {
        if (state.loopMeasure || (state.view === 'measure' && repeatOn())) {
          startTime = now; fired = {}; beat = sc.start;
        } else { onComplete(); stop(); return; }
      }
      // ハイライト
      DP.render.highlight(idx, function (ref) {
        return ref.startBeat <= beat + 0.02 && beat < ref.startBeat + ref.dur;
      });
      // 発音
      for (var h = 0; h < snd.length; h++) {
        var hand = snd[h]; var ev = state.song[hand];
        for (var n = 0; n < ev.length; n++) {
          var e = ev[n]; if (!e.midis.length) continue;
          if (e.startBeat < sc.start - 1e-6 || e.startBeat >= sc.end) continue;
          var key = hand + n;
          if (!fired[key] && beat >= e.startBeat - 0.02) {
            fired[key] = 1;
            for (var c = 0; c < e.midis.length; c++) DP.audio.note(e.midis[c], now + 0.001, e.dur * bd, 0.8);
          }
        }
      }
      // 落下ノーツ
      if (state.falling) {
        var merged = mergedEvents();
        kb.renderFalling(merged, beat, 4);
      } else {
        // ガイド: 今鳴る音の鍵盤を光らせる
        lightCurrent(beat);
      }
      transport.raf = requestAnimationFrame(loop);
    }
    transport.raf = requestAnimationFrame(loop);
  }
  function repeatOn() { return $('loopMeasure') && $('loopMeasure').checked; }

  function lightCurrent(beat) {
    if (!kb) return;
    kb.allOff();
    var hs = practicingHands();
    for (var i = 0; i < hs.length; i++) {
      var ev = state.song[hs[i]];
      for (var n = 0; n < ev.length; n++) {
        var e = ev[n];
        if (e.midis.length && e.startBeat <= beat + 0.02 && beat < e.startBeat + e.dur) kb.lightNotes(e.midis);
      }
    }
  }

  function practicingHands() { return state.practiceHand === 'both' ? ['RH', 'LH'] : [state.practiceHand]; }

  function mergedEvents() {
    var out = [];
    var hs = state.falling ? practicingHands() : ['RH', 'LH'];
    for (var i = 0; i < hs.length; i++) {
      var ev = state.song[hs[i]];
      for (var n = 0; n < ev.length; n++) if (ev[n].midis.length) out.push(ev[n]);
    }
    return out;
  }

  // ====== まつモード（正しい音を弾くまで待つ＝初見の核） ======
  function buildSteps() {
    var hs = practicingHands();
    var sc = scope();
    var map = {};
    for (var i = 0; i < hs.length; i++) {
      var ev = state.song[hs[i]];
      for (var n = 0; n < ev.length; n++) {
        var e = ev[n]; if (!e.midis.length) continue;
        if (e.startBeat < sc.start - 1e-6 || e.startBeat >= sc.end) continue;
        var kbk = e.startBeat.toFixed(3);
        if (!map[kbk]) map[kbk] = { beat: e.startBeat, midis: [] };
        map[kbk].midis = map[kbk].midis.concat(e.midis);
      }
    }
    var steps = Object.keys(map).map(function (k) { return map[k]; });
    steps.sort(function (a, b) { return a.beat - b.beat; });
    return steps;
  }

  function startWait() {
    DP.audio.unlock();
    stop();
    waitCtx = { steps: buildSteps(), i: 0 };
    transport.playing = true;
    $('btnPlay').classList.add('playing');
    if (state.micOn) DP.pitch.start(onMicPitch);
    showStep();
  }
  function primeWaitOrGuide() {
    // 停止状態でも最初の音を提示しておく
    if (state.playMode === 'wait') { waitCtx = { steps: buildSteps(), i: 0 }; if (!transport.playing) showStep(true); }
    else { clearHL(); }
  }
  function showStep(staticOnly) {
    if (!waitCtx) return;
    var st = waitCtx.steps[waitCtx.i];
    if (!st) { if (!staticOnly) onComplete(); stop(); return; }
    // ハイライト＋鍵盤光
    DP.render.highlight(idx, function (ref) { return Math.abs(ref.startBeat - st.beat) < 1e-3 && practicingHands().indexOf(ref.hand) >= 0; });
    if (kb) { kb.allOff(); kb.lightNotes(st.midis); }
    // 一小節ビューなら自動で該当小節へ
    if (state.view === 'measure') {
      var bpm = state.song.beatsPerMeasure;
      var mi = Math.floor(st.beat / bpm) + 1;
      if (mi !== state.measureIndex) { state.measureIndex = mi; renderScore(); DP.render.highlight(idx, function (ref) { return Math.abs(ref.startBeat - st.beat) < 1e-3 && practicingHands().indexOf(ref.hand) >= 0; }); $('measureLabel').textContent = state.measureIndex + ' / ' + state.song.measureCount; }
    }
  }
  function expectedPCs() {
    var st = waitCtx && waitCtx.steps[waitCtx.i]; if (!st) return [];
    return st.midis.map(function (m) { return ((m % 12) + 12) % 12; });
  }
  function tryAdvanceByPitch(midi) {
    if (state.playMode !== 'wait' || !waitCtx) return;
    var pc = ((midi % 12) + 12) % 12;
    if (expectedPCs().indexOf(pc) >= 0) advanceStep();
  }
  var lastPitchMidi = null, pitchHold = 0;
  function onMicPitch(midi) {
    if (midi == null) { lastPitchMidi = null; pitchHold = 0; return; }
    if (midi === lastPitchMidi) { pitchHold++; } else { lastPitchMidi = midi; pitchHold = 1; }
    if (pitchHold === 2) tryAdvanceByPitch(midi); // 連打ズル防止: 2フレーム安定で1回
  }
  function advanceStep() {
    if (!waitCtx) return;
    var st = waitCtx.steps[waitCtx.i];
    if (st) for (var c = 0; c < st.midis.length; c++) DP.audio.note(st.midis[c], DP.audio.now() + 0.001, 0.5, 0.7);
    if (state.reward.soundOn) DP.audio.correctBlip();
    waitCtx.i++;
    if (waitCtx.i >= waitCtx.steps.length) {
      if (state.loopMeasure || (state.view === 'measure' && repeatOn())) { waitCtx.i = 0; setTimeout(showStep, 300); }
      else { onComplete(); stop(); }
      return;
    }
    setTimeout(showStep, 120);
  }
  function nextStepManual() { if (state.playMode === 'wait') { if (!waitCtx) startWait(); else advanceStep(); } }

  // ====== 完了・報酬（エラーレス: 失敗音なし） ======
  function onComplete() {
    state.reward.score++;
    state.reward.stars++;
    saveProgress();
    if (state.reward.soundOn) DP.audio.reward(state.reward.intensity);
    if (state.reward.celebrateOn) celebrate();
    $('starCount').textContent = '⭐ ' + state.reward.stars;
    clearHL();
  }
  function celebrate() {
    var o = $('reward');
    o.classList.add('show');
    var unlocked = state.reward.stars > 0 && (state.reward.stars % state.reward.unlockTarget === 0);
    o.querySelector('.reward-text').textContent = unlocked ? 'やったね！ごほうび！' : 'できた！';
    o.querySelector('.reward-sub').textContent = unlocked ? '⭐'.repeat(Math.min(5, state.reward.unlockTarget)) : '';
    setTimeout(function () { o.classList.remove('show'); }, state.reward.intensity === 'quiet' ? 900 : 1700);
  }
  function saveProgress() { try { localStorage.setItem('dp_stars', String(state.reward.stars)); } catch (e) {} }
  function loadProgress() { try { state.reward.stars = parseInt(localStorage.getItem('dp_stars') || '0', 10); } catch (e) { state.reward.stars = 0; } }

  // ====== プロファイル ======
  function applyProfile(name) {
    var p = PROFILES[name]; if (!p) return;
    state.profileName = name;
    state.practiceHand = p.practiceHand;
    state.view = p.view; state.measureIndex = 1;
    state.layers = JSON.parse(JSON.stringify(p.layers));
    state.falling = p.falling; state.playMode = p.playMode;
    state.tempo = p.tempo; state.reward.intensity = p.reward; state.kana = p.kana;
    stop();
    renderScore(); kb && kb.setFallingHeight(state.falling ? 150 : 0);
    updateUI(); primeWaitOrGuide();
  }

  // ====== 取り込み ======
  function importSong() {
    var text = $('importText').value.trim();
    if (!text) return;
    try {
      var p = DP.songs.parse(text); p.custom = true; p.source = text;
      if (!p.RH.length && !p.LH.length) { alert('音符が読み取れませんでした。RH:/LH: の行を確認してね'); return; }
      customSongs.push(p); saveCustom();
      rebuildSongList();
      state.songIndex = allSongs().length - 1;
      $('importText').value = '';
      $('panel').classList.remove('open');
      renderAll();
    } catch (e) { alert('取り込みに失敗: ' + e.message); }
  }

  function rebuildSongList() {
    var sel = $('songList'); sel.innerHTML = '';
    var arr = allSongs();
    for (var i = 0; i < arr.length; i++) {
      var o = document.createElement('option');
      o.value = i; o.textContent = arr[i].title + (arr[i].custom ? '（取り込み）' : '');
      sel.appendChild(o);
    }
    sel.value = state.songIndex;
  }

  // ====== 先生ゾーン（隅長押し） ======
  function wireTeacherZone() {
    var corner = $('teacherCorner'); var timer = null;
    function down() { timer = setTimeout(function () { $('panel').classList.add('open'); }, 1400); }
    function up() { if (timer) clearTimeout(timer); }
    corner.addEventListener('pointerdown', down);
    corner.addEventListener('pointerup', up);
    corner.addEventListener('pointerleave', up);
    $('panelClose').addEventListener('click', function () { $('panel').classList.remove('open'); });
    // PC: gキーでも開く
    document.addEventListener('keydown', function (e) { if (e.key === 'g') $('panel').classList.toggle('open'); });
  }

  // ====== 配線 ======
  function wire() {
    $('btnPlay').addEventListener('click', function () { if (transport.playing) { stop(); } else { play(); } });
    $('btnStop').addEventListener('click', stop);
    $('btnNext').addEventListener('click', nextStepManual);

    $('handRH').addEventListener('click', function () { state.practiceHand = 'RH'; afterHandChange(); });
    $('handLH').addEventListener('click', function () { state.practiceHand = 'LH'; afterHandChange(); });
    $('handBoth').addEventListener('click', function () { state.practiceHand = 'both'; afterHandChange(); });

    $('viewFull').addEventListener('click', function () { state.view = 'full'; stop(); renderScore(); updateUI(); });
    $('viewMeasure').addEventListener('click', function () { state.view = 'measure'; stop(); renderScore(); updateUI(); primeWaitOrGuide(); });
    $('mPrev').addEventListener('click', function () { if (state.measureIndex > 1) { state.measureIndex--; stop(); renderScore(); updateUI(); primeWaitOrGuide(); } });
    $('mNext').addEventListener('click', function () { if (state.measureIndex < state.song.measureCount) { state.measureIndex++; stop(); renderScore(); updateUI(); primeWaitOrGuide(); } });

    // playMode
    $('pmDemo').addEventListener('click', function () { state.playMode = 'demo'; afterModeChange(); });
    $('pmGuide').addEventListener('click', function () { state.playMode = 'guide'; afterModeChange(); });
    $('pmWait').addEventListener('click', function () { state.playMode = 'wait'; afterModeChange(); });

    // layers
    bindLayer('rhName', 'RH', 'name'); bindLayer('rhColor', 'RH', 'color'); bindLayer('rhFinger', 'RH', 'finger');
    bindLayer('lhName', 'LH', 'name'); bindLayer('lhColor', 'LH', 'color'); bindLayer('lhFinger', 'LH', 'finger');
    $('visRH').addEventListener('change', function () { state.hands.RH = this.checked; stop(); renderScore(); });
    $('visLH').addEventListener('change', function () { state.hands.LH = this.checked; stop(); renderScore(); });

    $('falling').addEventListener('change', function () { state.falling = this.checked; kb.setFallingHeight(state.falling ? 150 : 0); });
    $('micOn').addEventListener('change', function () { state.micOn = this.checked; if (!state.micOn) DP.pitch.stop(); else if (transport.playing && state.playMode === 'wait') DP.pitch.start(onMicPitch); });
    $('kana').addEventListener('change', function () { state.kana = this.checked; stop(); renderScore(); });
    $('soundOn').addEventListener('change', function () { state.reward.soundOn = this.checked; });
    $('celebrateOn').addEventListener('change', function () { state.reward.celebrateOn = this.checked; });
    $('softAttack').addEventListener('change', function () { DP.audio.setSoftAttack(this.checked); });

    $('rwQuiet').addEventListener('click', function () { state.reward.intensity = 'quiet'; updateUI(); });
    $('rwNormal').addEventListener('click', function () { state.reward.intensity = 'normal'; updateUI(); });
    $('rwLively').addEventListener('click', function () { state.reward.intensity = 'lively'; updateUI(); });

    $('tempo').addEventListener('input', function () { state.tempo = parseInt(this.value, 10); $('tempoVal').textContent = state.tempo; });
    $('loopMeasure');

    $('songList').addEventListener('change', function () { state.songIndex = parseInt(this.value, 10); stop(); renderAll(); });
    $('importBtn').addEventListener('click', importSong);

    for (var p in PROFILES) (function (name) {
      $('prof_' + name).addEventListener('click', function () { applyProfile(name); });
    })(p);

    global.addEventListener('resize', debounce(function () { stop(); renderScore(); var i = state.songIndex; buildKeyboard(); primeWaitOrGuide(); }, 250));
  }
  function afterHandChange() { stop(); updateUI(); primeWaitOrGuide(); if (state.falling) kb.clearFalling(); }
  function afterModeChange() { stop(); updateUI(); primeWaitOrGuide(); }
  function bindLayer(id, hand, key) {
    $(id).addEventListener('change', function () { state.layers[hand][key] = this.checked ? 1 : 0; stop(); renderScore(); });
  }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  function init() {
    loadCustom(); loadProgress();
    // スマホ(狭い画面)は一小節モードを既定に（折返しの縦スクロールを避ける）
    if ((global.innerWidth || 1024) < 700) state.view = 'measure';
    state.song = allSongs()[0];
    rebuildSongList();
    wire(); wireTeacherZone();
    renderAll();
    // 初回タッチでオーディオ解錠
    document.body.addEventListener('pointerdown', function once() { DP.audio.unlock(); document.body.removeEventListener('pointerdown', once); }, { once: true });
  }

  DP.app = { init: init, state: state, _profiles: PROFILES };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
