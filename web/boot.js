// 안 켜질 때 (데스크톱만): 증상 고르기 → 할 일 하나씩 → 해결됨 또는 수리점
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]; }); }

  // 단계: t 제목, how 방법, open 옆판 열기, photo 사진 진단 점검표로, ask 고르면 나오는 한 줄
  var RAM = {t: "램 다시 꽂기", how: "램 양쪽 걸쇠를 열어 빼고, 홈을 맞춰 ‘딸깍’ 소리가 날 때까지 꽂으세요. 두 개면 하나만 꽂고 켜 보세요.", open: true, photo: true};
  var USB = {t: "USB 장치 빼기", how: "키보드·마우스만 남기고 USB 메모리·외장하드·프린터를 뺀 뒤 켜 보세요."};
  var UNDO = {t: "바꾼 부품 되돌리기", how: "최근에 부품을 바꾸거나 더했다면 원래대로 해 놓고 켜 보세요."};
  var BOOT = [
    {key: "dead", name: "아무 반응 없음", sub: "불빛도 팬도 움직이지 않음", steps: [
      {t: "전원선 확인", how: "본체 뒤 전원선을 끝까지 꽂고, 멀티탭 대신 벽 콘센트에 바로 꽂으세요."},
      {t: "파워 스위치 확인", how: "본체 뒤 전원선 꽂는 곳 옆 스위치를 ‘I’ 쪽으로 누르세요. ‘O’는 꺼짐입니다."},
      {t: "남은 전기 빼기", how: "전원선을 뽑고 전원 버튼을 15초 누른 뒤, 다시 꽂고 켜 보세요."},
      {t: "메인보드 전원선 확인", how: "넓은 24핀 선과 CPU 옆 8핀 선이 ‘딸깍’ 할 때까지 꽂혀 있는지 보세요.", open: true, photo: true}
    ], shop: "“전원이 아예 안 들어와요. 파워랑 전원 버튼 선 점검해 주세요.”"},
    {key: "dark", name: "팬은 도는데 화면이 안 나옴", sub: "본체는 켜지고 모니터가 까맣거나 ‘신호 없음’", steps: [
      {t: "모니터 확인", how: "모니터 전원 불빛이 켜져 있는지, 모니터 메뉴의 ‘입력’이 꽂은 단자(HDMI·DP)와 같은지 보세요."},
      {t: "모니터 선 위치", how: "그래픽카드가 있으면 모니터 선을 본체 뒤 아래쪽 가로 단자(그래픽카드)에 꽂으세요. 위쪽 세로 단자는 메인보드입니다."},
      {t: "모니터 선 다시 꽂기", how: "선 양쪽 끝을 뺐다가 끝까지 꽂으세요. 다른 선이 있으면 바꿔 보세요."},
      {t: "삐 소리 확인", how: "켤 때 나는 소리를 고르세요.", ask: [
        ["삐 한 번", "정상 신호입니다. 모니터와 선 쪽을 다시 확인하세요."],
        ["삐 소리 반복", "램이나 그래픽카드 문제일 때 주로 납니다. 다음 단계로 넘어가세요."],
        ["소리 없음", "스피커가 없는 본체도 많습니다. 다음 단계로 넘어가세요."]]},
      RAM,
      {t: "메인보드 불빛 확인", how: "메인보드에 CPU·DRAM·VGA·BOOT 작은 불빛이 있으면 켜진 곳을 고르세요.", open: true, ask: [
        ["CPU", "CPU 옆 8핀 전원선과 CPU 쿨러를 확인하세요. 그대로면 수리점 점검이 필요합니다."],
        ["DRAM", "램 문제입니다. 램을 다시 꽂고, 두 개면 하나씩 꽂아 켜 보세요."],
        ["VGA", "그래픽카드 문제입니다. 다음 단계에서 보조전원 선과 카드를 확인하세요."],
        ["BOOT", "저장장치를 못 찾는 상태입니다. 저장장치 선을 다시 꽂으세요."],
        ["불빛 없음", "이 불빛이 없는 메인보드도 많습니다. 다음 단계로 넘어가세요."]]},
      {t: "그래픽카드 확인", how: "그래픽카드 보조전원 선이 꽂혀 있는지, 카드 한쪽이 들려 있지 않은지 보세요.", open: true, photo: true}
    ], shop: "“팬은 도는데 화면이 안 나와요. 램이랑 그래픽카드 점검해 주세요.”"},
    {key: "off", name: "켜졌다가 바로 꺼짐", sub: "몇 초 만에 꺼지거나 꺼졌다 켜지기를 반복", steps: [
      {t: "CPU 쿨러 확인", how: "CPU 쿨러 팬 선이 메인보드 ‘CPU_FAN’에 꽂혀 있는지, 쿨러가 흔들리지 않게 붙어 있는지 보세요.", open: true, photo: true},
      {t: "CPU 전원선 확인", how: "CPU 옆 8핀 전원선을 끝까지 꽂으세요.", open: true, photo: true},
      RAM, UNDO
    ], shop: "“켜졌다가 바로 꺼져요. 파워랑 CPU 쿨러 점검해 주세요.”"},
    {key: "logo", name: "로고나 검은 화면 글자에서 멈춤", sub: "Windows가 시작되지 않음", steps: [
      USB,
      {t: "화면 글자 찍어 두기", how: "화면에 영어 글자가 있으면 사진으로 찍어 두세요. 수리점에 보여 주면 원인을 빨리 찾습니다."},
      {t: "저장장치 선 다시 꽂기", how: "저장장치(SSD·하드디스크)의 데이터 선과 전원 선을 뺐다가 끝까지 꽂으세요. 메인보드에 바로 꽂는 작은 SSD는 고정 나사를 확인하세요.", open: true, photo: true}
    ], shop: "“로고에서 안 넘어가요. 저장장치 점검하고 자료 백업 부탁드려요.”"},
    {key: "loop", name: "파란 화면이나 자동 복구가 반복", sub: "켜질 때마다 같은 화면", steps: [
      USB,
      {t: "시동 복구", how: "‘자동 복구’ 화면에서 고급 옵션 → 문제 해결 → 고급 옵션 → 시동 복구를 누르세요. 파일은 지워지지 않습니다. ‘이 PC 초기화’는 파일이 지워질 수 있으니 누르지 마세요."},
      UNDO
    ], shop: "“파란 화면이 계속 떠요. 저장장치랑 램 점검하고 자료 백업 부탁드려요.”"}
  ];
  var S = {sym: null, i: 0, end: null, asked: {}};

  function sym() { return BOOT.filter(function (b) { return b.key === S.sym; })[0]; }
  function render() {
    var box = $("boot"), b = sym();
    if (!b) {
      box.innerHTML = '<p class="tip">전원 버튼을 누르면</p><div class="syms">' + BOOT.map(function (x) {
        return '<button class="sym" type="button" data-sym="' + x.key + '"><b>' + esc(x.name) + "</b><span>" + esc(x.sub) + '</span><svg class="ic" aria-hidden="true"><use href="#i-next"/></svg></button>';
      }).join("") + "</div>";
      return;
    }
    var head = '<div class="bstep-top"><b>' + esc(b.name) + '</b><button class="linkbtn" type="button" data-act="home">다시 고르기</button></div>';
    if (S.end === "ok") {
      box.innerHTML = head + '<div class="verdict ok"><span class="head">해결됨</span><span>같은 증상이 다시 생기면 PC 청진기로 진단하세요.</span></div>' +
        '<button class="btn" type="button" data-act="home">처음으로</button>';
      return;
    }
    if (S.end === "shop") {
      box.innerHTML = head + '<div class="verdict crit"><span class="head">수리점 필요</span><span>혼자 할 수 있는 것은 다 해 봤습니다. 전원을 끄고 수리점에 맡기세요.</span></div>' +
        '<section class="card"><h2>수리점에 할 말</h2><p class="quote">' + esc(b.shop) + '</p><p class="muted small">해 본 것</p><ol class="tried">' +
        b.steps.map(function (st) { return "<li>" + esc(st.t) + "</li>"; }).join("") + "</ol></section>" +
        '<button class="btn" type="button" data-act="home">처음으로</button>';
      return;
    }
    var st = b.steps[S.i], n = b.steps.length, pick = S.asked[S.sym + S.i];
    var ans = st.ask && pick != null ? st.ask[pick][1] : "";
    box.innerHTML = head +
      '<div class="pbar" aria-hidden="true"><i style="width:' + Math.round((S.i + 1) / n * 100) + '%"></i></div>' +
      '<section class="card bstep"><div class="bstep-top"><span class="prog">' + (S.i + 1) + " / " + n + "</span>" + (st.open ? '<span class="tag warn">옆판 열기</span>' : "") + "</div>" +
      "<h2>" + esc(st.t) + '</h2><p class="how">' + esc(st.how) + "</p>" +
      (st.open ? '<p class="safe">열기 전: 전원선 뽑기 · 금속 케이스 한 번 만지기</p>' : "") +
      (st.ask ? '<div class="asks">' + st.ask.map(function (a, k) { return '<button class="ask" type="button" data-ask="' + k + '" aria-pressed="' + (pick === k) + '">' + esc(a[0]) + "</button>"; }).join("") + "</div>" : "") +
      (ans ? '<p class="answer">' + esc(ans) + "</p>" : "") +
      (st.photo ? '<button class="linkbtn" type="button" data-act="photo">사진으로 확인하기</button>' : "") + "</section>" +
      '<div class="bacts"><button class="btn primary" type="button" data-act="ok">해결됨</button><button class="btn" type="button" data-act="next">안 됨 · 다음</button></div>' +
      (S.i ? '<button class="linkbtn" type="button" data-act="back">이전 단계</button>' : "");
  }

  // 화면 전환: 사진 진단 · 안 켜질 때
  var TITLE = {photo: "사진 진단", boot: "안 켜질 때"};
  function view(v) {
    $("viewPhoto").hidden = v !== "photo"; $("viewBoot").hidden = v !== "boot";
    $("viewTitle").textContent = TITLE[v];
    document.querySelectorAll(".tabbar [data-go]").forEach(function (b) { if (b.dataset.go === v) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    window.scrollTo(0, 0);
  }
  document.querySelector(".tabbar").addEventListener("click", function (e) { var b = e.target.closest("[data-go]"); if (b) view(b.dataset.go); });
  $("boot").addEventListener("click", function (e) {
    var t = e.target.closest("[data-sym],[data-act],[data-ask]");
    if (!t) return;
    if (t.dataset.sym) { S = {sym: t.dataset.sym, i: 0, end: null, asked: S.asked}; }
    else if (t.dataset.ask) S.asked[S.sym + S.i] = +t.dataset.ask;
    else {
      var a = t.dataset.act, b = sym();
      if (a === "home") S = {sym: null, i: 0, end: null, asked: {}};
      else if (a === "ok") S.end = "ok";
      else if (a === "next") { if (S.i < b.steps.length - 1) S.i++; else S.end = "shop"; }
      else if (a === "back") S.i = Math.max(0, S.i - 1);
      else if (a === "photo") {
        var r = document.querySelector('#ptype input[value="board"]');
        if (r && !r.checked) { r.checked = true; r.dispatchEvent(new Event("change", {bubbles: true})); }
        view("photo"); return;
      }
    }
    render();
    if (!t.dataset.ask) window.scrollTo(0, 0);
  });
  render();
})();
