"""Thin client for the external vision-pipeline AI service (detector + embedder).

Contract matches visoura/platform-backend/cameras/views.py `_call_ai_batch`:
POST {AI_SERVICE_URL}/process  {"frames": ["<base64 jpg>", ...]}
  -> {"results": [[{"bbox": [x1,y1,x2,y2], "confidence": float, "embedding": [float,...]}, ...], ...]}
one result list per input frame, in the same order.
"""
import requests
from django.conf import settings


def call_ai_batch(frames_b64: list) -> list:
    if not frames_b64:
        return []
    try:
        resp = requests.post(
            f'{settings.AI_SERVICE_URL}/process',
            json={'frames': frames_b64},
            timeout=settings.AI_SERVICE_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get('results', [[] for _ in frames_b64])
    except Exception:
        return [[] for _ in frames_b64]
