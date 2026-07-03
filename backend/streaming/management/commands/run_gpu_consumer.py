"""
Consumes "frames.raw", calls the AI service in batches, publishes
frame + detections + embeddings to "frames.processed".

Fairness: a session can have up to SESSION_MAX_CAMERAS cameras all producing
at the same time. A naive consumer.consume(N) can end up dominated by
whichever camera's messages happen to be queued first, starving the others
for that cycle. Instead we cap how many frames any single camera may
contribute to a given AI-service batch (PER_CAMERA_CAP = BATCH_SIZE //
SESSION_MAX_CAMERAS) and carry over any excess into a per-camera buffer for
the next cycle - so every camera gets fair, bounded representation in each
GPU call, and no frame already pulled off Kafka is ever dropped.
"""
import json
import time
from collections import defaultdict, deque

from django.conf import settings
from django.core.management.base import BaseCommand

from streaming.ai_client import call_ai_batch
from streaming.kafka_utils import ensure_topics, get_consumer, produce_json


class Command(BaseCommand):
    help = 'Consume frames.raw in fair batches, run detection+embedding, publish to frames.processed'

    def handle(self, *args, **options):
        ensure_topics()

        batch_size = settings.GPU_CONSUMER_BATCH_SIZE
        per_camera_cap = max(1, batch_size // settings.SESSION_MAX_CAMERAS)
        poll_timeout = settings.GPU_CONSUMER_POLL_TIMEOUT

        consumer = get_consumer(group_id='gpu-consumer')
        consumer.subscribe([settings.KAFKA_TOPIC_FRAMES_RAW])

        # camera_id -> deque of parsed messages not yet included in a batch
        pending = defaultdict(deque)

        self.stdout.write(self.style.SUCCESS('GPU consumer started'))

        try:
            while True:
                batch = self._collect_fair_batch(consumer, pending, batch_size, per_camera_cap, poll_timeout)
                if not batch:
                    continue

                frames_b64 = [m['frame'] for m in batch]
                results = call_ai_batch(frames_b64)

                for msg, detections in zip(batch, results):
                    produce_json(
                        settings.KAFKA_TOPIC_FRAMES_PROCESSED,
                        key=str(msg['camera_id']),
                        value={
                            'session_id': msg['session_id'],
                            'camera_id': msg['camera_id'],
                            'camera_name': msg.get('camera_name'),
                            'frame_seq': msg['frame_seq'],
                            'timestamp': msg['timestamp'],
                            'frame': msg['frame'],
                            'detections': detections,
                        },
                    )
        finally:
            consumer.close()

    def _collect_fair_batch(self, consumer, pending, batch_size, per_camera_cap, poll_timeout):
        batch = []
        counts = defaultdict(int)

        # 1) Drain carried-over messages from previous cycles first, round-robin.
        made_progress = True
        while len(batch) < batch_size and made_progress:
            made_progress = False
            for camera_id in list(pending.keys()):
                if len(batch) >= batch_size:
                    break
                if counts[camera_id] >= per_camera_cap:
                    continue
                queue = pending[camera_id]
                if not queue:
                    continue
                batch.append(queue.popleft())
                counts[camera_id] += 1
                made_progress = True
                if not queue:
                    del pending[camera_id]

        # 2) Pull fresh messages from Kafka for whatever time budget remains.
        deadline = time.monotonic() + poll_timeout
        while len(batch) < batch_size and time.monotonic() < deadline:
            msg = consumer.poll(timeout=max(0.0, deadline - time.monotonic()))
            if msg is None:
                continue
            if msg.error():
                continue
            try:
                parsed = json.loads(msg.value())
            except (ValueError, TypeError):
                continue

            camera_id = parsed.get('camera_id')
            if counts[camera_id] < per_camera_cap:
                batch.append(parsed)
                counts[camera_id] += 1
            else:
                # This camera already has its fair share this cycle - hold the
                # frame for the next one instead of dropping it.
                pending[camera_id].append(parsed)

        return batch
