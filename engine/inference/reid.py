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


class Embedder:
    def __init__(self):
        self.dtype = torch.float16 if DEVICE != "cpu" else torch.float32
        self.model = load_model().to(DEVICE, self.dtype)

    @torch.inference_mode()
    def __call__(self, crops):
        return self.model(crops.to(self.dtype)).float().cpu().numpy()
