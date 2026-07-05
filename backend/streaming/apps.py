from django.apps import AppConfig


class StreamingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'streaming'

    def ready(self):
        import threading

        def preload():
            try:
                from cameras.models import Camera

                from .preprocessing import load_detections, load_meta

                for camera in Camera.objects.all():
                    if load_meta(camera.id):
                        load_detections(camera.id)
            except Exception:
                # DB not ready yet (e.g. during `manage.py migrate`) - a
                # session starting later will just load lazily instead.
                pass

        # Runs once at process startup so the very first session doesn't
        # pay the (multi-second, per-camera) parse cost - see
        # streaming/preprocessing.py's _detections_cache.
        threading.Thread(target=preload, daemon=True).start()
