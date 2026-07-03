from django.db import models


class Camera(models.Model):
    name = models.CharField(max_length=100)
    file_path = models.CharField(
        max_length=255,
        help_text='Absolute path to the video file on disk (e.g. /app/media/videos/cam1.mp4).',
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return self.name
