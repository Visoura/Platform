import asyncio
import json
import time

CLIENT_QUEUE = 8


class Hub:
    def __init__(self):
        self.clients = set()
        self.loop = None
        self.bytes_sent = 0
        self.dropped = 0

    def attach(self, loop):
        self.loop = loop

    def publish(self, message):
        if self.loop and self.clients:
            self.loop.call_soon_threadsafe(self._fanout, message)

    def publish_json(self, data):
        self.publish(json.dumps(data))

    def _fanout(self, message):
        for q in self.clients:
            if q.full():
                q.get_nowait()
                self.dropped += 1
            q.put_nowait(message)

    async def serve(self, ws):
        q = asyncio.Queue(CLIENT_QUEUE)
        self.clients.add(q)
        sender = asyncio.create_task(self._send(ws, q))
        try:
            while True:
                message = await ws.receive_json()
                if message.get("type") == "ping":
                    await ws.send_json({"type": "pong", "client": message["t"], "server": time.time() * 1000})
        except Exception:
            pass
        finally:
            sender.cancel()
            self.clients.discard(q)

    async def _send(self, ws, q):
        while True:
            message = await q.get()
            if isinstance(message, bytes):
                await ws.send_bytes(message)
            else:
                await ws.send_text(message)
            self.bytes_sent += len(message)
