import cv2
import numpy as np
import torch
from PIL import Image
from torchvision import transforms
from torchvision.ops import roi_align

from ..settings import DEVICE, REID_SIZE

TRANSFORM = transforms.Compose([
    transforms.Resize(REID_SIZE, interpolation=transforms.InterpolationMode.BICUBIC),
    transforms.ToTensor(),
    transforms.Normalize([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]),
])


def clip_boxes(boxes, image):
    h, w = image.shape[:2]
    b = boxes[:, :4].astype(int).copy()
    b[:, [0, 2]] = b[:, [0, 2]].clip(0, w - 1)
    b[:, [1, 3]] = b[:, [1, 3]].clip(0, h - 1)
    b[:, 2] = np.maximum(b[:, 2], b[:, 0] + 1)
    b[:, 3] = np.maximum(b[:, 3], b[:, 1] + 1)
    return b


def crops_cpu(images, boxes_per_image):
    tensors = []
    for image, boxes in zip(images, boxes_per_image):
        for x1, y1, x2, y2 in clip_boxes(boxes, image):
            rgb = cv2.cvtColor(image[y1:y2, x1:x2], cv2.COLOR_BGR2RGB)
            tensors.append(TRANSFORM(Image.fromarray(rgb)).to(DEVICE))
    return torch.stack(tensors)


def crops_gpu(images, boxes_per_image):
    out = []
    for image, boxes in zip(images, boxes_per_image):
        if not len(boxes):
            continue
        frame = torch.from_numpy(image).to(DEVICE).permute(2, 0, 1).flip(0).unsqueeze(0).float()
        rois = torch.from_numpy(clip_boxes(boxes, image)).to(DEVICE, torch.float32)
        out.append(roi_align(frame, [rois], output_size=REID_SIZE, sampling_ratio=2, aligned=True))
    return (torch.cat(out) / 255 - 0.5) / 0.5
