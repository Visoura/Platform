import timm
import torch
import torch.nn as nn
import torch.nn.functional as F

from ..settings import DEVICE, REID_DIM, REID_SIZE, REID_WEIGHTS


class HorusModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.base = timm.create_model("deit_small_patch16_224", pretrained=False, num_classes=0, img_size=REID_SIZE)
        self.bottleneck = nn.BatchNorm1d(REID_DIM)

    def forward(self, x):
        return F.normalize(self.bottleneck(self.base(x)), dim=1)


def load_model():
    model = HorusModel()
    model.load_state_dict(torch.load(REID_WEIGHTS, map_location="cpu"), strict=False)
    return model.eval()


class TorchEmbedder:
    def __init__(self, fp16):
        self.dtype = torch.float16 if fp16 and DEVICE != "cpu" else torch.float32
        self.model = load_model().to(DEVICE, self.dtype)

    @torch.inference_mode()
    def __call__(self, crops):
        return self.model(crops.to(DEVICE, self.dtype)).float().cpu().numpy()


def build_embedder(flags):
    if flags.compiled_embedder and DEVICE == "cuda":
        from .tensorrt_reid import TensorRTEmbedder
        return TensorRTEmbedder(flags.fp16)
    if flags.compiled_embedder:
        from .coreml_reid import CoreMLEmbedder
        return CoreMLEmbedder(flags.fp16)
    return TorchEmbedder(flags.fp16)
