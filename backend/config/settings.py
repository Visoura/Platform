import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'django-insecure-dev-key-change-me')
DEBUG = os.environ.get('DEBUG', '1') == '1'
ALLOWED_HOSTS = [h.strip() for h in os.environ.get('ALLOWED_HOSTS', '*').split(',') if h.strip()]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'channels',
    'cameras',
    'monitoring_sessions',
    'tracking',
    'streaming',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('POSTGRES_DB', 'platform'),
        'USER': os.environ.get('POSTGRES_USER', 'platform'),
        'PASSWORD': os.environ.get('POSTGRES_PASSWORD', 'platform'),
        'HOST': os.environ.get('POSTGRES_HOST', 'postgres'),
        'PORT': os.environ.get('POSTGRES_PORT', '5432'),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    'DEFAULT_PERMISSION_CLASSES': [],
}

CORS_ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get(
        'CORS_ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173'
    ).split(',') if o.strip()
]

REDIS_URL = os.environ.get('REDIS_URL', 'redis://redis:6379/0')

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [REDIS_URL],
        },
    },
}

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': REDIS_URL,
    }
}

# ── Qdrant / tracking ────────────────────────────────────────────────────────
QDRANT_HOST = os.environ.get('QDRANT_HOST', 'qdrant')
QDRANT_PORT = int(os.environ.get('QDRANT_PORT', '6333'))
QDRANT_VECTOR_SIZE = int(os.environ.get('QDRANT_VECTOR_SIZE', '384'))
TRACKING_MATCH_THRESHOLD = float(os.environ.get('TRACKING_MATCH_THRESHOLD', '0.75'))

# ── AI vision-pipeline service (external) ───────────────────────────────────
# Only ever called by the preprocess_camera management command now - live
# sessions replay precomputed results, they never call the AI service.
AI_SERVICE_URL = os.environ.get('AI_SERVICE_URL', 'http://host.docker.internal:3000')
AI_SERVICE_TIMEOUT = float(os.environ.get('AI_SERVICE_TIMEOUT', '25'))

# ── Session tuning ───────────────────────────────────────────────────────────
SESSION_MAX_CAMERAS = int(os.environ.get('SESSION_MAX_CAMERAS', '4'))

# ── Preprocessing (offline detection+embedding extraction) ──────────────────
# Every frame of the source video is processed - no sampling, no duration
# cap (see streaming/preprocessing.py). Source videos are expected to
# already be trimmed to a reasonable length before preprocessing.
PREPROCESS_BATCH_SIZE = int(os.environ.get('PREPROCESS_BATCH_SIZE', '16'))
PREPROCESS_FRAME_SIZE = (
    int(os.environ.get('PREPROCESS_FRAME_WIDTH', '640')),
    int(os.environ.get('PREPROCESS_FRAME_HEIGHT', '360')),
)
