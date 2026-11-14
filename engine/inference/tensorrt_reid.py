import tensorrt as trt
import torch

from ..settings import REID_DIM
from .compile import reid_tensorrt

MAX_BATCH = 128


class TensorRTEmbedder:
    def __init__(self, fp16):
        runtime = trt.Runtime(trt.Logger(trt.Logger.WARNING))
        self.engine = runtime.deserialize_cuda_engine(reid_tensorrt(fp16).read_bytes())
        self.context = self.engine.create_execution_context()

    def __call__(self, crops):
        stream = torch.cuda.current_stream()
        out = []
        for chunk in crops.split(MAX_BATCH):
            x = chunk.to("cuda", torch.float32).contiguous()
            y = torch.empty((len(x), REID_DIM), device="cuda", dtype=torch.float32)
            self.context.set_input_shape("x", tuple(x.shape))
            self.context.set_tensor_address("x", x.data_ptr())
            self.context.set_tensor_address("y", y.data_ptr())
            self.context.execute_async_v3(stream.cuda_stream)
            out.append(y)
        stream.synchronize()
        return torch.cat(out).cpu().numpy()
