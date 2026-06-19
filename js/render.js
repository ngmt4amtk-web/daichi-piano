/* render.js — 自前SVG大譜表レンダラ（依存ゼロ）
 * 大きな丸い符頭(Figurenotes/Boomwhacker流=SEN児に最も読みやすい)。
 * 色/音名(ドレミ)/指番号 を 右手・左手それぞれ独立にオンオフ・濃度(opacity)。
 * full(全体・折返し) と measure(一小節拡大) の2モード。 */
(function (global) {
  'use strict';
  var DP = global.DP || (global.DP = {});
  var T = DP.theory;
  var SVGNS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs) {
    var e = document.createElementNS(SVGNS, tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  // diatonicIndex → y（clef中央線基準）
  function yFor(midi, clef, mid, gap) {
    var di = T.diatonicIndex(midi);
    var ref = clef === 'treble' ? T.TREBLE_MID : T.BASS_MID;
    return mid - (di - ref) * (gap / 2);
  }

  // 描画。container=DOM, song=内部モデル, opt=設定。戻り値=note参照index。
  function draw(container, song, opt) {
    opt = opt || {};
    var hands = opt.hands || { RH: true, LH: true };
    var layers = opt.layers || { RH: {}, LH: {} };
    var kana = opt.kana !== false;
    var mode = opt.mode || 'full';
    var W = container.clientWidth || 900;

    var gap = mode === 'measure' ? 26 : 16;     // 五線間隔
    var R = gap * 0.62;                          // 符頭半径
    var leftLabel = mode === 'measure' ? 84 : 58;
    var sidePad = 12;
    var measuresPerRow = mode === 'measure' ? 1
      : Math.max(1, Math.min(4, Math.floor((W - leftLabel) / 210)));
    var bpm = song.beatsPerMeasure;

    var measuresToDraw = [];
    if (mode === 'measure') {
      var mi = Math.max(1, Math.min(song.measureCount, opt.measureIndex || 1));
      measuresToDraw = [mi];
    } else {
      for (var i = 1; i <= song.measureCount; i++) measuresToDraw.push(i);
    }

    var rows = [];
    for (var r = 0; r < measuresToDraw.length; r += measuresPerRow)
      rows.push(measuresToDraw.slice(r, r + measuresPerRow));

    var systemH = 11 * gap;     // 五線群の高さ
    var topPad = 3.2 * gap;     // 上の余白(指番号/加線)
    var rowGap = 3.4 * gap;
    var totalH = rows.length * (systemH + rowGap) + topPad;

    var svg = el('svg', {
      width: '100%', height: totalH,
      viewBox: '0 0 ' + W + ' ' + totalH,
      class: 'score-svg', preserveAspectRatio: 'xMidYMin meet'
    });

    var refs = []; // {hand, idx, midis, startBeat, dur, group, cx, cys:[]}
    var rowAreaW = W - leftLabel - sidePad;
    var measureW = rowAreaW / measuresPerRow;

    function placeHand(handName, ev, clef, trebleMid, bassMid, mIndex, mLeft) {
      if (!hands[handName]) return;
      var L = layers[handName] || {};
      var mid = clef === 'treble' ? trebleMid : bassMid;
      for (var n = 0; n < ev.length; n++) {
        var e = ev[n];
        if (e.measure !== mIndex) continue;
        if (!e.midis.length) continue; // 休符は描かない（間は空く）
        var innerPad = R + 8;
        var cx = mLeft + innerPad + (e.beatInMeasure / bpm) * (measureW - innerPad * 2);
        drawNote(handName, n, e, clef, mid, gap, R, cx, L, kana, refs);
      }
    }

    function drawNote(handName, idx, e, clef, mid, gap, R, cx, L, kana, refs) {
      var g = el('g', { class: 'note note-' + handName });
      var cys = [];
      var topY = 1e9, botY = -1e9;
      var open = e.dur >= 2; // 2拍以上=白丸(リング)
      for (var c = 0; c < e.midis.length; c++) {
        var midi = e.midis[c];
        var cy = yFor(midi, clef, mid, gap);
        cys.push(cy);
        topY = Math.min(topY, cy); botY = Math.max(botY, cy);

        // 加線
        addLedger(g, midi, clef, mid, gap, cx, R);

        var colorOn = (L.color || 0) > 0;
        var nameOn = (L.name || 0) > 0;
        var fill = colorOn ? T.colorOf(midi) : (open ? '#ffffff' : '#33373d');
        var stroke = colorOn ? T.darken(T.colorOf(midi), 0.32) : '#22252a';

        var head = el('circle', {
          cx: cx, cy: cy, r: R,
          fill: open && !colorOn ? '#ffffff' : fill,
          stroke: stroke, 'stroke-width': open ? 3.2 : 2,
          'fill-opacity': colorOn ? (open ? 0.30 : (L.color)) : 1,
          class: 'notehead'
        });
        if (colorOn && !open) head.setAttribute('fill-opacity', L.color);
        g.appendChild(head);

        // 音名（符頭内）
        if (nameOn) {
          var label = T.noteHeadLabel(midi, kana);
          var tcol = colorOn ? T.textOn(T.colorOf(midi)) : '#1a1d22';
          var fs = label.length >= 2 ? R * 0.92 : R * 1.18;
          var t = el('text', {
            x: cx, y: cy, fill: tcol, 'text-anchor': 'middle',
            'dominant-baseline': 'central', 'font-size': fs,
            'font-weight': 700, class: 'note-name', opacity: L.name
          });
          t.textContent = label;
          g.appendChild(t);
        }
      }

      // 符尾（単音/和音の代表）
      var stemUp = (topY + botY) / 2 > (clef === 'treble' ? mid : mid); // 中央より下なら上向き
      var stemX = stemUp ? cx + R : cx - R;
      var stemFrom = stemUp ? botY : topY;
      var stemLen = 3.1 * gap;
      var stemTo = stemUp ? stemFrom - stemLen : stemFrom + stemLen;
      if (e.dur < 4) { // 全音符は符尾なし
        g.appendChild(el('line', { x1: stemX, y1: stemFrom, x2: stemX, y2: stemTo, stroke: '#22252a', 'stroke-width': 2.4, class: 'stem' }));
        // 8分の旗
        if (e.dur <= 0.5) {
          var fl = el('path', {
            d: stemUp
              ? 'M' + stemX + ',' + stemTo + ' q ' + (R * 1.6) + ',' + (gap * 0.5) + ' ' + (R * 0.4) + ',' + (gap * 1.5)
              : 'M' + stemX + ',' + stemTo + ' q ' + (R * 1.6) + ',' + (-gap * 0.5) + ' ' + (R * 0.4) + ',' + (-gap * 1.5),
            fill: 'none', stroke: '#22252a', 'stroke-width': 2.4, class: 'flag'
          });
          g.appendChild(fl);
        }
      }
      // 付点
      if (e.dur === 1.5 || e.dur === 3) {
        g.appendChild(el('circle', { cx: cx + R + 6, cy: botY, r: 2.4, fill: '#22252a' }));
      }

      // 指番号
      if ((L.finger || 0) > 0 && e.finger) {
        var fy = clef === 'treble' ? topY - R - gap * 0.7 : botY + R + gap * 0.9;
        var fnum = el('text', {
          x: cx, y: fy, 'text-anchor': 'middle', 'dominant-baseline': 'central',
          'font-size': gap * 0.95, 'font-weight': 800, fill: '#0a7d4d',
          class: 'finger', opacity: L.finger
        });
        fnum.textContent = e.finger;
        // 丸囲み
        g.appendChild(el('circle', { cx: cx, cy: fy, r: gap * 0.62, fill: '#eafff4', stroke: '#0a7d4d', 'stroke-width': 1.4, opacity: L.finger }));
        g.appendChild(fnum);
      }

      svgAppend.push(g);
      refs.push({ hand: handName, idx: idx, midis: e.midis, startBeat: e.startBeat, dur: e.dur, group: g, cx: cx, cys: cys });
    }

    function addLedger(g, midi, clef, mid, gap, cx, R) {
      var di = T.diatonicIndex(midi);
      var ref = clef === 'treble' ? T.TREBLE_MID : T.BASS_MID;
      var stepFromMid = di - ref; // 中央線からの段
      // 五線は中央線±4段(上下2線)→ |stepFromMid|>4 の偶数段位置に加線
      var topLine = 4, botLine = -4;
      var lines = [];
      if (stepFromMid > topLine) for (var s = topLine + 2; s <= stepFromMid; s += 2) lines.push(s);
      if (stepFromMid < botLine) for (var s2 = botLine - 2; s2 >= stepFromMid; s2 -= 2) lines.push(s2);
      for (var li = 0; li < lines.length; li++) {
        var ly = mid - lines[li] * (gap / 2);
        g.appendChild(el('line', { x1: cx - R - 5, y1: ly, x2: cx + R + 5, y2: ly, stroke: '#9aa1ab', 'stroke-width': 1.6, class: 'ledger' }));
      }
    }

    var svgAppend = [];

    // 各system描画
    for (var ri = 0; ri < rows.length; ri++) {
      var rowMeasures = rows[ri];
      var sysTop = topPad + ri * (systemH + rowGap);
      var trebleMid = sysTop + 2 * gap;
      var bassMid = trebleMid + 6 * gap;

      // 五線（treble/bass 各5本）
      for (var clefi = 0; clefi < 2; clefi++) {
        var cm = clefi === 0 ? trebleMid : bassMid;
        for (var k = -2; k <= 2; k++) {
          svg.appendChild(el('line', {
            x1: leftLabel, y1: cm + k * gap, x2: W - sidePad, y2: cm + k * gap,
            stroke: '#c2c8d0', 'stroke-width': 1.4
          }));
        }
      }
      // 左の手ラベル＋ブレース
      var lblT = el('text', { x: 10, y: trebleMid + 4, fill: '#1b75bc', 'font-size': gap * 0.9, 'font-weight': 800 });
      lblT.textContent = 'みぎて'; svg.appendChild(lblT);
      var lblB = el('text', { x: 10, y: bassMid + 4, fill: '#7b3f98', 'font-size': gap * 0.9, 'font-weight': 800 });
      lblB.textContent = 'ひだりて'; svg.appendChild(lblB);
      svg.appendChild(el('line', { x1: leftLabel, y1: trebleMid - 2 * gap, x2: leftLabel, y2: bassMid + 2 * gap, stroke: '#9aa1ab', 'stroke-width': 2.4 }));

      // 小節線＋小節番号＋音符
      for (var mci = 0; mci < rowMeasures.length; mci++) {
        var mIndex = rowMeasures[mci];
        var mLeft = leftLabel + mci * measureW;
        var mRight = mLeft + measureW;
        // 右の小節線
        svg.appendChild(el('line', { x1: mRight, y1: trebleMid - 2 * gap, x2: mRight, y2: bassMid + 2 * gap, stroke: '#9aa1ab', 'stroke-width': mci === rowMeasures.length - 1 ? 2.4 : 1.6 }));
        // 小節番号
        var mn = el('text', { x: mLeft + 4, y: trebleMid - 2 * gap - 6, fill: '#aeb4bd', 'font-size': gap * 0.7 });
        mn.textContent = mIndex; svg.appendChild(mn);

        placeHand('RH', song.RH, 'treble', trebleMid, bassMid, mIndex, mLeft);
        placeHand('LH', song.LH, 'bass', trebleMid, bassMid, mIndex, mLeft);
      }
    }

    // 音符グループは最後に重ねる（五線の上）
    for (var ai = 0; ai < svgAppend.length; ai++) svg.appendChild(svgAppend[ai]);

    container.innerHTML = '';
    container.appendChild(svg);
    return { svg: svg, refs: refs, measureCount: song.measureCount };
  }

  // 指定eventをハイライト（現在弾く音）
  function highlight(index, matchFn) {
    for (var i = 0; i < index.refs.length; i++) {
      var ref = index.refs[i];
      var on = matchFn(ref);
      if (ref.group) ref.group.classList.toggle('hl', !!on);
    }
  }

  DP.render = { draw: draw, highlight: highlight, yFor: yFor };
})(window);
