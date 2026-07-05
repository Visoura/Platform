from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from streaming.playback import start_session_producers, stop_session_producers
from tracking.vector_storage import VectorStorage

from .models import MonitoringSession
from .serializers import MonitoringSessionSerializer

_tracking_storage = VectorStorage()


class MonitoringSessionViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """
    GET  /api/sessions/       -> list every session started before (active + terminated)
    POST /api/sessions/       -> create + start a new session (max SESSION_MAX_CAMERAS cameras)
    POST /api/sessions/{id}/terminate/
    """

    queryset = MonitoringSession.objects.all().prefetch_related('cameras')
    serializer_class = MonitoringSessionSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session = serializer.save()

        # Tracking is global (see tracking/vector_storage.py), not scoped to
        # a session - clear it on every new session start so you never begin
        # watching with stale tracked people left over from a previous run.
        _tracking_storage.clear()

        # Frames+detections are already sitting on disk (see
        # streaming/preprocessing.py) - playback threads can start streaming
        # them to the websocket group immediately, no warm-up delay needed.
        start_session_producers(session)

        out = self.get_serializer(session)
        return Response(out.data, status=201)

    @action(detail=True, methods=['post'])
    def terminate(self, request, pk=None):
        session = self.get_object()
        session.status = 'terminated'
        session.ended_at = timezone.now()
        session.save(update_fields=['status', 'ended_at'])
        stop_session_producers(session.id)
        return Response({'status': 'terminated'})
