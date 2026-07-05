from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from streaming.preprocessing import get_status, start_preprocessing_async

from .models import Camera
from .serializers import CameraSerializer


class CameraViewSet(viewsets.ReadOnlyModelViewSet):
    """Cameras are fixed/uploaded through the Django admin; the API only lists them."""

    queryset = Camera.objects.filter(is_active=True)
    serializer_class = CameraSerializer

    @action(detail=True, methods=['post'])
    def preprocess(self, request, pk=None):
        """Kicks off detection+embedding extraction for this camera's video
        in a background thread (see streaming/preprocessing.py). A session
        can only be started for a camera once this has completed."""
        camera = self.get_object()
        started = start_preprocessing_async(camera)
        return Response({'status': 'started' if started else 'already_running'})

    @action(detail=True, methods=['get'], url_path='preprocess-status')
    def preprocess_status(self, request, pk=None):
        camera = self.get_object()
        return Response(get_status(camera.id))
