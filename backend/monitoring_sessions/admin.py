from django.contrib import admin

from .models import MonitoringSession


@admin.register(MonitoringSession)
class MonitoringSessionAdmin(admin.ModelAdmin):
    list_display = ('id', 'status', 'created_at', 'ended_at')
    list_filter = ('status',)
    filter_horizontal = ('cameras',)
