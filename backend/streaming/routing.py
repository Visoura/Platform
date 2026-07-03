from django.urls import re_path

from .consumers import SessionFeedConsumer

websocket_urlpatterns = [
    re_path(r'^ws/sessions/(?P<session_id>[0-9a-f-]+)/$', SessionFeedConsumer.as_asgi()),
]
