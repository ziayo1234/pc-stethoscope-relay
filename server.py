# 연결 서버: 휴대폰 웹앱 파일 + PC·휴대폰 암호문 전달 (저장·기록 안 함)
import json
import os
import re
import threading
import time
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

WEB = Path(__file__).resolve().parent / "web"
API = re.compile(r"/api/r/([A-Za-z0-9_-]{22})(?:/(pc|phone))?")
DATA = re.compile(rb"[A-Za-z0-9_-]+")
BOXES = ("pc", "phone")  # 받는 쪽
IDLE, WAIT, SEEN = 20 * 60, 20.0, 30.0  # 초
MAX_BODY, MAX_KEEP, MAX_MSGS, MAX_ROOMS, MAX_WAITING = 4000, 20, 400, 500, 300  # 메모리 상한 약 2×20×4KB×500 = 80MB

FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/photo.js": ("photo.js", "text/javascript; charset=utf-8"),
    "/link.js": ("link.js", "text/javascript; charset=utf-8"),
    "/sw.js": ("sw.js", "text/javascript; charset=utf-8"),
    "/manifest.webmanifest": ("manifest.webmanifest", "application/manifest+json"),
    "/icon.svg": ("icon.svg", "image/svg+xml"),
    "/icon-192.png": ("icon-192.png", "image/png"),
    "/icon-512.png": ("icon-512.png", "image/png"),
}
CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; "
       "connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")


# 방마다 받는 쪽 우편함
class Rooms:
    def __init__(self, clock=time.monotonic):
        """복잡도: 시간·공간 O(1)"""
        self.clock, self.cv, self.rooms, self.waiting = clock, threading.Condition(), {}, 0

    def _sweep(self):
        """복잡도: 시간 O(방 수), 공간 O(1)"""
        now = self.clock()
        for k in [k for k, r in self.rooms.items() if now - r["used"] > IDLE]:
            del self.rooms[k]

    def open(self, room):
        """복잡도: 시간 O(방 수), 공간 O(1)"""
        with self.cv:
            self._sweep()
            if room not in self.rooms:
                if len(self.rooms) >= MAX_ROOMS:
                    return False
                self.rooms[room] = {"count": 0, **{b: {"n": 0, "msgs": deque(maxlen=MAX_KEEP), "seen": None} for b in BOXES}}
            self.rooms[room]["used"] = self.clock()
            return True

    def exists(self, room):
        """복잡도: 시간·공간 O(1)"""
        with self.cv:
            return room in self.rooms

    def put(self, room, box, data):
        """복잡도: 시간 O(방 수), 공간 O(1)"""
        # 없는 방 None, 너무 많음 0
        with self.cv:
            self._sweep()
            r = self.rooms.get(room)
            if r is None:
                return None
            if r["count"] >= MAX_MSGS:
                return 0
            b = r[box]
            b["n"] += 1
            b["msgs"].append((b["n"], data))
            r["count"] += 1
            r["used"] = self.clock()
            self.cv.notify_all()
            return b["n"]

    def seen(self, room, box):
        """복잡도: 시간·공간 O(1)"""
        # 받는 쪽이 최근에 받아 갔는지
        with self.cv:
            r = self.rooms.get(room)
            return bool(r and r[box]["seen"] is not None and self.clock() - r[box]["seen"] < SEEN)

    def get(self, room, box, after, wait):
        """복잡도: 시간 O(방 수 + 기다림), 공간 O(MAX_KEEP)"""
        with self.cv:
            end = self.clock() + (wait if self.waiting < MAX_WAITING else 0)  # 기다리는 연결 상한
            self.waiting += 1
            try:
                while True:
                    self._sweep()
                    r = self.rooms.get(room)
                    if r is None:
                        return None
                    now = r["used"] = r[box]["seen"] = self.clock()
                    msgs = [{"n": n, "d": d} for n, d in r[box]["msgs"] if n > after]
                    if msgs or now >= end:
                        other = r[BOXES[1 - BOXES.index(box)]]["seen"]
                        return {"msgs": msgs, "peer": other is not None and now - other < SEEN}
                    self.cv.wait(min(end - now, 5.0))
            finally:
                self.waiting -= 1

    def drop(self, room):
        """복잡도: 시간·공간 O(1)"""
        with self.cv:
            self.rooms.pop(room, None)
            self.cv.notify_all()


# 주소마다 window초에 per번
class Limit:
    def __init__(self, per, window, clock=time.monotonic):
        """복잡도: 시간·공간 O(1)"""
        self.per, self.window, self.clock, self.lock, self.hits = per, window, clock, threading.Lock(), {}

    def ok(self, who):
        """복잡도: 시간 O(per) 상환, 공간 O(주소 수 × per)"""
        now = self.clock()
        with self.lock:
            if len(self.hits) > 5000:
                self.hits = {k: q for k, q in self.hits.items() if q and now - q[-1] < self.window}
            q = self.hits.setdefault(who, deque())
            while q and now - q[0] >= self.window:
                q.popleft()
            if len(q) >= self.per:
                return False
            q.append(now)
            return True


