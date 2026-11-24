// 사진 분석 (직접 만든 규칙). 캔버스로 읽은 픽셀(RGBA)만 다루고, 사진은 PC 밖으로 나가지 않음
// img = {w, h, data: RGBA 배열}. 상자 좌표는 사진 전체 대비 0~1
(function (root) {
  "use strict";
  var SHARP_MIN = 20, DARK = 45, BRIGHT = 235, SMALL = 300;

  function gray(img) {
    var n = img.w * img.h, g = new Float32Array(n), d = img.data;
    for (var i = 0; i < n; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    return g;
  }
  function median(arr) {
    var s = Array.prototype.slice.call(arr).sort(function (a, b) { return a - b; });
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  }
  function mad(arr) { return median(Array.prototype.map.call(arr, Math.abs)) * 1.4826; }  // 튀는 값에 덜 흔들리는 표준편차
  function smooth1(arr, r) {
    var n = arr.length, out = new Float32Array(n), pre = new Float64Array(n + 1), i;
    for (i = 0; i < n; i++) pre[i + 1] = pre[i] + arr[i];
    for (i = 0; i < n; i++) { var a = Math.max(0, i - r), b = Math.min(n, i + r + 1); out[i] = (pre[b] - pre[a]) / (b - a); }
    return out;
  }
  function blur2(g, w, h, r) {
    // 적분 영상으로 상자 흐림
    var I = new Float64Array((w + 1) * (h + 1)), out = new Float32Array(w * h), x, y;
    for (y = 0; y < h; y++) {
      var row = 0;
      for (x = 0; x < w; x++) { row += g[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; }
    }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      out[y * w + x] = (I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
    }
    return out;
  }
  function components(mask, w, h) {
    // 붙어 있는 칸 묶기 (상하좌우)
    var seen = new Uint8Array(w * h), out = [], stack = [];
    for (var s = 0; s < w * h; s++) {
      if (!mask[s] || seen[s]) continue;
      var c = {area: 0, x0: w, y0: h, x1: 0, y1: 0, edge: false};
      seen[s] = 1; stack.push(s);
      while (stack.length) {
        var k = stack.pop(), x = k % w, y = (k - x) / w;
        c.area++; c.x0 = Math.min(c.x0, x); c.x1 = Math.max(c.x1, x); c.y0 = Math.min(c.y0, y); c.y1 = Math.max(c.y1, y);
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) c.edge = true;
        [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1].forEach(function (n) {
          if (n < 0 || seen[n] || !mask[n]) return;
          seen[n] = 1; stack.push(n);
        });
      }
      out.push(c);
    }
    return out;
  }

  // 1) 사진 품질: 어둡거나 너무 밝거나 흐리면 판정하지 않음
  function quality(img, srcShort, checkBlur) {
    var g = gray(img), w = img.w, h = img.h, n = w * h, sum = 0, i;
    for (i = 0; i < n; i++) sum += g[i];
    var mean = sum / n, s = 0, s2 = 0, m = 0;
    for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) {
      var k = y * w + x, l = 4 * g[k] - g[k - 1] - g[k + 1] - g[k - w] - g[k + w];
      s += l; s2 += l * l; m++;
    }
    var sharp = m ? s2 / m - (s / m) * (s / m) : 0, why = [];
    if (srcShort < SMALL) why.push("사진이 너무 작습니다");
    if (mean < DARK) why.push("너무 어둡습니다");
    else if (mean > BRIGHT) why.push("너무 밝습니다(빛 반사)");
    if (checkBlur && sharp < SHARP_MIN) why.push("흐립니다");
    return {mean: Math.round(mean), sharp: Math.round(sharp), ok: !why.length, why: why};
  }

  // 2) 화면: 단색 화면을 찍은 사진에서 줄·점·얼룩 찾기 (가운데 80%만, 테두리 제외)
  function screen(img) {
    var g = gray(img), w = img.w, h = img.h, cx = Math.round(w * 0.1), cy = Math.round(h * 0.1);
    var cw = w - cx * 2, ch = h - cy * 2, G = new Float32Array(cw * ch), x, y;
    for (y = 0; y < ch; y++) for (x = 0; x < cw; x++) G[y * cw + x] = g[(y + cy) * w + x + cx];
    var col = new Float32Array(cw), row = new Float32Array(ch);
    for (y = 0; y < ch; y++) for (x = 0; x < cw; x++) { col[x] += G[y * cw + x] / ch; row[y] += G[y * cw + x] / cw; }
    var wavy = false;
    var lines = function (prof) {
      var base = smooth1(prof, 10), dev = Array.prototype.map.call(prof, function (v, i) { return v - base[i]; });
      var spread = mad(dev), th = Math.max(8, 5 * spread), out = [], start = -1;
      if (spread > 6) wavy = true;  // 줄무늬가 화면 전체에 깔림 = 모아레
      for (var i = 2; i < prof.length - 2; i++) {
        if (Math.abs(dev[i]) > th) { if (start < 0) start = i; } else if (start >= 0) { out.push([start, i - 1]); start = -1; }
      }
      if (start >= 0) out.push([start, prof.length - 3]);
      return out.filter(function (seg) { return seg[1] - seg[0] + 1 <= prof.length * 0.04; });
    };
    var vl = lines(col), hl = lines(row), boxes = [];
    if (wavy || vl.length + hl.length > 12) return {moire: true, lines: 0, spots: 0, patches: 0, boxes: []};  // 무늬 낀 사진은 판정 안 함
    vl.forEach(function (s) { boxes.push({kind: "line", label: "세로 줄", x: (cx + s[0]) / w, y: cy / h, w: (s[1] - s[0] + 1) / w, h: ch / h}); });
    hl.forEach(function (s) { boxes.push({kind: "line", label: "가로 줄", x: cx / w, y: (cy + s[0]) / h, w: cw / w, h: (s[1] - s[0] + 1) / h}); });
    // 점은 좁은 주변과, 얼룩은 넓은 주변과 비교
    var pass = function (r, minTh, k) {
      var b = blur2(G, cw, ch, r), d = new Float32Array(cw * ch), i;
      for (i = 0; i < d.length; i++) d[i] = G[i] - b[i];
      var th = Math.max(minTh, k * mad(d)), mask = new Uint8Array(d.length);
      for (i = 0; i < d.length; i++) mask[i] = Math.abs(d[i]) > th ? 1 : 0;
      return components(mask, cw, ch).filter(function (c) { return !c.edge; });
    };
    var area = cw * ch, spots = 0, patches = 0;
    pass(4, 22, 6).forEach(function (c) {
      if (c.area > area * 0.002) return;
      spots++;
      boxes.push({kind: "spot", label: "점", x: (cx + c.x0) / w, y: (cy + c.y0) / h, w: (c.x1 - c.x0 + 1) / w, h: (c.y1 - c.y0 + 1) / h});
    });
    pass(Math.max(8, Math.round(cw / 8)), 14, 4).forEach(function (c) {
      if (c.area < area * 0.01 || c.area > area * 0.3) return;
      patches++;
      boxes.push({kind: "patch", label: "얼룩", x: (cx + c.x0) / w, y: (cy + c.y0) / h, w: (c.x1 - c.x0 + 1) / w, h: (c.y1 - c.y0 + 1) / h});
    });
    return {moire: false, lines: vl.length + hl.length, spots: spots, patches: patches, boxes: boxes};
  }

  // 3) 본체 내부: 먼지(밝은 회색, 매끈함)와 갈색·검은 얼룩(탄 자국·샌 자국) 의심 칸
  function board(img) {
    var d = img.data, w = img.w, h = img.h, g = gray(img), C = Math.max(8, Math.round(Math.max(w, h) / 24));
    var gw = Math.floor(w / C), gh = Math.floor(h / C), cells = [], x, y;
    for (var cyi = 0; cyi < gh; cyi++) for (var cxi = 0; cxi < gw; cxi++) {
      var r = 0, gg = 0, b = 0, l = 0, e = 0, n = 0;
      for (y = cyi * C; y < (cyi + 1) * C; y++) for (x = cxi * C; x < (cxi + 1) * C; x++) {
        var k = y * w + x;
        r += d[k * 4]; gg += d[k * 4 + 1]; b += d[k * 4 + 2]; l += g[k]; n++;
        if (x + 1 < w && y + 1 < h) e += Math.abs(g[k] - g[k + 1]) + Math.abs(g[k] - g[k + w]);
      }
      r /= n; gg /= n; b /= n;
      var mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      cells.push({r: r, g: gg, b: b, l: l / n, sat: mx ? (mx - mn) / mx : 0, edge: e / n});
    }
    var M = median(cells.map(function (c) { return c.l; })), E = median(cells.map(function (c) { return c.edge; }));
    var dark = M < 70;  // 검은 기판·어두운 사진은 탄 자국을 구별 못 함
    var dust = new Uint8Array(cells.length), stain = new Uint8Array(cells.length);
    cells.forEach(function (c, i) {
      if (c.sat < 0.12 && c.l > 120 && c.l < 225 && c.l > M * 1.15 && c.edge < E * 0.8) dust[i] = 1;
      var brown = c.r > c.g && c.g >= c.b && c.r - c.b > 25 && c.l < M * 0.75;
      var burnt = c.l < M * 0.45 && c.r >= c.b;
      if (!dark && (brown || burnt)) stain[i] = 1;
    });
    var boxes = [], take = function (mask, kind, label, minCells) {
      return components(mask, gw, gh).filter(function (c) { return c.area >= minCells; })
        .sort(function (a, b) { return b.area - a.area; }).slice(0, 5).map(function (c) {
          boxes.push({kind: kind, label: label, x: c.x0 * C / w, y: c.y0 * C / h, w: (c.x1 - c.x0 + 1) * C / w, h: (c.y1 - c.y0 + 1) * C / h});
          return c;
        }).length;
    };
    return {dust: take(dust, "dust", "먼지?", 2), stain: take(stain, "stain", "얼룩·탄 자국?", 1), darkBoard: dark, boxes: boxes};
  }

  var api = {quality: quality, screen: screen, board: board};
  root.PhotoCheck = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(this);
