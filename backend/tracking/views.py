import base64
import uuid

import cv2
import numpy as np
from django.core.cache import cache
from rest_framework.decorators import api_view
from rest_framework.response import Response

from streaming.ai_client import call_ai_batch

from .vector_storage import VectorStorage

_storage = VectorStorage()
CANDIDATES_CACHE_TIMEOUT = 60


def _decode_frame(frame_b64: str):
    if ',' in frame_b64:
        frame_b64 = frame_b64.split(',')[-1]
    img_bytes = base64.b64decode(frame_b64)
    np_img = np.frombuffer(img_bytes, np.uint8)
    return cv2.imdecode(np_img, cv2.IMREAD_COLOR)


def _bbox_contains(bbox, px, py):
    x1, y1, x2, y2 = bbox
    return x1 <= px <= x2 and y1 <= py <= y2


def _track_embedding(embedding) -> str:
    target_id = str(uuid.uuid4())
    _storage.upsert(point_id=target_id, embedding=embedding, metadata={})
    return target_id


@api_view(['POST'])
def start_tracking(request):
    """
    body: {camera_id, frame: "<base64 jpg>", x: 0..1, y: 0..1}
    x/y are the clicked point as a fraction of the frame's width/height.
    """
    data = request.data
    frame_b64 = data.get('frame')
    x_frac = data.get('x')
    y_frac = data.get('y')

    if not frame_b64 or x_frac is None or y_frac is None:
        return Response({'error': 'frame, x and y are required'}, status=400)

    frame = _decode_frame(frame_b64)
    if frame is None:
        return Response({'error': 'Could not decode frame'}, status=400)

    h, w = frame.shape[:2]
    px, py = float(x_frac) * w, float(y_frac) * h

    results = call_ai_batch([frame_b64])
    detections = results[0] if results else []

    candidates = [d for d in detections if _bbox_contains(d['bbox'], px, py)]

    if not candidates:
        return Response({'status': 'no_detection'})

    if len(candidates) == 1:
        target_id = _track_embedding(candidates[0]['embedding'])
        return Response({'status': 'tracked', 'target_id': target_id})

    token = str(uuid.uuid4())
    cache.set(f'tracking:candidates:{token}', candidates, timeout=CANDIDATES_CACHE_TIMEOUT)
    return Response({
        'status': 'ambiguous',
        'token': token,
        'candidates': [
            {'index': i, 'bbox': d['bbox'], 'confidence': d['confidence']}
            for i, d in enumerate(candidates)
        ],
    })


@api_view(['POST'])
def confirm_tracking(request):
    """body: {token, index} - picks the bbox the user meant out of an ambiguous /start/ response."""
    token = request.data.get('token')
    index = request.data.get('index')

    if token is None or index is None:
        return Response({'error': 'token and index are required'}, status=400)

    candidates = cache.get(f'tracking:candidates:{token}')
    if candidates is None:
        return Response({'error': 'This selection has expired, please click the target again'}, status=410)

    try:
        chosen = candidates[int(index)]
    except (ValueError, IndexError):
        return Response({'error': 'index out of range'}, status=400)

    cache.delete(f'tracking:candidates:{token}')
    target_id = _track_embedding(chosen['embedding'])
    return Response({'status': 'tracked', 'target_id': target_id})


@api_view(['DELETE'])
def clear_tracking(request):
    _storage.clear()
    return Response({'status': 'cleared'})


@api_view(['GET'])
def tracking_status(request):
    count = _storage.count_points()
    return Response({'tracking_enabled': count > 0, 'count': count})
