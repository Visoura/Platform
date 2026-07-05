import time
from typing import Any, Dict

from django.conf import settings
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, QueryRequest, VectorParams

COLLECTION_NAME = 'tracked_people'
COUNT_CACHE_SECONDS = 1.0

# Module-level (not per-instance) so every VectorStorage() created anywhere
# in the process (tracking/views.py, streaming/playback.py,
# monitoring_sessions/views.py each make their own) shares one cache. A
# per-instance cache meant tracking/untracking through one instance didn't
# invalidate the stale "tracking disabled" reading held by another - the
# live playback thread could then miss a just-tracked person for up to
# COUNT_CACHE_SECONDS after the click.
_count_cache = None
_count_cache_at = 0.0


class VectorStorage:
    """Qdrant-backed store of the embeddings for people currently being tracked.

    Global by design: tracking mode is considered "on" whenever this
    collection is non-empty, and that state is shared by every active
    monitoring session (checked by the playback thread on every frame).
    """

    def __init__(self):
        self.client = QdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)
        self.collection_name = COLLECTION_NAME
        self.vector_size = settings.QDRANT_VECTOR_SIZE
        self._ensure_collection()

    def _invalidate_count_cache(self):
        global _count_cache
        _count_cache = None

    def _ensure_collection(self):
        try:
            collections = self.client.get_collections().collections
            if not any(c.name == self.collection_name for c in collections):
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(size=self.vector_size, distance=Distance.COSINE),
                )
        except Exception:
            pass

    def clear(self):
        try:
            self.client.delete_collection(self.collection_name)
            self._ensure_collection()
        except Exception:
            pass
        self._invalidate_count_cache()

    def delete(self, point_id: Any):
        try:
            self.client.delete(
                collection_name=self.collection_name,
                points_selector=[str(point_id)],
            )
        except Exception:
            pass
        self._invalidate_count_cache()

    def upsert(self, point_id: Any, embedding: list, metadata: Dict[str, Any]):
        self.client.upsert(
            collection_name=self.collection_name,
            points=[PointStruct(id=str(point_id), vector=embedding, payload=metadata)],
        )
        self._invalidate_count_cache()

    def search_similar_batch(self, embeddings: list, limit: int = 1, threshold: float = 0.75):
        """One Qdrant round-trip for the whole frame's detections, not one
        per detection - a frame with several people would otherwise mean
        several sequential network calls before it could be sent, which
        shows up as real, visible per-frame latency spikes during playback."""
        if not embeddings:
            return []
        try:
            requests = [QueryRequest(query=emb, limit=limit, with_payload=True) for emb in embeddings]
            responses = self.client.query_batch_points(collection_name=self.collection_name, requests=requests)
            return [[p for p in res.points if p.score >= threshold] for res in responses]
        except Exception:
            return [[] for _ in embeddings]

    def count_points(self) -> int:
        """Cached briefly - this is checked on every single frame across every
        playback thread just to know whether tracking mode is on, and that
        state changes rarely, so a fresh Qdrant round-trip every frame is
        pure unnecessary overhead. Shared across all instances (see the
        module-level _count_cache) and invalidated immediately by
        upsert/delete/clear, so a track/untrack action is never masked by a
        stale read from a different VectorStorage() instance."""
        global _count_cache, _count_cache_at
        now = time.monotonic()
        if _count_cache is not None and (now - _count_cache_at) < COUNT_CACHE_SECONDS:
            return _count_cache
        try:
            count = self.client.count(collection_name=self.collection_name).count
        except Exception:
            count = 0
        _count_cache = count
        _count_cache_at = now
        return count
