import queue
import threading

DONE = object()


def run_sequential(groups, stop):
    stages = [stage for group in groups for stage in group]
    while not stop.is_set():
        item = None
        for stage in stages:
            item = stage(item)
        if item is DONE:
            return


def run_pipelined(groups, stop, depth=2):
    queues = [queue.Queue(depth) for _ in groups[1:]]

    def put(q, item):
        while not stop.is_set():
            try:
                q.put(item, timeout=0.1)
                return
            except queue.Full:
                pass

    def get(q):
        while not stop.is_set():
            try:
                return q.get(timeout=0.1)
            except queue.Empty:
                pass
        return DONE

    def worker(i, group):
        inbox = queues[i - 1] if i > 0 else None
        outbox = queues[i] if i < len(queues) else None
        while not stop.is_set():
            item = get(inbox) if inbox else None
            if item is not DONE:
                for stage in group:
                    item = stage(item)
            if outbox:
                put(outbox, item)
            if item is DONE:
                return

    threads = [threading.Thread(target=worker, args=(i, g), daemon=True) for i, g in enumerate(groups)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
