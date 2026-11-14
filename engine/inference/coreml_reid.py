import coremltools as ct
import numpy as np

from ..settings import REID_DIM
from .compile import COREML_BATCH, reid_coreml


class CoreMLEmbedder:
    def __init__(self, fp16):
        self.model = ct.models.MLModel(str(reid_coreml(fp16)), compute_units=ct.ComputeUnit.ALL)

    def __call__(self, crops):
        x = crops.float().cpu().numpy()
        out = []
        for i in range(0, len(x), COREML_BATCH):
            chunk = x[i:i + COREML_BATCH]
            n = len(chunk)
            if n < COREML_BATCH:
                chunk = np.concatenate([chunk, np.zeros((COREML_BATCH - n, *chunk.shape[1:]), np.float32)])
            out.append(self.model.predict({"x": chunk})["y"][:n])
        return np.concatenate(out) if out else np.zeros((0, REID_DIM), np.float32)
