from rest_framework.routers import DefaultRouter

from .views import MonitoringSessionViewSet

router = DefaultRouter()
router.register(r'sessions', MonitoringSessionViewSet)

urlpatterns = router.urls
