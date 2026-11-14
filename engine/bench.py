import argparse
import json
import threading
import time
from dataclasses import replace

import numpy as np

from . import capabilities
from .flags import LADDER, Flags, normalize
from .metrics import Metrics
from .pipeline.pipeline import STAGES, Pipeline
from .settings import BENCH_DIR, DEVICE

WARMUP = 30


def run_once(flags, cameras, targets, frames_per_camera):
    metrics = Metrics()
    pipeline = Pipeline(flags, cameras, metrics, targets, live=False,
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
    return summarize(flags, cameras, snap)


def summarize(flags, cameras, snap):
    elapsed = snap["uptime"]
    totals = snap["totals"]
    decoded = totals.get("frames_decoded", 0)
    analyzed = max(totals.get("frames_analyzed", 0), 1)
    throughput = decoded / elapsed
    return {
        "flags": flags.to_dict(),
        "elapsed": elapsed,
        "throughput_fps": throughput,
        "analyzed_fps": analyzed / elapsed,
        "realtime_cameras": throughput / float(np.mean([c.fps for c in cameras])),
        "stage_ms_per_frame": {k: v * 1000 / analyzed for k, v in snap["stage_total"].items()},
        "stage_share": {k: snap["stage_total"].get(k, 0) / elapsed for k in STAGES},
        "cpu_percent": snap["cpu_avg"],
        "rss_mb": snap["system"].get("rss_mb"),
        "gpu_mem_mb": snap["system"].get("gpu_mem_mb"),
        "detections_per_frame": totals.get("detections", 0) / analyzed,
        "embeddings_per_frame": totals.get("embeddings", 0) / analyzed,
        "matches_per_frame": totals.get("matched", 0) / analyzed,
        "kb_out_per_frame": totals.get("bytes_out", 0) / analyzed / 1024,
        "db_commits": totals.get("db_commits", 0),
        "frames_decoded": decoded,
        "frames_analyzed": analyzed,
    }


def ladder_steps(caps):
    flags, previous, steps = Flags(), None, []
    for name, change in LADDER:
        flags = replace(flags, **change)
        effective = normalize(flags, caps)
        steps.append((name, change, effective, effective == previous))
        previous = effective
    return steps


DEPENDS = {
    "embed_per_track": {"tracker": True, "inference_transport": "inprocess"},
    "quality_gate": {"inference_transport": "inprocess"},
}


def isolated_steps(caps):
    base = normalize(Flags(), caps)
    steps = [("baseline", {}, base, False)]
    for name, change in LADDER[1:]:
        flags = normalize(replace(Flags(), **{**DEPENDS.get(name, {}), **change}), caps)
        steps.append((name, change, flags, flags == base))
    steps.append(("baseline (repeat)", {}, base, False))
    return steps


def leave_one_out_steps(caps):
    full = Flags()
    for _, change in LADDER:
        full = replace(full, **change)
    full = normalize(full, caps)
    steps = [("all", {}, full, False)]
    before = Flags()
    for i, (name, change) in enumerate(LADDER[1:], start=1):
        overridden = any(key in later for _, later in LADDER[i + 1:] for key in change)
        revert = {key: getattr(before, key) for key in change}
        before = replace(before, **change)
        if overridden:
            continue
        flags = normalize(replace(full, **revert), caps)
        steps.append((f"without {name}", revert, flags, flags == full))
    steps.append(("all (repeat)", {}, full, False))
    return steps


def run(mode, cameras, targets, frames_per_camera, current_flags, on_progress=lambda *a: None, should_stop=lambda: False):
    caps = capabilities.detect()
    if mode == "ladder":
        steps = ladder_steps(caps)
    elif mode == "isolated":
        steps = isolated_steps(caps)
    elif mode == "leave_one_out":
        steps = leave_one_out_steps(caps)
    else:
        steps = [("current", {}, normalize(current_flags, caps), False)]
    results = []
    for i, (name, change, flags, skipped) in enumerate(steps):
        if should_stop():
            break
        on_progress(i, len(steps), name)
        if skipped:
            results.append({"step": name, "change": change, "skipped": True})
            continue
        result = run_once(flags, cameras, targets, frames_per_camera)
        results.append({"step": name, "change": change, "skipped": False, **result})
    base = next((r["throughput_fps"] for r in results if not r["skipped"]), None)
    for r in results:
        if not r["skipped"]:
            r["speedup"] = r["throughput_fps"] / base
    report = {
        "id": time.strftime("%Y%m%d-%H%M%S"),
        "mode": mode,
        "frames_per_camera": frames_per_camera,
        "cameras": [c.id for c in cameras],
        "device": DEVICE,
        "gpu": caps["gpu"],
        "results": results,
    }
    (BENCH_DIR / f"{report['id']}.json").write_text(json.dumps(report, indent=2))
    return report


def list_reports():
    reports = []
    for path in sorted(BENCH_DIR.glob("*.json"), reverse=True):
        data = json.loads(path.read_text())
        reports.append({"id": data["id"], "mode": data["mode"], "device": data["device"],
                        "cameras": len(data["cameras"]), "frames_per_camera": data["frames_per_camera"]})
    return reports


def load_report(report_id):
    return json.loads((BENCH_DIR / f"{report_id}.json").read_text())


def print_report(report):
    print(f"\n{report['mode']} on {report['gpu']} ({report['device']}), {len(report['cameras'])} cameras, "
          f"{report['frames_per_camera']} frames each\n")
    print(f"{'step':<20}{'fps':>9}{'speedup':>9}{'rt cams':>9}{'cpu %':>8}{'det/f':>7}{'emb/f':>7}{'match/f':>8}")
    for r in report["results"]:
        if r["skipped"]:
            print(f"{r['step']:<20}{'(unavailable here, skipped)':>40}")
            continue
        print(f"{r['step']:<20}{r['throughput_fps']:>9.1f}{r['speedup']:>8.2f}x{r['realtime_cameras']:>9.2f}"
              f"{r['cpu_percent']:>8.0f}{r['detections_per_frame']:>7.1f}{r['embeddings_per_frame']:>7.1f}"
              f"{r['matches_per_frame']:>8.2f}")


def main():
    from . import cameras as cams
    from .inference.local import LocalModels
    from .targets import TargetStore

    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", default="current", choices=["current", "ladder", "isolated", "leave_one_out"])
    parser.add_argument("--ladder", action="store_true", help="same as --mode ladder")
    parser.add_argument("--frames", type=int, default=300)
    parser.add_argument("--cameras", type=int, default=0)
    args = parser.parse_args()

    cameras = cams.scan()
    if args.cameras:
        cameras = cameras[:args.cameras]
    cams.prepare(cameras)
    targets = TargetStore()
    targets.load_watchlist(LocalModels(replace(Flags(), inference_transport="inprocess")))
    flags = normalize(Flags(), capabilities.detect())
    report = run("ladder" if args.ladder else args.mode, cameras, targets, args.frames, flags,
                 on_progress=lambda i, n, name: print(f"[{i + 1}/{n}] {name}", flush=True))
    print_report(report)


if __name__ == "__main__":
    main()
