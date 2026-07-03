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

# ── Kafka ──────────────────────────────────────────────────────────────────
KAFKA_BOOTSTRAP_SERVERS = os.environ.get('KAFKA_BOOTSTRAP_SERVERS', 'kafka:9092')
KAFKA_TOPIC_FRAMES_RAW = os.environ.get('KAFKA_TOPIC_FRAMES_RAW', 'frames.raw')
KAFKA_TOPIC_FRAMES_PROCESSED = os.environ.get('KAFKA_TOPIC_FRAMES_PROCESSED', 'frames.processed')
KAFKA_TOPIC_PARTITIONS = int(os.environ.get('KAFKA_TOPIC_PARTITIONS', '4'))

# ── Qdrant / tracking ────────────────────────────────────────────────────────
QDRANT_HOST = os.environ.get('QDRANT_HOST', 'qdrant')
QDRANT_PORT = int(os.environ.get('QDRANT_PORT', '6333'))
QDRANT_VECTOR_SIZE = int(os.environ.get('QDRANT_VECTOR_SIZE', '384'))
TRACKING_MATCH_THRESHOLD = float(os.environ.get('TRACKING_MATCH_THRESHOLD', '0.75'))

# ── AI vision-pipeline service (external) ───────────────────────────────────
AI_SERVICE_URL = os.environ.get('AI_SERVICE_URL', 'http://host.docker.internal:3000')
AI_SERVICE_TIMEOUT = float(os.environ.get('AI_SERVICE_TIMEOUT', '25'))

# ── Session / pipeline tuning ────────────────────────────────────────────────
SESSION_MAX_CAMERAS = int(os.environ.get('SESSION_MAX_CAMERAS', '4'))
SESSION_START_DELAY_SECONDS = float(os.environ.get('SESSION_START_DELAY_SECONDS', '5'))
PRODUCER_TARGET_FPS = float(os.environ.get('PRODUCER_TARGET_FPS', '10'))
PRODUCER_BATCH_SIZE = int(os.environ.get('PRODUCER_BATCH_SIZE', '4'))
PRODUCER_FRAME_SIZE = (
    int(os.environ.get('PRODUCER_FRAME_WIDTH', '640')),
    int(os.environ.get('PRODUCER_FRAME_HEIGHT', '360')),
)
GPU_CONSUMER_BATCH_SIZE = int(os.environ.get('GPU_CONSUMER_BATCH_SIZE', '8'))
GPU_CONSUMER_POLL_TIMEOUT = float(os.environ.get('GPU_CONSUMER_POLL_TIMEOUT', '0.5'))
