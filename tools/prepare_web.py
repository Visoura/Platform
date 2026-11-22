import argparse
import json
import shutil
import subprocess
import tempfile
import warnings
from pathlib import Path

import numpy as np
import onnx
import onnxslim
import timm
import torch
import torch.nn as nn
import torch.nn.functional as F
from onnx import helper, numpy_helper
from onnxconverter_common import float16
from ultralytics import YOLO

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
DETECT_SIZE = (384, 640)
REID_SIZE = (256, 128)
VIDEO_EXTENSIONS = {".mp4", ".mkv", ".mov", ".avi", ".ts"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


class HorusModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.base = timm.create_model("deit_small_patch16_224", pretrained=False, num_classes=0, img_size=REID_SIZE)
        self.bottleneck = nn.BatchNorm1d(384)

    def forward(self, x):
        return F.normalize(self.bottleneck(self.base(x)), dim=1)


def save_fp16(model, out):
    warnings.filterwarnings("ignore", module="onnxconverter_common")
    warnings.filterwarnings("ignore", message=".*legacy TorchScript-based ONNX export")
    model = onnxslim.slim(model)
    del model.graph.value_info[:]
    to_float = {n.name for n in model.graph.node if n.op_type == "Cast" and n.attribute[0].i == onnx.TensorProto.FLOAT}
    model = float16.convert_float_to_float16(model, keep_io_types=True)
    for node in model.graph.node:
        if node.name in to_float:
            node.attribute[0].i = onnx.TensorProto.FLOAT16
    onnx.save(model, out)
    print(f"{out.relative_to(ROOT)}  {out.stat().st_size / 1e6:.1f} MB")


def export_detector(weights, out):
    with tempfile.TemporaryDirectory() as tmp:
        pt = Path(tmp) / "yolo11n.pt"
        shutil.copy(weights, pt)
        path = YOLO(str(pt)).export(format="onnx", imgsz=DETECT_SIZE, dynamic=True, simplify=True, opset=17)
        model = onnx.load(path)
    graph = model.graph
    raw = graph.output[0]
    graph.initializer.extend([
        numpy_helper.from_array(np.array([0], np.int64), "person_start"),
        numpy_helper.from_array(np.array([5], np.int64), "person_end"),
        numpy_helper.from_array(np.array([1], np.int64), "person_axis"),
    ])
    graph.node.append(helper.make_node("Slice", [raw.name, "person_start", "person_end", "person_axis"], ["boxes"]))
    graph.output.remove(raw)
    graph.output.append(helper.make_tensor_value_info("boxes", onnx.TensorProto.FLOAT, ["batch", 5, "anchors"]))
    save_fp16(model, out)


def export_reid(weights, out):
    model = HorusModel()
    model.load_state_dict(torch.load(weights, map_location="cpu"), strict=False)
    model.eval()
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "reid.onnx"
        torch.onnx.export(model, torch.rand(2, 3, *REID_SIZE), str(path), input_names=["crops"],
                          output_names=["embeddings"], dynamic_axes={"crops": {0: "n"}, "embeddings": {0: "n"}},
                          opset_version=17, dynamo=False)
        save_fp16(onnx.load(path), out)


def transcode(src, dst):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-an", "-vf", "scale=640:-2,fps=30",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-profile:v", "main",
                    "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(dst)], check=True)
    print(f"{dst.relative_to(ROOT)}  {dst.stat().st_size / 1e6:.1f} MB")


def copy_folder(src, dst, extensions, convert):
    dst.mkdir(parents=True, exist_ok=True)
    names = []
    for path in sorted(src.iterdir()):
        if path.suffix.lower() in extensions:
            if convert:
                target = dst / f"{path.stem}.mp4"
                convert(path, target)
            else:
                target = dst / path.name.lower()
                shutil.copy(path, target)
            names.append(target.name)
    (dst / "manifest.json").write_text(json.dumps(names, indent=2))


def main():
    parser = argparse.ArgumentParser(description="Export the models and media the browser demo serves from public/.")
    parser.add_argument("--yolo", type=Path, default=ROOT / "data/weights/yolo11n.pt")
    parser.add_argument("--reid", type=Path, default=ROOT / "data/weights/transformer_120.pth")
    parser.add_argument("--videos", type=Path, default=ROOT / "data/videos")
    parser.add_argument("--persons", type=Path, default=ROOT / "data/persons")
    parser.add_argument("--skip-media", action="store_true", help="only export the models")
    args = parser.parse_args()

    models = PUBLIC / "models"
    models.mkdir(parents=True, exist_ok=True)
    export_detector(args.yolo, models / "detector.onnx")
    export_reid(args.reid, models / "reid.onnx")
    if not args.skip_media:
        copy_folder(args.videos, PUBLIC / "videos", VIDEO_EXTENSIONS, transcode)
        copy_folder(args.persons, PUBLIC / "persons", IMAGE_EXTENSIONS, None)


if __name__ == "__main__":
    main()
