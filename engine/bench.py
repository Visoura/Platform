import argparse
import json
import threading
import time

import numpy as np

from .capabilities import gpu_name
from .metrics import Metrics
from .pipeline.pipeline import STAGES, Pipeline
from .settings import ANALYSIS_FPS, BENCH_DIR, DEVICE

WARMUP = 30


def run(cameras, targets, models, frames_per_camera):
    metrics = Metrics()
    pipeline = Pipeline(cameras, metrics, targets, models, live=False,
                        max_frames=frames_per_camera + WARMUP, warmup=WARMUP)
    metrics.reset()
    done = threading.Event()

    def tick():
        while not done.wait(0.5):
            metrics.tick()

    ticker = threading.Thread(target=tick, daemon=True)
    ticker.start()
    try:
        pipeline.run(threading.Event())
        metrics.tick()
        snap = metrics.snapshot()
    finally:
        done.set()
        ticker.join()
        pipeline.close()
    report = {
        "id": time.strftime("%Y%m%d-%H%M%S"),
        "frames_per_camera": frames_per_camera,
        "cameras": [c.id for c in cameras],
        "device": DEVICE,
        "gpu": gpu_name(),
        "detector": models.detector.name,
        "analysis_fps": ANALYSIS_FPS,
        **summarize(cameras, snap),
    }
    (BENCH_DIR / f"{report['id']}.json").write_text(json.dumps(report, indent=2))
    return report


def summarize(cameras, snap):
    elapsed = snap["uptime"]
    totals = snap["totals"]
    decoded = totals.get("frames_decoded", 0)
    analyzed = max(totals.get("frames_analyzed", 0), 1)
    throughput = decoded / elapsed
    return {
        "elapsed": elapsed,
        "throughput_fps": throughput,
        "analyzed_fps": analyzed / elapsed,
        "realtime_cameras": throughput / float(np.mean([c.fps for c in cameras])),
        "stage_ms_per_frame": {k: snap["stage_total"].get(k, 0) * 1000 / analyzed for k in STAGES + ["crop", "reid"]},
        "cpu_percent": snap["cpu_avg"],
        "rss_mb": snap["system"].get("rss_mb"),
        "detections_per_frame": totals.get("detections", 0) / analyzed,
        "embeddings_per_frame": totals.get("embeddings", 0) / analyzed,
        "matches_per_frame": totals.get("matched", 0) / analyzed,
    }


def reports():
    return [json.loads(p.read_text()) for p in sorted(BENCH_DIR.glob("*.json"), reverse=True)]


def print_report(r):
    print(f"\n{r['gpu']} ({r['device']}), detector {r['detector']}, {len(r['cameras'])} cameras, "
          f"{r['frames_per_camera']} frames each\n")
    print(f"throughput      {r['throughput_fps']:.1f} source fps ({r['realtime_cameras']:.1f} real-time cameras)")
    print(f"analyzed        {r['analyzed_fps']:.1f} fps")
    print(f"cpu             {r['cpu_percent']:.0f} %")
    print(f"per frame       {r['detections_per_frame']:.1f} people, {r['embeddings_per_frame']:.2f} embeddings")
    print("ms per analyzed frame: " + ", ".join(f"{k} {v:.2f}" for k, v in r["stage_ms_per_frame"].items()))


def main():
    from . import cameras as cams
    from .inference.models import Models
    from .targets import TargetStore

    parser = argparse.ArgumentParser()
    parser.add_argument("--frames", type=int, default=300)
    parser.add_argument("--cameras", type=int, default=0)
    args = parser.parse_args()

    cameras = cams.scan()
    if args.cameras:
        cameras = cameras[:args.cameras]
    cams.prepare(cameras)
    models = Models()
    targets = TargetStore()
    targets.load_watchlist(models)
    print_report(run(cameras, targets, models, args.frames))


if __name__ == "__main__":
    main()
