import base64
import json
import struct

import cv2

JPEG_QUALITY = 75


def metadata(frame):
    h, w = frame.image.shape[:2]
    boxes = []
    for d in frame.dets:
        x1, y1, x2, y2 = d.box[:4]
        boxes.append({
            "box": [round(float(x1) / w, 4), round(float(y1) / h, 4), round(float(x2) / w, 4), round(float(y2) / h, 4)],
            "conf": round(float(d.box[4]), 3),
            "track": None if d.track_id is None else int(d.track_id),
            "target": d.target,
            "name": d.name,
            "score": round(d.score, 3),
        })
    return {"type": "frame", "camera": frame.camera, "index": frame.index, "ts": frame.ts * 1000, "boxes": boxes}


def jpeg(image):
    return cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])[1].tobytes()


class Base64Json:
    def encode(self, frame):
        message = metadata(frame)
        message["frame"] = base64.b64encode(jpeg(frame.image)).decode()
        return json.dumps(message)


class BinaryFrames:
    def encode(self, frame):
        header = json.dumps(metadata(frame)).encode()
        return struct.pack("<I", len(header)) + header + jpeg(frame.image)


class MetadataOnly:
    def encode(self, frame):
        return json.dumps(metadata(frame))


def build_encoder(video_out):
    return {"ws_base64": Base64Json, "ws_binary": BinaryFrames, "webrtc": MetadataOnly}[video_out]()
