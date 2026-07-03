import time

from django.conf import settings
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from streaming.producer import start_session_producers, stop_session_producers

from .models import MonitoringSession
from .serializers import MonitoringSessionSerializer


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

        # Start pushing this session's camera frames into Kafka (queue1)
        # straight away, in background threads, so the pipeline is already
        # warm by the time we respond.
        start_session_producers(session)

        # Hold the response for a few seconds while frames flow through the
        # GPU consumer into queue2, so a small buffer is already available
        # once the frontend opens its websocket right after this returns.
        time.sleep(settings.SESSION_START_DELAY_SECONDS)

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
