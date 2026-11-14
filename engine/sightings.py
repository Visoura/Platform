import queue
import sqlite3
import threading
import time
import uuid

from .settings import DB_PATH, SIGHTING_GRACE_S

SCHEMA = """
create table if not exists sightings (
    id text primary key, target_id text, target_name text, camera text, started_at real, ended_at real
)
"""


def connect():
    db = sqlite3.connect(DB_PATH, check_same_thread=False)
    db.execute(SCHEMA)
    return db


class SyncWriter:
    def __init__(self, metrics):
        self.db = connect()
        self.metrics = metrics

    def write(self, sql, params):
        self.db.execute(sql, params)
        self.db.commit()
        self.metrics.count("db_commits")

    def close(self):
        self.db.close()


class BatchedWriter:
    def __init__(self, metrics, interval=0.5):
        self.db = connect()
        self.metrics = metrics
        self.interval = interval
        self.queue = queue.Queue()
        self.running = True
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

    def write(self, sql, params):
        self.queue.put((sql, params))

    def _flush(self):
        batch = []
        while not self.queue.empty():
            batch.append(self.queue.get())
        if batch:
            with self.db:
                for sql, params in batch:
                    self.db.execute(sql, params)
            self.metrics.count("db_commits")

    def _loop(self):
        while self.running:
            time.sleep(self.interval)
            self._flush()
        self._flush()

    def close(self):
        self.running = False
        self.thread.join()
        self.db.close()


class SightingLog:
    def __init__(self, writer, on_open):
        self.writer = writer
        self.on_open = on_open
        self.open = {}

    def update(self, camera, visible, now):
        for target_id, name in visible.items():
            key = (camera, target_id)
            if key in self.open:
                self.open[key]["last_seen"] = now
                continue
            sighting_id = uuid.uuid4().hex
            self.open[key] = {"id": sighting_id, "last_seen": now}
            self.writer.write("insert into sightings values (?, ?, ?, ?, ?, null)",
                              (sighting_id, target_id, name, camera, now))
            self.on_open(camera, target_id, name)
        for key, state in list(self.open.items()):
            if key[0] == camera and key[1] not in visible and now - state["last_seen"] >= SIGHTING_GRACE_S:
                self._close(key)

    def _close(self, key):
        state = self.open.pop(key)
        self.writer.write("update sightings set ended_at = ? where id = ?", (state["last_seen"], state["id"]))

    def close(self):
        for key in list(self.open):
            self._close(key)
        self.writer.close()


def history(target_id):
    db = connect()
    rows = db.execute("select camera, started_at, ended_at from sightings where target_id = ? order by started_at desc",
                      (target_id,)).fetchall()
    db.close()
    return [{"camera": c, "started_at": s, "ended_at": e} for c, s, e in rows]
