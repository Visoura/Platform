import json
import shutil
import socket
import subprocess
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

from .settings import CACHE_DIR, RECORD, RECORDINGS_DIR, RTSP_URL, START_MEDIAMTX, SUBSTREAM_WIDTH, VIDEOS_DIR, WEBRTC_PORT

VIDEO_EXTENSIONS = {".mp4", ".mkv", ".mov", ".avi", ".ts"}


@dataclass
class Camera:
    id: str
    source: Path
    fps: float
    width: int
    height: int

    @property
    def main_file(self):
        return CACHE_DIR / f"{self.id}_main.mp4"

    @property
    def sub_file(self):
        return CACHE_DIR / f"{self.id}_sub.mp4"

    @property
    def sub_url(self):
        return f"{RTSP_URL}/{self.id}_sub"

    def to_dict(self):
        return {"id": self.id, "fps": self.fps, "width": self.width, "height": self.height,
                "webrtc_path": f"/{self.id}/whep"}


def probe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height,r_frame_rate", "-of", "json", str(path)],
        capture_output=True, text=True, check=True).stdout
    stream = json.loads(out)["streams"][0]
    num, den = stream["r_frame_rate"].split("/")
    return float(num) / float(den), stream["width"], stream["height"]


def scan():
    cameras = []
    for path in sorted(VIDEOS_DIR.iterdir()):
        if path.suffix.lower() not in VIDEO_EXTENSIONS:
            continue
        cameras.append(Camera(path.stem, path, *probe(path)))
    return cameras


def encoder():
    out = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True).stdout
    for name in ("h264_nvenc", "h264_videotoolbox"):
        if name in out:
            return name
    return "libx264"


def transcode(src, dst, fps, width=None):
    if dst.exists():
        return
    codec = encoder()
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", str(src), "-an"]
    if width:
        cmd += ["-vf", f"scale={width}:-2"]
    cmd += ["-c:v", codec, "-bf", "0", "-g", str(round(fps)), "-b:v", "2M" if width else "8M"]
    if codec == "libx264":
        cmd += ["-preset", "veryfast"]
    tmp = dst.with_suffix(".tmp.mp4")
    subprocess.run(cmd + [str(tmp)], check=True)
    tmp.rename(dst)


def prepare(cameras):
    jobs = []
    for cam in cameras:
        jobs.append((cam.source, cam.main_file, cam.fps, None))
        jobs.append((cam.source, cam.sub_file, cam.fps, SUBSTREAM_WIDTH))
    with ThreadPoolExecutor(4) as pool:
        list(pool.map(lambda job: transcode(*job), jobs))


def mediamtx_config(cameras):
    lines = [
        "logLevel: error", "rtsp: yes", "rtspAddress: :8554", "rtspTransports: [tcp]",
        "rtmp: no", "hls: no", "srt: no", "api: no", "moq: no", "playback: no",
        "webrtc: yes", f"webrtcAddress: :{WEBRTC_PORT}", "webrtcAllowOrigins: ['*']",
        "webrtcLocalUDPAddress: :8189", "webrtcLocalTCPAddress: :8189", "webrtcIPsFromInterfaces: yes",
        "paths:",
    ]
    for cam in cameras:
        for name, file in ((cam.id, cam.main_file), (f"{cam.id}_sub", cam.sub_file)):
            lines += [
                f"  {name}:",
                f"    runOnInit: ffmpeg -v error -re -stream_loop -1 -i {file} -c copy -f rtsp rtsp://127.0.0.1:8554/{name}",
                "    runOnInitRestart: yes",
            ]
            if RECORD and name == cam.id:
                lines += ["    record: yes", f"    recordPath: {RECORDINGS_DIR}/%path/%Y-%m-%d_%H-%M-%S-%f",
                          "    recordDeleteAfter: 30m"]
    path = CACHE_DIR / "mediamtx.yml"
    path.write_text("\n".join(lines) + "\n")
    return path


def port_open(port):
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def start_mediamtx(cameras):
    if not START_MEDIAMTX or port_open(8554):
        return None
    binary = shutil.which("mediamtx")
    if not binary:
        raise RuntimeError("mediamtx not found on PATH (brew install mediamtx, or download it from GitHub releases)")
    return subprocess.Popen([binary, str(mediamtx_config(cameras))])
