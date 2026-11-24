// 휴대폰 연결: 방 번호·키, 암호화(AES-GCM). PC 앱(app/ui30)과 휴대폰 웹앱이 같은 파일을 씀
(function (root) {
  "use strict";
  var ID = /^[A-Za-z0-9_-]{22}$/, KEY = /^[A-Za-z0-9_-]{43}$/;

  function b64(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function unb64(str) {
    var s = atob(str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4)), out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function random(n) { return crypto.getRandomValues(new Uint8Array(n)); }

  // 새 연결: 방 번호(서버가 봄)와 키(QR의 # 뒤, 서버로 안 감)
  function pair() { return {room: b64(random(16)), key: b64(random(32))}; }
  function parse(hash) {
    var q = {};
    String(hash || "").replace(/^#/, "").split("&").forEach(function (kv) { var i = kv.indexOf("="); if (i > 0) q[kv.slice(0, i)] = kv.slice(i + 1); });
    return ID.test(q.r || "") && KEY.test(q.k || "") ? {room: q.r, key: q.k} : null;
  }
  function address(base, p) { return base + "/#r=" + p.room + "&k=" + p.key; }
  function importKey(text) { return crypto.subtle.importKey("raw", unb64(text), "AES-GCM", false, ["encrypt", "decrypt"]); }

  // to = 받는 쪽(pc·phone), 암호문에 묶음
  function seal(key, to, obj) {
    var iv = random(12);
    return crypto.subtle.encrypt({name: "AES-GCM", iv: iv, additionalData: new TextEncoder().encode(to)}, key, new TextEncoder().encode(JSON.stringify(obj)))
      .then(function (ct) { var out = new Uint8Array(12 + ct.byteLength); out.set(iv); out.set(new Uint8Array(ct), 12); return b64(out); });
  }
  function open(key, to, text) {
    var raw;
    try { raw = unb64(text); } catch (e) { return Promise.resolve(null); }
    if (raw.length < 29) return Promise.resolve(null);
    return crypto.subtle.decrypt({name: "AES-GCM", iv: raw.slice(0, 12), additionalData: new TextEncoder().encode(to)}, key, raw.slice(12))
      .then(function (pt) {
        try { var o = JSON.parse(new TextDecoder().decode(pt)); return o && typeof o === "object" && !Array.isArray(o) ? o : null; } catch (e) { return null; }
      }, function () { return null; });
  }

  var api = {pair: pair, parse: parse, address: address, importKey: importKey, seal: seal, open: open};
  root.Link = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(this);
