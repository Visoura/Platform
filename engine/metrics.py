import threading
import time
from collections import Counter, defaultdict, deque
from contextlib import contextmanager

import numpy as np
import psutil
import torch

from .settings import DEVICE


class Metrics:
    def __init__(self):
        self.lock = threading.Lock()
        self.reset()

    def reset(self):
        with self.lock:
            self.stages = defaultdict(lambda: deque(maxlen=600))
            self.totals = Counter()
            self.stage_total = Counter()
            self.latency = deque(maxlen=600)
            self.started = time.time()
            self.rates = {}
            self.system = {}
            self.cpu_samples = []
            self._last = (time.time(), Counter())

    @contextmanager
    def time(self, stage):
        start = time.perf_counter()
        yield
        elapsed = time.perf_counter() - start
        with self.lock:
            self.stages[stage].append(elapsed)
            self.stage_total[stage] += elapsed

    def count(self, name, n=1):
        with self.lock:
            self.totals[name] += n

    def add_latency(self, seconds):
        with self.lock:
            self.latency.append(seconds)

    def tick(self):
        now = time.time()
        system = system_stats()
        with self.lock:
            self.system = system
            self.cpu_samples.append(system["cpu_percent"])
            then, before = self._last
            dt = max(now - then, 1e-6)
            self.rates = {k: (v - before[k]) / dt for k, v in self.totals.items()}
            self._last = (now, Counter(self.totals))

    def snapshot(self):
        with self.lock:
            stages = {name: summarize(values) for name, values in self.stages.items()}
            return {
                "uptime": time.time() - self.started,
                "stages": stages,
                "stage_total": dict(self.stage_total),
                "totals": dict(self.totals),
                "rates": dict(self.rates),
                "latency": summarize(self.latency),
                "system": self.system,
                "cpu_avg": float(np.mean(self.cpu_samples)) if self.cpu_samples else 0.0,
            }


def summarize(values):
    if not values:
        return {"p50": 0, "p95": 0, "mean": 0, "n": 0}
    arr = np.fromiter(values, float) * 1000
    return {"p50": float(np.percentile(arr, 50)), "p95": float(np.percentile(arr, 95)),
            "mean": float(arr.mean()), "n": len(arr)}


_process = psutil.Process()
_children = {}


def watch_process(pid):
    _children[pid] = psutil.Process(pid)


def unwatch_process(pid):
    _children.pop(pid, None)


def system_stats():
    cpu = _process.cpu_percent()
    rss = _process.memory_info().rss
    for pid, p in list(_children.items()):
        try:
            cpu += p.cpu_percent()
            rss += p.memory_info().rss
        except psutil.NoSuchProcess:
            _children.pop(pid, None)
    stats = {"cpu_percent": cpu, "rss_mb": rss / 1e6, "cores": psutil.cpu_count(), "gpu_util": None, "gpu_mem_mb": None}
    if DEVICE == "cuda":
        stats.update(nvidia_stats())
    elif DEVICE == "mps":
        stats["gpu_mem_mb"] = torch.mps.driver_allocated_memory() / 1e6
    return stats


def nvidia_stats():
    try:
        import pynvml
        pynvml.nvmlInit()
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        return {"gpu_util": pynvml.nvmlDeviceGetUtilizationRates(handle).gpu,
                "gpu_mem_mb": pynvml.nvmlDeviceGetMemoryInfo(handle).used / 1e6}
    except Exception:
        return {}
