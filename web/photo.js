// 본체 내부 사진 분석 (직접 만든 규칙). 캔버스로 읽은 픽셀(RGBA)만 다루고, 사진은 밖으로 나가지 않음
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
  function components(mask, w, h) {
    // 붙어 있는 칸 묶기 (상하좌우)
    var seen = new Uint8Array(w * h), out = [], stack = [];
    for (var s = 0; s < w * h; s++) {
      if (!mask[s] || seen[s]) continue;
      var c = {area: 0, x0: w, y0: h, x1: 0, y1: 0};
      seen[s] = 1; stack.push(s);
      while (stack.length) {
        var k = stack.pop(), x = k % w, y = (k - x) / w;
        c.area++; c.x0 = Math.min(c.x0, x); c.x1 = Math.max(c.x1, x); c.y0 = Math.min(c.y0, y); c.y1 = Math.max(c.y1, y);
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
  function quality(img, srcShort) {
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
    if (sharp < SHARP_MIN) why.push("흐립니다");
    return {mean: Math.round(mean), sharp: Math.round(sharp), ok: !why.length, why: why};
  }

  // 2) 본체 내부: 먼지(밝은 회색, 매끈함)와 갈색·검은 얼룩(탄 자국·샌 자국) 의심 칸
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

  var api = {quality: quality, board: board};
  root.PhotoCheck = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(this);
