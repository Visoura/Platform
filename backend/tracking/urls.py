from django.urls import path

from . import views

urlpatterns = [
    path('start/', views.start_tracking, name='tracking-start'),
    path('confirm/', views.confirm_tracking, name='tracking-confirm'),
    path('clear/', views.clear_tracking, name='tracking-clear'),
    path('untrack/', views.untrack_target, name='tracking-untrack'),
    path('status/', views.tracking_status, name='tracking-status'),
]
