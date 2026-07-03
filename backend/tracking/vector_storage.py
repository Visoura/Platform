from typing import Any, Dict

from django.conf import settings
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

COLLECTION_NAME = 'tracked_people'


class VectorStorage:
    """Qdrant-backed store of the embeddings for people currently being tracked.

    Global by design: tracking mode is considered "on" whenever this
    collection is non-empty, and that state is shared by every active
    monitoring session (checked by the ws-forwarder worker on every frame).
    """

    def __init__(self):
        self.client = QdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)
        self.collection_name = COLLECTION_NAME
        self.vector_size = settings.QDRANT_VECTOR_SIZE
        self._ensure_collection()

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

    def upsert(self, point_id: Any, embedding: list, metadata: Dict[str, Any]):
        self.client.upsert(
            collection_name=self.collection_name,
            points=[PointStruct(id=str(point_id), vector=embedding, payload=metadata)],
        )

    def search_similar_batch(self, embeddings: list, limit: int = 1, threshold: float = 0.75):
        results = []
        for emb in embeddings:
            try:
                res = self.client.query_points(
                    collection_name=self.collection_name,
                    query=emb,
                    limit=limit,
                    with_payload=True,
                )
                points = [p for p in res.points if p.score >= threshold]
            except Exception:
                points = []
            results.append(points)
        return results

    def count_points(self) -> int:
        try:
            return self.client.count(collection_name=self.collection_name).count
        except Exception:
            return 0
