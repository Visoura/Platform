from django.core.management.base import BaseCommand, CommandError

from cameras.models import Camera
from streaming.preprocessing import run_preprocessing


class Command(BaseCommand):
    help = (
        'Run detection+embedding once per camera video, caching results to '
        'disk so sessions can replay them without calling the AI service '
        '(see streaming/playback.py).'
    )

    def add_arguments(self, parser):
        parser.add_argument('camera_id', type=int)
        parser.add_argument('--fps', type=float, default=None)
        parser.add_argument('--duration', type=float, default=None, help='Seconds of source video to preprocess')

    def handle(self, *args, **options):
        try:
            camera = Camera.objects.get(pk=options['camera_id'])
        except Camera.DoesNotExist:
            raise CommandError(f"No camera with id={options['camera_id']}")

        run_preprocessing(
            camera,
            fps=options['fps'],
            duration=options['duration'],
            progress=lambda msg: self.stdout.write(msg),
        )
        self.stdout.write(self.style.SUCCESS(f'Preprocessing complete for camera {camera.id} ({camera.name})'))
