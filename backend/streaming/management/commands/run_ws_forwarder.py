"""
Consumes "frames.processed" and pushes each frame to the websocket group for
its session, via the Channels layer (Redis-backed, so it works across
processes even though the actual websocket connections live in the ASGI
`backend` process).

Tracking mode is global and derived straight from the tracked_people Qdrant
collection: if it has any points, every frame's detections are matched
against it and only boxes whose closest tracked embedding is above the
similarity threshold are kept; otherwise every detected box is forwarded as-is.
"""
import json

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.core.management.base import BaseCommand

from streaming.kafka_utils import ensure_topics, get_consumer
from tracking.vector_storage import VectorStorage


class Command(BaseCommand):
    help = 'Consume frames.processed, apply tracking-mode filtering, forward to session websockets'

    def handle(self, *args, **options):
        ensure_topics()

        storage = VectorStorage()
        channel_layer = get_channel_layer()
        threshold = settings.TRACKING_MATCH_THRESHOLD

        consumer = get_consumer(group_id='ws-forwarder')
        consumer.subscribe([settings.KAFKA_TOPIC_FRAMES_PROCESSED])

        self.stdout.write(self.style.SUCCESS('WS forwarder started'))

        try:
            while True:
                msg = consumer.poll(timeout=1.0)
                if msg is None or msg.error():
                    continue
                try:
                    parsed = json.loads(msg.value())
                except (ValueError, TypeError):
                    continue

                boxes = self._build_boxes(parsed.get('detections', []), storage, threshold)

                payload = {
                    'camera_id': parsed['camera_id'],
                    'camera_name': parsed.get('camera_name'),
                    'frame_seq': parsed['frame_seq'],
                    'timestamp': parsed['timestamp'],
                    'frame': parsed['frame'],
                    'boxes': boxes,
                }
                async_to_sync(channel_layer.group_send)(
                    f"session_{parsed['session_id']}",
                    {'type': 'frame.message', 'payload': payload},
                )
        finally:
            consumer.close()

    def _build_boxes(self, detections, storage, threshold):
        if not detections:
            return []

        tracking_enabled = storage.count_points() > 0

        if not tracking_enabled:
            return [
                {'bbox': d['bbox'], 'confidence': d['confidence'], 'matched': False}
                for d in detections
            ]

        embeddings = [d['embedding'] for d in detections]
        matches = storage.search_similar_batch(embeddings, limit=1, threshold=threshold)

        boxes = []
        for det, match_points in zip(detections, matches):
            if match_points:
                boxes.append({
                    'bbox': det['bbox'],
                    'confidence': det['confidence'],
                    'matched': True,
                    'target_id': match_points[0].id,
                    'score': match_points[0].score,
                })
        return boxes
