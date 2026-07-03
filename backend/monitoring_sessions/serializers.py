from django.conf import settings
from rest_framework import serializers

from cameras.models import Camera
from cameras.serializers import CameraSerializer

from .models import MonitoringSession


class MonitoringSessionSerializer(serializers.ModelSerializer):
    cameras = serializers.PrimaryKeyRelatedField(
        queryset=Camera.objects.filter(is_active=True), many=True, write_only=True
    )
    cameras_detail = CameraSerializer(source='cameras', many=True, read_only=True)

    class Meta:
        model = MonitoringSession
        fields = ['id', 'cameras', 'cameras_detail', 'status', 'created_at', 'ended_at']
        read_only_fields = ['id', 'status', 'created_at', 'ended_at']

    def validate_cameras(self, cameras):
        if not cameras:
            raise serializers.ValidationError('Select at least one camera.')
        if len(cameras) > settings.SESSION_MAX_CAMERAS:
            raise serializers.ValidationError(
                f'A session supports at most {settings.SESSION_MAX_CAMERAS} cameras.'
            )
        return cameras
