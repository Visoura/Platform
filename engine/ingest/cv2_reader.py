import os
import time

import cv2

os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp")


class Cv2Reader:
    def __init__(self, url, live):
        self.url = url
        self.live = live
        self.index = -1
        self.cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)

    def read(self):
        ok, image = self.cap.read()
        while not ok and self.live:
            time.sleep(1)
            self.cap.release()
            self.cap = cv2.VideoCapture(self.url, cv2.CAP_FFMPEG)
            ok, image = self.cap.read()
        if not ok:
            return None
        self.index += 1
        return self.index, image

    def close(self):
        self.cap.release()
