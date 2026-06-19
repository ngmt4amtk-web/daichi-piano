/* pitch.js — マイク単音ピッチ検出（autocorrelation）
 * iOS SafariはWeb MIDI非対応 → 電子キーボード/声の音をマイクで拾い「待ち/採点」に使う。
 * 単音のみ。和音は判定しない（仕様書: 和音採点は原理的に不可）。 */
(function (global) {
  'use strict';
  var DP = global.DP || (global.DP = {});

  var stream = null, analyser = null, srcNode = null, raf = 0, buf = null, active = false, cb = null;

  function freqToMidi(f) { return Math.round(69 + 12 * Math.log2(f / 440)); }

  function autoCorrelate(buffer, sampleRate) {
    var SIZE = buffer.length;
    var rms = 0;
    for (var i = 0; i < SIZE; i++) { var v = buffer[i]; rms += v * v; }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1; // 静か

    var r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (var i2 = 0; i2 < SIZE / 2; i2++) if (Math.abs(buffer[i2]) < thres) { r1 = i2; break; }
    for (var j = 1; j < SIZE / 2; j++) if (Math.abs(buffer[SIZE - j]) < thres) { r2 = SIZE - j; break; }
    var b = buffer.slice(r1, r2);
    var SIZE2 = b.length;
    var c = new Array(SIZE2).fill(0);
    for (var i3 = 0; i3 < SIZE2; i3++)
      for (var k = 0; k < SIZE2 - i3; k++) c[i3] += b[k] * b[k + i3];

    var d = 0; while (c[d] > c[d + 1]) d++;
    var maxval = -1, maxpos = -1;
    for (var i4 = d; i4 < SIZE2; i4++) if (c[i4] > maxval) { maxval = c[i4]; maxpos = i4; }
    var T0 = maxpos;
    if (T0 <= 0) return -1;
    // 放物線補間
    var x1 = c[T0 - 1] || 0, x2 = c[T0], x3 = c[T0 + 1] || 0;
    var a = (x1 + x3 - 2 * x2) / 2, bb = (x3 - x1) / 2;
    if (a) T0 = T0 - bb / (2 * a);
    var freq = sampleRate / T0;
    var clarity = maxval / (rms * rms * SIZE2 + 1e-9);
    return freq > 50 && freq < 2000 ? freq : -1;
  }

  function loop() {
    if (!active) return;
    analyser.getFloatTimeDomainData(buf);
    var freq = autoCorrelate(buf, DP.audio.context.sampleRate);
    if (freq > 0) cb && cb(freqToMidi(freq), freq);
    else cb && cb(null, 0);
    raf = requestAnimationFrame(loop);
  }

  function start(onPitch) {
    if (active) { cb = onPitch; return Promise.resolve(true); }
    cb = onPitch;
    DP.audio.ensure();
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false } })
      .then(function (s) {
        stream = s;
        var ac = DP.audio.context;
        srcNode = ac.createMediaStreamSource(s);
        analyser = ac.createAnalyser();
        analyser.fftSize = 2048;
        buf = new Float32Array(analyser.fftSize);
        srcNode.connect(analyser);
        active = true;
        loop();
        return true;
      }).catch(function (e) { active = false; return false; });
  }

  function stop() {
    active = false;
    if (raf) cancelAnimationFrame(raf);
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    if (srcNode) { try { srcNode.disconnect(); } catch (e) {} srcNode = null; }
    analyser = null;
  }

  DP.pitch = { start: start, stop: stop, isActive: function () { return active; }, freqToMidi: freqToMidi };
})(window);
