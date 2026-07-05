from django.urls import path

from . import views

urlpatterns = [
    path('preview/', views.preview_tracking, name='tracking-preview'),
    path('confirm/', views.confirm_tracking, name='tracking-confirm'),
    path('clear/', views.clear_tracking, name='tracking-clear'),
    path('untrack/', views.untrack_target, name='tracking-untrack'),
    path('status/', views.tracking_status, name='tracking-status'),
    path('search-by-image/', views.search_by_image, name='tracking-search-by-image'),
    path('<str:target_id>/history/', views.target_history, name='tracking-history'),
]
