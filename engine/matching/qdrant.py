import uuid

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, QueryRequest, VectorParams

from ..settings import QDRANT_URL, REID_DIM

COLLECTION = "tracked_people"


class QdrantMatcher:
    def __init__(self):
        self.client = QdrantClient(url=QDRANT_URL)
        self.empty = True

    def set_targets(self, ids, embeddings):
        if self.client.collection_exists(COLLECTION):
            self.client.delete_collection(COLLECTION)
        self.client.create_collection(COLLECTION, vectors_config=VectorParams(size=REID_DIM, distance=Distance.COSINE))
        points = [PointStruct(id=str(uuid.uuid5(uuid.NAMESPACE_URL, i)), vector=e.tolist(), payload={"target": i})
                  for i, e in zip(ids, embeddings)]
        if points:
            self.client.upsert(COLLECTION, points=points, wait=True)
        self.empty = not points

    def match(self, embeddings):
        if self.empty or not len(embeddings):
            return [(None, 0.0)] * len(embeddings)
        requests = [QueryRequest(query=e.tolist(), limit=1, with_payload=True) for e in embeddings]
        responses = self.client.query_batch_points(COLLECTION, requests=requests)
        out = []
        for response in responses:
            point = response.points[0] if response.points else None
            out.append((point.payload["target"], point.score) if point else (None, 0.0))
        return out

    def close(self):
        self.client.close()
