import json
from dataclasses import asdict, dataclass, fields, replace

from .settings import FLAGS_PATH


@dataclass(frozen=True)
class Flags:
    latest_frame_reader: bool = False
    hw_decode: bool = False
    use_substream: bool = False
    analysis_fps: float = 0
    motion_gate: bool = False
    inference_transport: str = "http_json"
    person_only: bool = False
    vectorized_boxes: bool = False
    batch_cameras: bool = False
    fp16: bool = False
    compiled_detector: bool = False
    imgsz: int = 640
    tracker: bool = False
    gpu_crops: bool = False
    embed_per_track: bool = False
    quality_gate: bool = False
    compiled_embedder: bool = False
    matcher: str = "qdrant"
    match_threshold: float = 0.8
    video_out: str = "ws_base64"
    batched_db_writes: bool = False
    pipelined: bool = False

    @classmethod
    def from_dict(cls, data):
        types = {f.name: f.type for f in fields(cls)}
        return cls(**{key: types[key](value) for key, value in data.items() if key in types})

    def to_dict(self):
        return asdict(self)


INFO = [
    ("Ingest", "latest_frame_reader", "Latest-frame reader", "A thread per camera keeps only the newest decoded frame. Without it a slow pipeline falls further behind live forever. Live only."),
    ("Ingest", "hw_decode", "Hardware decode", "Decode video with ffmpeg on the GPU (NVDEC / VideoToolbox) instead of OpenCV on the CPU."),
    ("Ingest", "use_substream", "Analyze sub-stream", "Run analytics on the 640px sub-stream instead of the full-resolution main stream."),
    ("Ingest", "analysis_fps", "Analysis FPS", "Analyze at most this many frames per second per camera. 0 = every frame."),
    ("Ingest", "motion_gate", "Motion gate", "Skip the detector when a tiny grayscale frame diff says nothing moved."),
    ("Inference", "inference_transport", "Inference transport", "How frames reach the models: base64 JSON over HTTP, binary msgpack over HTTP, or in the same process."),
    ("Detection", "person_only", "Person class only", "Ask YOLO for class 0 only so NMS never sees the other 79 classes."),
    ("Detection", "vectorized_boxes", "Vectorized boxes", "Copy all boxes GPU to CPU once per frame instead of once per box."),
    ("Detection", "batch_cameras", "Batch cameras", "One detector call for every camera's frame instead of one call per camera."),
    ("Detection", "fp16", "FP16", "Half precision for the detector and the ReID model."),
    ("Detection", "compiled_detector", "Compiled detector", "Run YOLO through TensorRT (NVIDIA) or CoreML (Mac)."),
    ("Detection", "imgsz", "Detector input size", "YOLO input resolution. Smaller is faster but misses small people."),
    ("Tracking", "tracker", "ByteTrack", "Give each person a stable track id across frames."),
    ("Embedding", "gpu_crops", "GPU crops", "Cut and resize all person crops on the GPU with roi_align instead of PIL on the CPU."),
    ("Embedding", "embed_per_track", "Embed per track", "Embed a track when it appears and every 0.5s, averaging, instead of every person every frame."),
    ("Embedding", "quality_gate", "Crop quality gate", "Skip tiny, low-confidence or edge-cut crops."),
    ("Embedding", "compiled_embedder", "Compiled ReID", "Run the ReID model through TensorRT (NVIDIA) or CoreML (Mac)."),
    ("Matching", "matcher", "Matcher", "Match against tracked people with a Qdrant query per frame, or a matrix multiply in memory."),
    ("Matching", "match_threshold", "Match threshold", "Cosine similarity needed to call a detection a tracked person."),
    ("Output", "video_out", "Video output", "Send frames as base64 JSON, binary websocket frames, or let the browser pull WebRTC from MediaMTX and send only boxes."),
    ("System", "batched_db_writes", "Batched DB writes", "Write sightings from a background thread in batches instead of one commit per event."),
    ("System", "pipelined", "Pipelined stages", "Run grab, inference and publish in separate threads connected by queues."),
]

OPTIONS = {
    "inference_transport": ["http_json", "http_binary", "inprocess"],
    "matcher": ["qdrant", "memory"],
    "video_out": ["ws_base64", "ws_binary", "webrtc"],
    "imgsz": [320, 416, 512, 640, 800],
}


def unavailable(name, flags, caps):
    if name == "hw_decode" and not caps["hwaccel"]:
        return "ffmpeg has no GPU hwaccel here"
    if name == "fp16" and caps["device"] == "cpu":
        return "needs a GPU"
    if name in ("compiled_detector", "compiled_embedder") and not caps["compiler"]:
        return "needs TensorRT (NVIDIA) or coremltools (Mac)"
    if name in ("embed_per_track", "quality_gate") and flags.inference_transport != "inprocess":
        return "needs inference_transport = inprocess"
    if name == "embed_per_track" and not flags.tracker:
        return "needs ByteTrack"
    return None


def normalize(flags, caps):
    if flags.matcher == "qdrant" and not caps["qdrant"]:
        flags = replace(flags, matcher="memory")
    for name in [f.name for f in fields(flags)]:
        if isinstance(getattr(flags, name), bool) and getattr(flags, name) and unavailable(name, flags, caps):
            flags = replace(flags, **{name: False})
    return flags


def schema(flags, caps):
    out = []
    for group, name, label, help in INFO:
        value = getattr(flags, name)
        kind = "bool" if isinstance(value, bool) else "select" if name in OPTIONS else "number"
        reason = unavailable(name, flags, caps)
        if name == "matcher" and not caps["qdrant"]:
            reason = "Qdrant not reachable, using memory"
        out.append({"group": group, "name": name, "label": label, "help": help, "kind": kind,
                    "options": OPTIONS.get(name), "unavailable": reason})
    return out


LADDER = [
    ("baseline", {}),
    ("http_binary", {"inference_transport": "http_binary"}),
    ("inprocess", {"inference_transport": "inprocess"}),
    ("person_only", {"person_only": True}),
    ("vectorized_boxes", {"vectorized_boxes": True}),
    ("batch_cameras", {"batch_cameras": True}),
    ("fp16", {"fp16": True}),
    ("compiled_detector", {"compiled_detector": True}),
    ("gpu_crops", {"gpu_crops": True}),
    ("compiled_embedder", {"compiled_embedder": True}),
    ("tracker", {"tracker": True}),
    ("embed_per_track", {"embed_per_track": True}),
    ("quality_gate", {"quality_gate": True}),
    ("matcher_memory", {"matcher": "memory"}),
    ("hw_decode", {"hw_decode": True}),
    ("use_substream", {"use_substream": True}),
    ("analysis_fps_10", {"analysis_fps": 10}),
    ("motion_gate", {"motion_gate": True}),
    ("ws_binary", {"video_out": "ws_binary"}),
    ("webrtc", {"video_out": "webrtc"}),
    ("batched_db_writes", {"batched_db_writes": True}),
    ("pipelined", {"pipelined": True}),
]


def load():
    if FLAGS_PATH.exists():
        return Flags.from_dict(json.loads(FLAGS_PATH.read_text()))
    return Flags()


def save(flags):
    FLAGS_PATH.write_text(json.dumps(flags.to_dict(), indent=2))
