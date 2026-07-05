import base64
import uuid

from django.core.cache import cache
from rest_framework.decorators import api_view
from rest_framework.response import Response

from streaming.ai_client import call_ai_batch
from streaming.preprocessing import load_detections, load_meta

from .models import Sighting
from .vector_storage import VectorStorage

_storage = VectorStorage()
CANDIDATES_CACHE_TIMEOUT = 60


def _bbox_contains(bbox, px, py):
    x1, y1, x2, y2 = bbox
    return x1 <= px <= x2 and y1 <= py <= y2


def _track_embedding(embedding, metadata=None) -> str:
    target_id = str(uuid.uuid4())
    _storage.upsert(point_id=target_id, embedding=embedding, metadata=metadata or {})
    return target_id


@api_view(['POST'])
def preview_tracking(request):
    """
    body: {camera_id, frame_seq, x: 0..1, y: 0..1}
    x/y are the clicked point as a fraction of the frame's width/height.
    Resolves a click into the detection(s) at that point WITHOUT tracking
    anyone yet - the frontend shows a card (Start Tracking / History) and
    only actually starts tracking when the user presses Start Tracking,
    which calls /confirm/. Always returns a token (even for exactly one
    candidate) so /confirm/ handles both the single-match and
    ambiguous-click cases the same way.
    Looks up the detections already computed for this exact frame during
    preprocessing (streaming/preprocessing.py) - no AI service call here.
    """
    data = request.data
    camera_id = data.get('camera_id')
    frame_seq = data.get('frame_seq')
    x_frac = data.get('x')
    y_frac = data.get('y')

    if camera_id is None or frame_seq is None or x_frac is None or y_frac is None:
        return Response({'error': 'camera_id, frame_seq, x and y are required'}, status=400)

    meta = load_meta(camera_id)
    if meta is None:
        return Response({'error': 'This camera has not been preprocessed'}, status=400)

    detections = load_detections(camera_id).get(int(frame_seq), [])
    px, py = float(x_frac) * meta['width'], float(y_frac) * meta['height']

    candidates = [d for d in detections if _bbox_contains(d['bbox'], px, py)]

    if not candidates:
        return Response({'status': 'no_detection'})

    token = str(uuid.uuid4())
    cache.set(f'tracking:candidates:{token}', candidates, timeout=CANDIDATES_CACHE_TIMEOUT)
    return Response({
        'status': 'preview',
        'token': token,
        'candidates': [
            {'index': i, 'bbox': d['bbox'], 'confidence': d['confidence']}
            for i, d in enumerate(candidates)
        ],
    })


@api_view(['POST'])
def confirm_tracking(request):
    """body: {token, index} - actually starts tracking the candidate the
    user picked (or the sole candidate) out of a /preview/ response."""
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


@api_view(['POST'])
def untrack_target(request):
    """body: {target_id} - stops tracking one specific person, leaving any
    other currently-tracked people untouched."""
    target_id = request.data.get('target_id')
    if not target_id:
        return Response({'error': 'target_id is required'}, status=400)

    _storage.delete(target_id)
    return Response({'status': 'untracked'})


@api_view(['GET'])
def tracking_status(request):
    count = _storage.count_points()
    return Response({'tracking_enabled': count > 0, 'count': count})


@api_view(['POST'])
def search_by_image(request):
    """
    multipart/form-data: {image: <file>}
    Detects and tracks every person found in the uploaded image (there's no
    click coordinate to disambiguate here, unlike start_tracking - an
    uploaded photo just tracks everyone in it). Tagged with a 'source' so
    playback can tell these apart from click-tracked targets and the
    frontend can alert the first time one of them is actually seen live.
    """
    image_file = request.FILES.get('image')
    if not image_file:
        return Response({'error': 'image file is required'}, status=400)

    image_b64 = base64.b64encode(image_file.read()).decode('utf-8')
    results = call_ai_batch([image_b64])
    detections = results[0] if results else []

    if not detections:
        return Response({'status': 'no_person_detected', 'targets': []})

    targets = [
        {
            'target_id': _track_embedding(d['embedding'], metadata={'source': 'image_search'}),
            'bbox': d['bbox'],
            'confidence': d['confidence'],
        }
        for d in detections
    ]
    return Response({'status': 'found', 'targets': targets})


@api_view(['GET'])
def target_history(request, target_id):
    """Real sighting history for a tracked person - empty until they've
    actually been observed at least once (streaming/playback.py logs these
    live, there is no backfill/fake data)."""
    sightings = Sighting.objects.filter(target_id=target_id).select_related('camera')
    return Response([
        {
            'camera_id': s.camera_id,
            'camera_name': s.camera.name,
            'started_at': s.started_at.isoformat(),
            'ended_at': s.ended_at.isoformat() if s.ended_at else None,
            'duration_sec': (s.ended_at - s.started_at).total_seconds() if s.ended_at else None,
        }
        for s in sightings
    ])
