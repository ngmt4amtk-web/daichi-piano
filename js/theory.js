/* theory.js — 音楽理論の土台: MIDI⇄音名/色/五線位置
 * 依存なし。window.DP に attach。
 * Boomwhackers系の音→色(非公式近似HEX・仕様書5章)。Figurenotesとは別系統。 */
(function (global) {
  'use strict';
  var DP = global.DP || (global.DP = {});

  // C4 = MIDI 60（中央ド）
  // ピッチクラス 0=C .. 11=B
  var PC_LETTER = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
  var PC_ACC    = ['',  '#', '',  '#', '',  '',  '#', '',  '#', '',  '#', ''];
  // 固定ド（日本の子に最も馴染む主表記）
  var DO_BASE = { C: 'ド', D: 'レ', E: 'ミ', F: 'ファ', G: 'ソ', A: 'ラ', B: 'シ' };
  var LETTER_TO_STEP = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

  // 白鍵7色（仕様書5章・Boomwhackers系・非公式近似）
  var WHITE_COLOR = {
    C: '#E8202A', D: '#F47B20', E: '#FFD400',
    F: '#159A6B', G: '#1B75BC', A: '#7B3F98', B: '#E6007E'
  };
  // 符頭内文字の色（白鍵の明るさで白/黒を決め打ち）
  var WHITE_TEXT = {
    C: '#fff', D: '#222', E: '#222', F: '#fff', G: '#fff', A: '#fff', B: '#fff'
  };

  function hex2rgb(h) {
    h = h.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgb2hex(r, g, b) {
    function c(x) { x = Math.max(0, Math.min(255, Math.round(x))); var s = x.toString(16); return s.length < 2 ? '0' + s : s; }
    return '#' + c(r) + c(g) + c(b);
  }
  function mix(h1, h2, t) {
    var a = hex2rgb(h1), b = hex2rgb(h2);
    return rgb2hex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
  }
  function darken(h, t) { return mix(h, '#000000', t); }
  // 輝度→文字色(白黒)自動
  function textOn(hex) {
    var r = hex2rgb(hex);
    var lum = (0.299 * r[0] + 0.587 * r[1] + 0.114 * r[2]) / 255;
    return lum > 0.62 ? '#222' : '#fff';
  }

  function midiInfo(midi) {
    var pc = ((midi % 12) + 12) % 12;
    var octave = Math.floor(midi / 12) - 1;
    var letter = PC_LETTER[pc];
    var acc = PC_ACC[pc];
    return { midi: midi, pc: pc, octave: octave, letter: letter, acc: acc };
  }

  // 音→色（黒鍵は隣接白鍵のブレンドを少し暗く）
  function colorOf(midi) {
    var info = midiInfo(midi);
    if (info.acc === '') return WHITE_COLOR[info.letter];
    // 黒鍵: その下の白鍵と上の白鍵をブレンド
    var lowPc = info.pc - 1, highPc = info.pc + 1;
    var low = WHITE_COLOR[PC_LETTER[((lowPc % 12) + 12) % 12]];
    var high = WHITE_COLOR[PC_LETTER[((highPc % 12) + 12) % 12]];
    return darken(mix(low, high, 0.5), 0.18);
  }

  // 音名（固定ド）。kana=true→ドレミ, false→CDE
  function nameOf(midi, kana) {
    var info = midiInfo(midi);
    if (kana === false) return info.letter + info.acc;
    var base = DO_BASE[info.letter];
    return info.acc === '#' ? base + '♯' : base;
  }
  // 符頭内に入れる1文字（先頭文字）
  function shortName(midi, kana) {
    var info = midiInfo(midi);
    if (kana === false) return info.letter;
    return DO_BASE[info.letter].charAt(0); // ド,レ,ミ,フ,ソ,ラ,シ → 「ファ」は「フ」になるので例外
  }
  function noteHeadLabel(midi, kana) {
    var info = midiInfo(midi);
    if (kana === false) return info.letter;
    return DO_BASE[info.letter]; // ファも含め全表記（符頭直下用）
  }

  // 五線の縦位置のための diatonic index（白鍵の段。C=0..B=6 + octave*7）
  function diatonicIndex(midi) {
    var info = midiInfo(midi);
    return info.octave * 7 + LETTER_TO_STEP[info.letter];
  }

  // ハ音記号など使わず大譜表。各clefの「中央線」の diatonicIndex
  // 高音部譜表 中央線 = B4 → 4*7+6 = 34
  // 低音部譜表 中央線 = D3 → 3*7+1 = 22
  var TREBLE_MID = 4 * 7 + 6; // B4
  var BASS_MID = 3 * 7 + 1;   // D3

  DP.theory = {
    C4: 60,
    midiInfo: midiInfo,
    colorOf: colorOf,
    nameOf: nameOf,
    noteHeadLabel: noteHeadLabel,
    diatonicIndex: diatonicIndex,
    textOn: textOn,
    mix: mix, darken: darken,
    WHITE_COLOR: WHITE_COLOR,
    TREBLE_MID: TREBLE_MID,
    BASS_MID: BASS_MID,
    LETTER_TO_STEP: LETTER_TO_STEP
  };
})(window);
