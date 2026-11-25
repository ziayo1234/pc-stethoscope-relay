// 휴대폰 사진 진단: 분석은 photo.js(PC 앱과 같은 규칙), PC 연결은 link.js
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]; }); }

  // 항목: [id, 증상, 무게, 연결(결합) 문제인지]
  var CHECKS = {
    board: {
      groups: [["손상", [["capacitor", "원통형 부품(콘덴서) 윗면이 볼록하거나 터졌다", 3], ["leak", "갈색 액체가 새어 나온 자국이 있다", 3], ["burn", "까맣게 그을린 부분이나 탄 냄새가 난다", 3], ["dust", "먼지가 팬 날개와 방열판을 덮고 있다", 1]]],
        ["연결(결합)", [["ram", "램 양쪽 끝 걸쇠가 열려 있거나 램이 비스듬하다", 1, true], ["main", "메인보드의 넓은 전원선(24핀)이나 CPU 전원선(8핀)이 덜 꽂혀 있다", 1, true],
          ["gpu", "그래픽카드 보조전원 선이 빠져 있거나 그래픽카드 한쪽이 들려 있다", 1, true], ["fan", "CPU 쿨러 팬 선이 빠져 있다", 2, true], ["sata", "저장장치 선(데이터·전원)이 한쪽이라도 빠져 있다", 1, true]]]],
      crit: "메인보드나 전원 장치(파워) 손상이 의심됩니다. 전원을 연결하지 말고 수리점에 맡기세요. 이 상태로 켜면 다른 부품까지 망가질 수 있습니다."}
  };
  var FOUND = {dust: "dust", stain: "burn"};  // 사진 분석 → 체크 항목
  var PHOTOS = [], photoSel = null, photoUser = {}, photoSeq = 0, touched = false;
  var LINK = null;

  function toast(text) {
    var t = $("toast"); t.textContent = text; t.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(function () { t.hidden = true; }, 3500);
  }

  // ---------- 사진 ----------
  function photoAnalyze(p) {
    // 긴 변 480px로 줄여 분석
    var img = new Image();
    img.onload = function () {
      var k = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      var ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0, c.width, c.height);
      var px = {w: c.width, h: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data};
      p.q = PhotoCheck.quality(px, Math.min(img.naturalWidth, img.naturalHeight));
      p.r = p.q.ok ? PhotoCheck.board(px) : null;
      p.state = "done"; renderPhotos();
    };
    img.onerror = function () { p.state = "error"; renderPhotos(); };
    img.src = p.url;
  }
  function photoAdd(files) {
    Array.prototype.forEach.call(files, function (f) {
      if (!/^image\//.test(f.type)) return;
      var p = {id: ++photoSeq, name: f.name, url: URL.createObjectURL(f), state: "wait"};
      PHOTOS.push(p); photoSel = p.id; touched = true; photoAnalyze(p);
    });
    renderPhotos();
  }
  function photoBadge(p) {
    if (p.state === "wait") return ["", "분석 중"];
    if (p.state === "error") return ["crit", "열 수 없음"];
    if (!p.q.ok) return ["warn", "판정 안 함"];
    var n = p.r.boxes.length;
    return n ? ["warn", "의심 " + n + "곳"] : ["ok", "찾은 것 없음"];
  }
  function photoFound() {
    var f = {};
    PHOTOS.forEach(function (p) { if (p.r) p.r.boxes.forEach(function (b) { f[FOUND[b.kind]] = (f[FOUND[b.kind]] || 0) + 1; }); });
    return f;
  }
  function usable() { return PHOTOS.filter(function (p) { return p.state === "done" && p.q.ok; }); }
  function total(used, k) { return used.reduce(function (a, p) { return a + p.r[k]; }, 0); }
  function renderPhotos() {
    var cur = PHOTOS.filter(function (p) { return p.id === photoSel; })[0] || PHOTOS[PHOTOS.length - 1];
    $("pgallery").innerHTML = PHOTOS.map(function (p) {
      var b = photoBadge(p);
      return '<div class="pthumb" role="button" tabindex="0" data-id="' + p.id + '"' + (cur && p.id === cur.id ? ' aria-current="true"' : "") + '><img src="' + p.url + '" alt="' + esc(p.name) + '">' +
        '<span class="tag ' + b[0] + '">' + b[1] + "</span>" + (p.q && !p.q.ok ? '<span class="why">' + esc(p.q.why.join(", ")) + "</span>" : "") +
        '<button class="px" type="button" data-del="' + p.id + '" aria-label="사진 빼기"><svg class="ic"><use href="#i-close"/></svg></button></div>';
    }).join("");
    $("pview").hidden = !cur;
    if (cur) {
      $("pviewImg").src = cur.url;
      $("pboxes").innerHTML = ((cur.r && cur.r.boxes) || []).map(function (b) {
        var w = Math.max(b.w, 0.02), h = Math.max(b.h, 0.02), x = b.x + b.w / 2 - w / 2, y = b.y + b.h / 2 - h / 2;  // 작은 상자도 보이게
        return '<div class="pbox ' + b.kind + '" style="left:' + (x * 100).toFixed(2) + "%;top:" + (y * 100).toFixed(2) + "%;width:" + (w * 100).toFixed(2) + "%;height:" + (h * 100).toFixed(2) + '%"><span>' + esc(b.label) + "</span></div>";
      }).join("");
    }
    renderPhotoResult(); renderChecks();
  }
  function renderPhotoResult() {
    var done = PHOTOS.filter(function (p) { return p.state === "done"; }), used = usable(), out = [];
    $("resultCard").hidden = !PHOTOS.length;
    if (!PHOTOS.length) return;
    out.push('<p class="muted">사진 ' + PHOTOS.length + "장 중 " + used.length + "장 분석" + (done.length > used.length ? " · " + (done.length - used.length) + "장은 다시 찍기" : "") + "</p>");
    if (used.length) {
      var dark = used.some(function (p) { return p.r.darkBoard; }), dn = total(used, "dust"), sn = total(used, "stain");
      out.push(dn + sn ? '<div class="verdict warn"><span class="head">의심되는 곳 ' + (dn + sn) + "곳</span><span>먼지 " + dn + " · 얼룩 " + sn + " · 직접 보고 맞으면 아래에서 체크</span></div>"
        : '<div class="verdict ok"><span class="head">의심되는 곳 없음</span></div>');
      if (dark) out.push('<p class="muted small">어두운 기판은 얼룩을 보지 않음</p>');
    }
    $("presult").innerHTML = out.join("");
  }
  function renderChecks() {
    var found = photoFound();
    $("checks").innerHTML = CHECKS.board.groups.map(function (g) {
      return "<h3>" + g[0] + "</h3>" + g[1].map(function (it) {
        return '<label><input type="checkbox" data-id="' + it[0] + '" data-w="' + it[2] + '"' + (it[3] ? ' data-loose="1"' : "") + (photoUser[it[0]] ? " checked" : "") + "><span>" + esc(it[1]) +
          (found[it[0]] ? '<span class="tag warn">사진에서 의심</span>' : "") + "</span></label>";
      }).join("");
    }).join("");
    photoCalc();
  }
  function photoCalc() {
    var score = 0, loose = 0, fan = false;
    $("checks").querySelectorAll("input:checked").forEach(function (c) { if (c.dataset.loose) { loose++; fan = fan || c.dataset.id === "fan"; } else score += +c.dataset.w; });
    var bx = $("photoBox"), redo = "전원을 끄고 전원 선을 뽑은 뒤, 금속 케이스를 한 번 만져 정전기를 빼세요. 체크한 부품과 선을 ‘딸깍’ 할 때까지 다시 꽂으세요." +
      (fan ? " CPU 쿨러 팬 선은 꼭 꽂고 켜세요." : "");
    if (score >= 3) { bx.className = "verdict crit"; bx.innerHTML = '<span class="head">위험</span><span>' + CHECKS.board.crit + "</span>" + (loose ? "<span>" + redo + "</span>" : ""); }
    else if (loose) { bx.className = "verdict warn"; bx.innerHTML = '<span class="head">다시 꽂기</span><span>' + redo + "</span>"; }
    else if (score >= 1) { bx.className = "verdict warn"; bx.innerHTML = '<span class="head">점검 필요</span><span>당장 위험한 손상은 아닙니다. PC 청진기 진단 결과의 온도 항목과 함께 확인하세요.</span>'; }
    else { bx.className = "verdict ok"; bx.innerHTML = '<span class="head">이상 없음</span>'; }
    queueResult();
  }

  $("checks").addEventListener("change", function (e) { var c = e.target; photoUser[c.dataset.id] = c.checked; touched = true; photoCalc(); });
  ["shot", "pick"].forEach(function (id) { $(id).addEventListener("change", function (e) { photoAdd(e.target.files); e.target.value = ""; }); });
  $("pgallery").addEventListener("click", function (e) {
    var del = e.target.closest("[data-del]"), card = e.target.closest("[data-id]");
    if (del) {
      var id = +del.dataset.del, p = PHOTOS.filter(function (x) { return x.id === id; })[0];
      URL.revokeObjectURL(p.url); PHOTOS.splice(PHOTOS.indexOf(p), 1); touched = true;
    } else if (card) photoSel = +card.dataset.id;
    renderPhotos();
  });
  $("pgallery").addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target.dataset.id) { e.preventDefault(); photoSel = +e.target.dataset.id; renderPhotos(); } });

  // ---------- PC 연결 ----------
  var sendChain = Promise.resolve(), sent = "";
  function pill(cls, text) { var p = $("linkPill"); p.className = "pill " + cls; p.textContent = text; p.hidden = false; }
  function send(obj) {
    var me = LINK;
    sendChain = sendChain.then(function () {
      if (me !== LINK) return;
      return Link.seal(me.key, "pc", obj).then(function (d) {
        return fetch("api/r/" + me.room + "/pc", {method: "POST", body: d, headers: {"Content-Type": "text/plain"}, cache: "no-store"});
      }).then(function (r) {
        if (r.status === 404) { lost(); return; }
        return r.ok && r.json().then(function (j) { if (j.peer && me === LINK) pill("on", "PC 연결됨"); });
      }, function () { toast("PC로 보내지 못했습니다. 인터넷 연결을 확인하세요."); });
    });
  }
  function queueResult() {
    if (!LINK || !touched) return;
    clearTimeout(queueResult.timer); queueResult.timer = setTimeout(sendResult, 400);
  }
  function sendResult() {
    var used = usable(), checked = {};
    if (!LINK) return;
    $("checks").querySelectorAll("input").forEach(function (c) { checked[c.dataset.id] = c.checked; });
    var msg = {t: "result", type: "board", checked: checked, photos: PHOTOS.length, used: used.length, found: {dust: total(used, "dust"), stain: total(used, "stain")}};
    var s = JSON.stringify(msg);
    if (sent === s) return;
    sent = s; send(msg);
  }
  function lost() {
    if (!LINK) return;
    LINK = null; sent = "";
    try { sessionStorage.removeItem("pcs-link"); } catch (e) {}
    pill("off", "PC 연결 끊김");
    toast("PC에서 연결이 끝났습니다. 사진 진단은 계속 쓸 수 있습니다.");
  }
  function poll() {
    // PC가 보내는 것은 없음. PC가 연결돼 있는지만 봄
    var me = LINK;
    if (!me) return;
    fetch("api/r/" + me.room + "/phone", {cache: "no-store"}).then(function (r) {
      if (r.status === 404) { lost(); return null; }
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    }).then(function (j) {
      if (!j || me !== LINK) return;
      pill(j.peer ? "on" : "", j.peer ? "PC 연결됨" : "PC 연결 중");
      poll();
    }).catch(function () {
      if (me !== LINK) return;
      pill("off", "다시 연결 중"); setTimeout(poll, 3000);
    });
  }
  function linkStart() {
    var p = Link.parse(location.hash);
    try {
      if (p) sessionStorage.setItem("pcs-link", location.hash); else p = Link.parse(sessionStorage.getItem("pcs-link"));
    } catch (e) {}
    if (location.hash) history.replaceState(null, "", location.pathname);  // 주소창에 키 남기지 않음
    if (!p) return;
    if (!window.crypto || !crypto.subtle) { pill("off", "연결 안 됨"); return; }
    pill("", "PC 연결 중");
    Link.importKey(p.key).then(function (key) {
      LINK = {room: p.room, key: key};
      send({t: "hello"}); poll();
    }, function () { pill("off", "연결 안 됨"); });
  }

  renderPhotos();
  linkStart();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});
})();
