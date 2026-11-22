import numpy as np
import torch
from torchvision.ops import roi_align

from ..settings import DEVICE, REID_SIZE


def clip_boxes(boxes, image):
    h, w = image.shape[:2]
    b = boxes[:, :4].astype(int).copy()
    b[:, [0, 2]] = b[:, [0, 2]].clip(0, w - 1)
    b[:, [1, 3]] = b[:, [1, 3]].clip(0, h - 1)
    b[:, 2] = np.maximum(b[:, 2], b[:, 0] + 1)
    b[:, 3] = np.maximum(b[:, 3], b[:, 1] + 1)
    return b


def crop_batch(images, boxes_per_image):
    out = []
    for image, boxes in zip(images, boxes_per_image):
        if not len(boxes):
            continue
        frame = torch.from_numpy(image).to(DEVICE).permute(2, 0, 1).flip(0).unsqueeze(0).float()
        rois = torch.from_numpy(clip_boxes(boxes, image)).to(DEVICE, torch.float32)
        out.append(roi_align(frame, [rois], output_size=REID_SIZE, sampling_ratio=2, aligned=True))
    return (torch.cat(out) / 255 - 0.5) / 0.5
