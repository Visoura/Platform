import threading


class LatestFrameReader:
    def __init__(self, reader, on_drop):
        self.reader = reader
        self.on_drop = on_drop
        self.latest = None
        self.done = False
        self.cond = threading.Condition()
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

    def _loop(self):
        while not self.done:
            item = self.reader.read()
            with self.cond:
                if item is None:
                    self.done = True
                elif self.latest is not None:
                    self.on_drop()
                self.latest = item
                self.cond.notify()

    def read(self):
        with self.cond:
            while self.latest is None and not self.done:
                self.cond.wait()
            item, self.latest = self.latest, None
            return item

    def close(self):
        self.done = True
        self.thread.join(timeout=2)
        self.reader.close()
