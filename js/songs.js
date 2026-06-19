/* songs.js — 「だいち記譜」パーサ ＋ パブリックドメイン曲ライブラリ
 * 内蔵曲も取り込み曲も同じフォーマット（先生が著作権曲を打ち込む導線＝この記譜）。
 *
 * だいち記譜:
 *   title: きらきら星
 *   key: C
 *   time: 4/4
 *   tempo: 90
 *   RH: C4q C4q G4q G4q | A4q A4q G4h
 *   LH: [C3G3]h [C3G3]h | [F3C4]h [C3G3]h
 *   音価: w=4 h=2 q=1 e=0.5 s=0.25、付点は末尾 '.'（h.=3）
 *   和音: [C3E3G3]  休符: R  指番号: C4q:3  小節区切り: |（任意・拍で自動算出）
 */
(function (global) {
  'use strict';
  var DP = global.DP || (global.DP = {});

  var DUR = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25 };
  var BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  function pitchToMidi(p) {
    var m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(p);
    if (!m) return null;
    var letter = m[1].toUpperCase();
    var acc = m[2] === '#' ? 1 : (m[2] === 'b' ? -1 : 0);
    var oct = parseInt(m[3], 10);
    return (oct + 1) * 12 + BASE[letter] + acc;
  }

  function parseToken(tok) {
    // finger
    var finger = null;
    var fi = tok.indexOf(':');
    if (fi >= 0) { finger = parseInt(tok.slice(fi + 1), 10); tok = tok.slice(0, fi); }
    // dots
    var dots = 0;
    while (tok.charAt(tok.length - 1) === '.') { dots++; tok = tok.slice(0, -1); }
    // duration letter (last char)
    var dl = tok.charAt(tok.length - 1);
    var base = DUR[dl];
    if (base == null) return null;
    tok = tok.slice(0, -1);
    var dur = base;
    if (dots === 1) dur = base * 1.5;
    else if (dots === 2) dur = base * 1.75;
    // pitch(es)
    var midis = [];
    if (tok === 'R' || tok === 'r') {
      // rest
    } else if (tok.charAt(0) === '[') {
      var inner = tok.replace(/[\[\]]/g, '');
      var parts = inner.match(/[A-Ga-g][#b]?-?\d/g) || [];
      for (var i = 0; i < parts.length; i++) { var mm = pitchToMidi(parts[i]); if (mm != null) midis.push(mm); }
    } else {
      var single = pitchToMidi(tok);
      if (single != null) midis.push(single);
    }
    return { midis: midis, dur: dur, finger: finger };
  }

  function parseHand(text) {
    var toks = text.replace(/\|/g, ' ').trim().split(/\s+/).filter(Boolean);
    var events = [];
    var t = 0;
    for (var i = 0; i < toks.length; i++) {
      var e = parseToken(toks[i]);
      if (!e) continue;
      e.startBeat = t;
      events.push(e);
      t += e.dur;
    }
    return events;
  }

  // 取り込み/内蔵テキスト → 内部モデル
  function parse(text) {
    var lines = text.split(/\r?\n/);
    var meta = { title: '無題', key: 'C', tempo: 90, time: [4, 4] };
    var rhText = '', lhText = '';
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var m = /^\s*(title|key|tempo|time|copyright|id|tags)\s*:\s*(.+)\s*$/i.exec(line);
      if (m) {
        var k = m[1].toLowerCase(), v = m[2].trim();
        if (k === 'tempo') meta.tempo = parseInt(v, 10) || 90;
        else if (k === 'time') { var ts = v.split('/'); meta.time = [parseInt(ts[0], 10) || 4, parseInt(ts[1], 10) || 4]; }
        else meta[k] = v;
        continue;
      }
      var rh = /^\s*RH\s*:\s*(.*)$/i.exec(line);
      if (rh) { rhText += ' ' + rh[1]; continue; }
      var lh = /^\s*LH\s*:\s*(.*)$/i.exec(line);
      if (lh) { lhText += ' ' + lh[1]; continue; }
    }
    var rhEv = parseHand(rhText);
    var lhEv = parseHand(lhText);
    var beatsPerMeasure = meta.time[0] * (4 / meta.time[1]); // 4/4→4, 3/4→3
    function withMeasure(ev) {
      for (var j = 0; j < ev.length; j++) {
        ev[j].measure = Math.floor(ev[j].startBeat / beatsPerMeasure + 1e-6) + 1;
        ev[j].beatInMeasure = ev[j].startBeat - (ev[j].measure - 1) * beatsPerMeasure;
      }
    }
    withMeasure(rhEv); withMeasure(lhEv);
    var totalBeats = Math.max(
      rhEv.length ? rhEv[rhEv.length - 1].startBeat + rhEv[rhEv.length - 1].dur : 0,
      lhEv.length ? lhEv[lhEv.length - 1].startBeat + lhEv[lhEv.length - 1].dur : 0
    );
    var measureCount = Math.max(1, Math.ceil(totalBeats / beatsPerMeasure - 1e-6));
    return {
      id: meta.id || ('song_' + (meta.title || '')),
      title: meta.title, key: meta.key, tempo: meta.tempo, time: meta.time,
      copyright: meta.copyright || '', tags: meta.tags || '',
      beatsPerMeasure: beatsPerMeasure, measureCount: measureCount, totalBeats: totalBeats,
      RH: rhEv, LH: lhEv,
      source: text
    };
  }

  // ===== パブリックドメイン内蔵曲（メロディPD・歌詞非収録・自前合成音で再生） =====
  var LIB = [
    {
      copyright: 'PD-melody', tags: '入門',
      text:
'title: きらきら星\nkey: C\ntime: 4/4\ntempo: 84\n' +
'RH: C4q:1 C4q:1 G4q:5 G4q:5 | A4q:5 A4q:5 G4h:5 | F4q:4 F4q:4 E4q:3 E4q:3 | D4q:2 D4q:2 C4h:1 |' +
'    G4q:5 G4q:5 F4q:4 F4q:4 | E4q:3 E4q:3 D4h:2 | G4q:5 G4q:5 F4q:4 F4q:4 | E4q:3 E4q:3 D4h:2 |' +
'    C4q:1 C4q:1 G4q:5 G4q:5 | A4q:5 A4q:5 G4h:5 | F4q:4 F4q:4 E4q:3 E4q:3 | D4q:2 D4q:2 C4h:1\n' +
'LH: [C3G3]h [C3G3]h | [F3C4]h [C3G3]h | [F3C4]h [C3G3]h | [G2D3]h [C3G3]h |' +
'    [C3G3]h [F3C4]h | [C3G3]h [G2D3]h | [C3G3]h [F3C4]h | [C3G3]h [G2D3]h |' +
'    [C3G3]h [C3G3]h | [F3C4]h [C3G3]h | [F3C4]h [C3G3]h | [G2D3]h [C3G3]h'
    },
    {
      copyright: 'PD-melody', tags: '入門 既習',
      text:
'title: メリーさんのひつじ\nkey: C\ntime: 4/4\ntempo: 92\n' +
'RH: E4q:3 D4q:2 C4q:1 D4q:2 | E4q:3 E4q:3 E4h:3 | D4q:2 D4q:2 D4h:2 | E4q:3 G4q:5 G4h:5 |' +
'    E4q:3 D4q:2 C4q:1 D4q:2 | E4q:3 E4q:3 E4q:3 E4q:3 | D4q:2 D4q:2 E4q:3 D4q:2 | C4w:1\n' +
'LH: [C3G3]h [C3G3]h | [C3G3]h [C3G3]h | [G2D3]h [G2D3]h | [C3G3]h [C3G3]h |' +
'    [C3G3]h [C3G3]h | [C3G3]h [C3G3]h | [G2D3]h [C3G3]h | [C3G3]w'
    },
    {
      copyright: 'PD-melody', tags: '入門',
      text:
'title: ちょうちょう\nkey: C\ntime: 4/4\ntempo: 96\n' +
'RH: G4q:5 E4q:3 E4h:3 | F4q:4 D4q:2 D4h:2 | C4q:1 D4q:2 E4q:3 F4q:4 | G4q:5 G4q:5 G4h:5 |' +
'    G4q:5 E4q:3 E4h:3 | F4q:4 D4q:2 D4h:2 | C4q:1 E4q:3 G4q:5 G4q:5 | E4q:3 C4q:1 C4h:1\n' +
'LH: [C3G3]h [C3G3]h | [G2D3]h [G2D3]h | [C3G3]h [C3G3]h | [C3G3]h [C3G3]h |' +
'    [C3G3]h [C3G3]h | [G2D3]h [G2D3]h | [C3G3]h [C3G3]h | [C3G3]h [C3G3]h'
    },
    {
      copyright: 'PD-melody', tags: '入門 両手やさしい',
      text:
'title: かえるのうた\nkey: C\ntime: 4/4\ntempo: 96\n' +
'RH: C4q:1 D4q:2 E4q:3 F4q:4 | E4q:3 D4q:2 C4h:1 | E4q:3 F4q:4 G4q:5 A4q:5 | G4q:5 F4q:4 E4h:3 |' +
'    C4q:1 C4q:1 C4q:1 C4q:1 | C4e:1 C4e:1 D4e:2 D4e:2 E4e:3 E4e:3 F4e:4 F4e:4 | E4q:3 D4q:2 C4h:1\n' +
'LH: [C3G3]h [C3G3]h | [G2D3]h [C3G3]h | [C3G3]h [C3G3]h | [G2D3]h [C3G3]h |' +
'    [C3G3]h [C3G3]h | [C3G3]h [C3G3]h | [G2D3]h [C3G3]h'
    },
    {
      copyright: 'PD (Beethoven 1827)', tags: '名曲',
      text:
'title: 喜びの歌\nkey: C\ntime: 4/4\ntempo: 100\n' +
'RH: E4q:3 E4q:3 F4q:4 G4q:5 | G4q:5 F4q:4 E4q:3 D4q:2 | C4q:1 C4q:1 D4q:2 E4q:3 | E4q:3 D4q:2 D4h:2 |' +
'    E4q:3 E4q:3 F4q:4 G4q:5 | G4q:5 F4q:4 E4q:3 D4q:2 | C4q:1 C4q:1 D4q:2 E4q:3 | D4q:2 C4q:1 C4h:1\n' +
'LH: [C3G3]h [C3G3]h | [C3G3]h [G2D3]h | [C3G3]h [C3G3]h | [G2D3]h [G2D3]h |' +
'    [C3G3]h [C3G3]h | [C3G3]h [G2D3]h | [C3G3]h [C3G3]h | [G2D3]h [C3G3]h'
    },
    {
      copyright: 'PD-melody (2016和解で確定)', tags: 'お祝い',
      text:
'title: ハッピーバースデー\nkey: C\ntime: 3/4\ntempo: 96\n' +
'RH: G4e:1 G4e:1 A4q:2 G4q:1 | C5q:3 B4h:2 | G4e:1 G4e:1 A4q:2 G4q:1 | D5q:5 C5h:3 |' +
'    G4e:1 G4e:1 G5q:5 E5q:3 | C5q:1 B4q:2 A4q:1 | F5e F5e E5q C5q | D5q C5h\n' +
'LH: [C3G3]h. | [G2D3]h. | [C3G3]h. | [G2D3]h. |' +
'    [C3G3]h. | [C3G3]h. | [F3C4]h. | [G2D3]h.'
    }
  ];

  function buildLibrary() {
    var out = [];
    for (var i = 0; i < LIB.length; i++) {
      var s = parse(LIB[i].text);
      if (LIB[i].copyright) s.copyright = LIB[i].copyright;
      if (LIB[i].tags) s.tags = LIB[i].tags;
      s.builtin = true;
      out.push(s);
    }
    return out;
  }

  DP.songs = {
    parse: parse,
    pitchToMidi: pitchToMidi,
    library: buildLibrary()
  };
})(window);
