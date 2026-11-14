import shutil

import torch
from ultralytics import YOLO

from ..settings import CACHE_DIR, DEVICE, REID_SIZE, YOLO_WEIGHTS
from .reid import load_model

COREML_BATCH = 32


def precision(fp16):
    return "fp16" if fp16 else "fp32"


def detector(imgsz, fp16):
    stem = f"yolo11n_{imgsz}_{precision(fp16)}"
    suffix = ".engine" if DEVICE == "cuda" else ".mlpackage"
    out = CACHE_DIR / (stem + suffix)
    if out.exists():
        return out
    pt = CACHE_DIR / f"{stem}.pt"
    shutil.copy(YOLO_WEIGHTS, pt)
    model = YOLO(str(pt))
    quantize = 16 if fp16 else 32
    if DEVICE == "cuda":
        model.export(format="engine", imgsz=imgsz, quantize=quantize, dynamic=True, batch=16, device=0)
    else:
        model.export(format="coreml", imgsz=imgsz, quantize=quantize, nms=False)
    return out


def reid_coreml(fp16):
    import coremltools as ct
    out = CACHE_DIR / f"reid_{COREML_BATCH}_{precision(fp16)}.mlpackage"
    if out.exists():
        return out
    example = torch.rand(COREML_BATCH, 3, *REID_SIZE)
    traced = torch.jit.trace(load_model(), example)
    model = ct.convert(
        traced,
        inputs=[ct.TensorType(name="x", shape=example.shape)],
        outputs=[ct.TensorType(name="y")],
        convert_to="mlprogram",
        compute_precision=ct.precision.FLOAT16 if fp16 else ct.precision.FLOAT32,
    )
    model.save(str(out))
    return out


def reid_tensorrt(fp16):
    import tensorrt as trt
    out = CACHE_DIR / f"reid_{precision(fp16)}.engine"
    if out.exists():
        return out
    onnx_path = CACHE_DIR / "reid.onnx"
    torch.onnx.export(load_model(), torch.rand(1, 3, *REID_SIZE), str(onnx_path), input_names=["x"],
                      output_names=["y"], dynamic_axes={"x": {0: "n"}, "y": {0: "n"}}, opset_version=17, dynamo=False)
    logger = trt.Logger(trt.Logger.WARNING)
    builder = trt.Builder(logger)
    network = builder.create_network(0)
    parser = trt.OnnxParser(network, logger)
    if not parser.parse(onnx_path.read_bytes()):
        raise RuntimeError(parser.get_error(0))
    config = builder.create_builder_config()
    if fp16:
        config.set_flag(trt.BuilderFlag.FP16)
    profile = builder.create_optimization_profile()
    profile.set_shape("x", (1, 3, *REID_SIZE), (32, 3, *REID_SIZE), (128, 3, *REID_SIZE))
    config.add_optimization_profile(profile)
    out.write_bytes(builder.build_serialized_network(network, config))
    return out
