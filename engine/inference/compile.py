import shutil

from ultralytics import YOLO

from ..capabilities import compiler
from ..settings import CACHE_DIR, DETECT_BATCH, IMGSZ, YOLO_WEIGHTS


def detector():
    target = compiler()
    if not target:
        return None
    stem = f"yolo11n_{IMGSZ}_fp16"
    out = CACHE_DIR / (stem + (".engine" if target == "tensorrt" else ".mlpackage"))
    if out.exists():
        return out
    pt = CACHE_DIR / f"{stem}.pt"
    shutil.copy(YOLO_WEIGHTS, pt)
    model = YOLO(str(pt))
    if target == "tensorrt":
        model.export(format="engine", imgsz=IMGSZ, quantize=16, dynamic=True, batch=DETECT_BATCH, device=0)
    else:
        model.export(format="coreml", imgsz=IMGSZ, quantize=16, nms=False)
    return out
