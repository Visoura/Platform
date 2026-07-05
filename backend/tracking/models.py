from django.db import models

from cameras.models import Camera


class Sighting(models.Model):
    """A continuous period a tracked person (identified by target_id, a
    Qdrant point id - not a DB relation, since tracked people themselves
    aren't stored here) was visible on a given camera. Logged live by
    streaming/playback.py as people are actually observed - there is no
    backfill, a person's history starts empty and fills in only from real
    sightings going forward.
    """
    target_id = models.CharField(max_length=64, db_index=True)
    camera = models.ForeignKey(Camera, on_delete=models.CASCADE, related_name='sightings')
    started_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return f'{self.target_id} on {self.camera} @ {self.started_at}'
