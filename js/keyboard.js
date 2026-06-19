/* keyboard.js — 画面内ピアノ鍵盤 + 落下ノーツ(光ナビ)
 * たいち既定: 押す鍵盤が音の色で光る。タップで音が出る(iPad自体が楽器)。
 * 依存: DP.theory, DP.audio */
(function (global) {
  'use strict';
  var DP = global.DP || (global.DP = {});
  var T = DP.theory;
  var SVGNS = 'http://www.w3.org/2000/svg';
  function el(tag, a) { var e = document.createElementNS(SVGNS, tag); if (a) for (var k in a) e.setAttribute(k, a[k]); return e; }
  function isWhite(midi) { var pc = ((midi % 12) + 12) % 12; return [0, 2, 4, 5, 7, 9, 11].indexOf(pc) >= 0; }

  function create(container, opt) {
    opt = opt || {};
    var lo = opt.lo != null ? opt.lo : 48; // C3
    var hi = opt.hi != null ? opt.hi : 72; // C5
    var onPlay = opt.onPlay || function () {};
    var showNames = opt.showNames !== false;

    container.innerHTML = '';
    container.classList.add('kb-wrap');
    var canvas = document.createElement('canvas');
    canvas.className = 'kb-falling';
    container.appendChild(canvas);
    var kbHost = document.createElement('div');
    kbHost.className = 'kb-host';
    container.appendChild(kbHost);

    var W = container.clientWidth || 900;
    // 白鍵数
    var whites = [];
    for (var m = lo; m <= hi; m++) if (isWhite(m)) whites.push(m);
    var ww = W / whites.length;
    var kbH = opt.kbHeight || 150;
    var bw = ww * 0.62, bh = kbH * 0.62;

    var svg = el('svg', { width: '100%', height: kbH, viewBox: '0 0 ' + W + ' ' + kbH, class: 'kb-svg' });
    var keyEls = {}; var keyCenter = {}; var keyRect = {};

    // 白鍵
    var wi = 0; var lastWhiteX = 0;
    var blacks = [];
    for (var mm = lo; mm <= hi; mm++) {
      if (isWhite(mm)) {
        var x = wi * ww;
        lastWhiteX = x;
        var rect = el('rect', { x: x + 1, y: 0, width: ww - 2, height: kbH, rx: 6, fill: '#fff', stroke: '#c2c8d0', 'stroke-width': 1.4, class: 'key white', 'data-midi': mm });
        svg.appendChild(rect);
        keyEls[mm] = rect; keyCenter[mm] = x + ww / 2; keyRect[mm] = { x: x + 1, w: ww - 2, white: true };
        if (showNames) {
          var tx = el('text', { x: x + ww / 2, y: kbH - 10, 'text-anchor': 'middle', 'font-size': Math.min(15, ww * 0.42), fill: '#9aa1ab', class: 'kb-name' });
          tx.textContent = T.nameOf(mm, true);
          svg.appendChild(tx);
        }
        wi++;
      } else {
        blacks.push({ midi: mm, x: lastWhiteX + ww - bw / 2 });
      }
    }
    // 黒鍵（白鍵の上に重ねる）
    for (var bi = 0; bi < blacks.length; bi++) {
      var b = blacks[bi];
      var br = el('rect', { x: b.x, y: 0, width: bw, height: bh, rx: 4, fill: '#2a2d33', stroke: '#15171a', 'stroke-width': 1.2, class: 'key black', 'data-midi': b.midi });
      svg.appendChild(br);
      keyEls[b.midi] = br; keyCenter[b.midi] = b.x + bw / 2; keyRect[b.midi] = { x: b.x, w: bw, white: false };
    }
    kbHost.appendChild(svg);

    // タップで発音
    function pressFromEvent(ev) {
      ev.preventDefault();
      var t = ev.target;
      var midi = t && t.getAttribute && t.getAttribute('data-midi');
      if (!midi) return;
      midi = parseInt(midi, 10);
      flash(midi);
      DP.audio.note(midi, DP.audio.now() + 0.001, 0.5, 0.85);
      onPlay(midi);
    }
    svg.addEventListener('pointerdown', pressFromEvent);

    function setLight(midi, color) {
      var k = keyEls[midi]; if (!k) return;
      k.setAttribute('fill', color || (keyRect[midi].white ? '#fff' : '#2a2d33'));
      k.classList.toggle('lit', !!color);
    }
    function lightNotes(midis) {
      allOff();
      if (!midis) return;
      for (var i = 0; i < midis.length; i++) setLight(midis[i], T.colorOf(midis[i]));
    }
    function allOff() { for (var m in keyEls) setLight(parseInt(m, 10), null); }
    function flash(midi) {
      setLight(midi, T.colorOf(midi));
      setTimeout(function () { setLight(midi, null); }, 220);
    }

    // ===== 落下ノーツ =====
    var ctx2d = canvas.getContext('2d');
    var fallH = 0;
    function setFallingHeight(h) {
      fallH = h;
      canvas.style.height = h + 'px';
      var dpr = global.devicePixelRatio || 1;
      canvas.width = W * dpr; canvas.height = h * dpr;
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    // events: [{midis,startBeat,dur,hand}], currentBeat, lookahead(拍)
    function renderFalling(events, currentBeat, lookahead) {
      if (!fallH) return;
      lookahead = lookahead || 4;
      ctx2d.clearRect(0, 0, W, fallH);
      // 鍵盤ラインに向かって落ちる
      for (var i = 0; i < events.length; i++) {
        var e = events[i];
        if (!e.midis.length) continue;
        var rel = e.startBeat - currentBeat;       // +未来 / -過去
        if (rel > lookahead || e.startBeat + e.dur < currentBeat - 0.3) continue;
        for (var c = 0; c < e.midis.length; c++) {
          var midi = e.midis[c];
          if (keyCenter[midi] == null) continue;
          var cx = keyCenter[midi];
          var w = (keyRect[midi].white ? ww : bw) * 0.78;
          var yHead = fallH * (1 - rel / lookahead);          // rel=0で底
          var hgt = Math.max(10, (e.dur / lookahead) * fallH);
          var color = T.colorOf(midi);
          ctx2d.globalAlpha = rel < 0 ? 0.35 : 0.92;
          ctx2d.fillStyle = color;
          roundRect(ctx2d, cx - w / 2, yHead - hgt, w, hgt, 6);
          ctx2d.fill();
          // 今まさに弾く音は鍵盤を光らせる
          if (rel <= 0.06 && rel > -e.dur) setLight(midi, color);
        }
      }
      ctx2d.globalAlpha = 1;
    }
    function roundRect(c, x, y, w, h, r) {
      c.beginPath();
      c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r); c.closePath();
    }

    return {
      el: container, svg: svg,
      range: { lo: lo, hi: hi },
      setLight: setLight, lightNotes: lightNotes, allOff: allOff, flash: flash,
      setFallingHeight: setFallingHeight, renderFalling: renderFalling,
      clearFalling: function () { if (fallH) ctx2d.clearRect(0, 0, W, fallH); }
    };
  }

  DP.keyboard = { create: create, isWhite: isWhite };
})(window);
