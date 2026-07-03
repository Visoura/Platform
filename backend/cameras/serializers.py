from rest_framework import serializers

from .models import Camera


class CameraSerializer(serializers.ModelSerializer):
    class Meta:
        model = Camera
        fields = ['id', 'name', 'file_path', 'is_active', 'created_at']
