from rest_framework import viewsets

from .models import Camera
from .serializers import CameraSerializer


class CameraViewSet(viewsets.ReadOnlyModelViewSet):
    """Cameras are fixed/uploaded through the Django admin; the API only lists them."""

    queryset = Camera.objects.filter(is_active=True)
    serializer_class = CameraSerializer
