import subprocess
import time

import numpy as np

from ..capabilities import hwaccel
from ..metrics import unwatch_process, watch_process


class FfmpegReader:
    def __init__(self, url, live, width, height):
        self.url = url
        self.live = live
        self.shape = (height, width, 3)
        self.index = -1
        self.proc = self._start()

    def _start(self):
        cmd = ["ffmpeg", "-v", "error", "-hwaccel", hwaccel()]
        if self.url.startswith("rtsp"):
            cmd += ["-rtsp_transport", "tcp"]
        cmd += ["-i", self.url, "-f", "rawvideo", "-pix_fmt", "bgr24", "-"]
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, bufsize=0)
        watch_process(proc.pid)
        return proc

    def _read_exact(self, size):
        buf = bytearray(size)
        view = memoryview(buf)
        got = 0
        while got < size:
            n = self.proc.stdout.readinto(view[got:])
            if not n:
                return None
            got += n
        return buf

    def read(self):
        size = int(np.prod(self.shape))
        buf = self._read_exact(size)
        while buf is None and self.live:
            self.close()
            time.sleep(1)
            self.proc = self._start()
            buf = self._read_exact(size)
        if buf is None:
            return None
        self.index += 1
        return self.index, np.frombuffer(buf, np.uint8).reshape(self.shape)

    def close(self):
        unwatch_process(self.proc.pid)
        self.proc.kill()
        self.proc.wait()