class Handler(BaseHTTPRequestHandler):
    rooms, limit, rooms_limit = Rooms(), Limit(240, 60), Limit(30, 600)  # 요청 1분 240번, 새 방 10분 30개
    server_version, sys_version = "relay", ""
    timeout = 30  # 아무것도 안 보내고 붙잡는 연결 끊기

    def log_message(self, *args):
        """복잡도: 시간·공간 O(1)"""

    def _who(self):
        """복잡도: 시간·공간 O(헤더 길이)"""
        # 프록시가 맨 뒤에 붙인 주소 (앞쪽은 보내는 쪽이 꾸밀 수 있음)
        fwd = self.headers.get("X-Forwarded-For")
        return fwd.split(",")[-1].strip() if fwd else self.client_address[0]

    def _send(self, code, body, ctype="application/json", cache="no-store"):
        """복잡도: 시간·공간 O(본문 크기)"""
        self.send_response(code)
        for k, v in (("Content-Type", ctype), ("Content-Length", str(len(body))), ("Cache-Control", cache),
                     ("X-Content-Type-Options", "nosniff"), ("Referrer-Policy", "no-referrer"),
                     ("Content-Security-Policy", CSP), ("Permissions-Policy", "camera=(self), microphone=(), geolocation=()")):
            self.send_header(k, v)
        if self.headers.get("X-Forwarded-Proto") == "https":
            self.send_header("Strict-Transport-Security", "max-age=31536000")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code, obj):
        """복잡도: 시간·공간 O(본문 크기)"""
        self._send(code, json.dumps(obj).encode())

    def _api(self):
        """복잡도: 시간·공간 O(1)"""
        # (방, 받는 쪽), API 아님 None, 막힘 False
        m = API.fullmatch(urlsplit(self.path).path)
        if not m:
            return None
        if not self.limit.ok(self._who()):
            self._json(429, {"error": "busy"})
            return False
        return m.group(1), m.group(2)

    def do_GET(self):
        """복잡도: 시간 O(파일 크기 + 기다림), 공간 O(파일 크기)"""
        api = self._api()
        if api is None:
            f = FILES.get(urlsplit(self.path).path)
            try:
                return self._send(200, (WEB / f[0]).read_bytes(), f[1], "no-cache")
            except (TypeError, OSError):
                return self._json(404, {"error": "none"})
        if not api:
            return
        room, box = api
        q = parse_qs(urlsplit(self.path).query).get("after", ["0"])[0]
        got = self.rooms.get(room, box, int(q) if q.isdigit() and len(q) < 9 else 0, WAIT) if box else None
        self._json(200, got) if got else self._json(404, {"error": "room"})

    def do_PUT(self):
        """복잡도: 시간 O(방 수), 공간 O(1)"""
        api = self._api()
        if api is None or (api and api[1]):
            self._json(404, {"error": "none"})
        elif api:
            if not self.rooms.exists(api[0]) and not self.rooms_limit.ok(self._who()):
                self._json(429, {"error": "busy"})
            else:
                self._json(200, {"ok": True}) if self.rooms.open(api[0]) else self._json(503, {"error": "full"})

    def do_POST(self):
        """복잡도: 시간 O(본문 크기 + 방 수), 공간 O(본문 크기)"""
        api = self._api()
        if api is None:
            return self._json(404, {"error": "none"})
        if not api:
            return
        room, box = api
        size = self.headers.get("Content-Length", "")
        if not box or not size.isdigit() or not 0 < int(size) <= MAX_BODY:
            return self._json(400, {"error": "size"})
        data = self.rfile.read(int(size))
        if not DATA.fullmatch(data):
            return self._json(400, {"error": "data"})
        n = self.rooms.put(room, box, data.decode())
        if n is None:
            self._json(404, {"error": "room"})
        else:
            self._json(200, {"n": n, "peer": self.rooms.seen(room, box)}) if n else self._json(429, {"error": "many"})

    def do_DELETE(self):
        """복잡도: 시간·공간 O(1)"""
        api = self._api()
        if api is None or (api and api[1]):
            self._json(404, {"error": "none"})
        elif api:
            self.rooms.drop(api[0])
            self._json(200, {"ok": True})


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        """복잡도: 시간·공간 O(1)"""
        # 기본은 오류와 접속 주소를 출력함 → 기록 안 함


def serve(port, host="0.0.0.0"):
    """복잡도: 시간·공간 O(1)"""
    return Server((host, port), Handler)


if __name__ == "__main__":
    serve(int(os.environ.get("PORT", "8950"))).serve_forever()
