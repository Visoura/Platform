import json

from confluent_kafka import Consumer, Producer
from confluent_kafka.admin import AdminClient, NewTopic
from django.conf import settings

_producer = None


def ensure_topics():
    admin = AdminClient({'bootstrap.servers': settings.KAFKA_BOOTSTRAP_SERVERS})
    existing = set(admin.list_topics(timeout=10).topics.keys())
    wanted = [settings.KAFKA_TOPIC_FRAMES_RAW, settings.KAFKA_TOPIC_FRAMES_PROCESSED]
    missing = [t for t in wanted if t not in existing]
    if not missing:
        return
    new_topics = [
        NewTopic(t, num_partitions=settings.KAFKA_TOPIC_PARTITIONS, replication_factor=1)
        for t in missing
    ]
    futures = admin.create_topics(new_topics)
    for _topic, fut in futures.items():
        try:
            fut.result()
        except Exception:
            pass  # already exists, or racing with another worker doing the same


def get_producer() -> Producer:
    global _producer
    if _producer is None:
        _producer = Producer({'bootstrap.servers': settings.KAFKA_BOOTSTRAP_SERVERS})
    return _producer


def produce_json(topic: str, key: str, value: dict):
    producer = get_producer()
    producer.produce(topic, key=key.encode('utf-8'), value=json.dumps(value).encode('utf-8'))
    producer.poll(0)


def get_consumer(group_id: str) -> Consumer:
    return Consumer({
        'bootstrap.servers': settings.KAFKA_BOOTSTRAP_SERVERS,
        'group.id': group_id,
        'auto.offset.reset': 'latest',
        'enable.auto.commit': True,
    })
