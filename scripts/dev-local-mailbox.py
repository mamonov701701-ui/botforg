"""Loopback-only SMTP receiver and browser mailbox for Development QA.

Messages live in memory and are never forwarded or written to ordinary logs.
"""

from __future__ import annotations

from email import policy
from email.parser import BytesParser
from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import re
import socketserver
import threading
from urllib.parse import urlsplit


SMTP_ADDRESS = ("127.0.0.1", 1025)
WEB_ADDRESS = ("127.0.0.1", 8025)
MAX_MESSAGE_BYTES = 1024 * 1024
MAX_MESSAGES = 100
_messages: list[bytes] = []
_lock = threading.Lock()


class SmtpServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


class SmtpHandler(socketserver.StreamRequestHandler):
    def handle(self) -> None:
        self.wfile.write(b"220 BotForg local development mailbox\r\n")
        data = bytearray()
        in_data = False
        oversized = False
        while line := self.rfile.readline():
            if in_data:
                if line == b".\r\n":
                    if oversized:
                        self.wfile.write(b"552 message too large\r\n")
                    else:
                        with _lock:
                            _messages.append(bytes(data))
                            del _messages[:-MAX_MESSAGES]
                        self.wfile.write(b"250 accepted locally\r\n")
                    data.clear()
                    in_data = oversized = False
                elif not oversized:
                    part = line[1:] if line.startswith(b"..") else line
                    if len(data) + len(part) > MAX_MESSAGE_BYTES:
                        oversized = True
                    else:
                        data.extend(part)
                continue
            command = line.split(b" ", 1)[0].upper().strip()
            if command in {b"EHLO", b"HELO"}:
                self.wfile.write(b"250-BotForg local development mailbox\r\n250 OK\r\n")
            elif command in {b"MAIL", b"RCPT", b"RSET", b"NOOP"}:
                self.wfile.write(b"250 OK\r\n")
            elif command == b"DATA":
                data.clear()
                oversized = False
                in_data = True
                self.wfile.write(b"354 end with <CRLF>.<CRLF>\r\n")
            elif command == b"QUIT":
                self.wfile.write(b"221 bye\r\n")
                break
            else:
                self.wfile.write(b"502 unsupported\r\n")


def _parsed(raw: bytes):
    return BytesParser(policy=policy.default).parsebytes(raw)


class WebHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args) -> None:
        # Paths may contain sensitive data; do not log requests.
        pass

    def _reply(self, status: int, body: str, content_type: str = "text/html; charset=utf-8") -> None:
        encoded = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path == "/healthz":
            self._reply(200, json.dumps({"service": "botforg-dev-local-mailbox", "status": "ok"}), "application/json")
            return
        with _lock:
            messages = list(_messages)
        if path == "/":
            items = []
            for index, raw in reversed(list(enumerate(messages, 1))):
                msg = _parsed(raw)
                items.append(
                    f'<li><a href="/messages/{index}">{escape(str(msg.get("Subject", "Без темы")))}</a>'
                    f' — {escape(str(msg.get("To", "")))}</li>'
                )
            body = "<h1>BotForg — локальная тестовая почта</h1><p>Письма хранятся только в памяти этого процесса.</p><ul>" + "".join(items) + "</ul>"
            self._reply(200, body)
            return
        match = re.fullmatch(r"/messages/(\d+)", path)
        if match:
            index = int(match.group(1)) - 1
            if index < 0 or index >= len(messages):
                self._reply(404, "Сообщение не найдено")
                return
            msg = _parsed(messages[index])
            plain = msg.get_body(preferencelist=("plain",))
            body_text = plain.get_content() if plain else msg.get_content()
            links = []
            for url in re.findall(r"https?://[^\s<>]+", body_text):
                parsed = urlsplit(url)
                if parsed.hostname in {"localhost", "127.0.0.1"} and parsed.port == 5173:
                    links.append(f'<p><a href="{escape(url, quote=True)}">Открыть ссылку подтверждения</a></p>')
            body = (
                '<p><a href="/">← К списку</a></p>'
                f'<h1>{escape(str(msg.get("Subject", "Без темы")))}</h1>'
                f'<p>Кому: {escape(str(msg.get("To", "")))}</p>'
                + "".join(links) + f"<pre>{escape(body_text)}</pre>"
            )
            self._reply(200, body)
            return
        self._reply(404, "Страница не найдена")


def main() -> None:
    with SmtpServer(SMTP_ADDRESS, SmtpHandler) as smtp, ThreadingHTTPServer(WEB_ADDRESS, WebHandler) as web:
        smtp_thread = threading.Thread(target=smtp.serve_forever, daemon=True)
        smtp_thread.start()
        try:
            web.serve_forever()
        finally:
            smtp.shutdown()
            smtp_thread.join(timeout=2)


if __name__ == "__main__":
    main()
