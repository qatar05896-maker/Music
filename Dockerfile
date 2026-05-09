# ==========================================
# المرحلة الأولى: بناء المحرك الحقيقي بلغة Go
# ==========================================
FROM golang:1.22-bookworm AS go-builder
WORKDIR /app

# تهيئة مشروع Go وتحميل مكتبة Pion 
RUN go mod init webrtc-engine
RUN go get github.com/pion/webrtc/v4

# نسخ كود المحرك الحقيقي وبناء ملف تنفيذي يستغل المعالج
COPY main.go .
RUN CGO_ENABLED=0 GOOS=linux go build -o webrtc-engine main.go

# ==========================================
# المرحلة الثانية: بيئة Ubuntu 24.04 (الدبابة)
# ==========================================
FROM ubuntu:24.04

# منع النوافذ التفاعلية أثناء التسطيب لضمان سرعة البناء
ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# 1. تحديث النظام وتثبيت أعتى الأدوات (بايثون، FFmpeg، Nginx، Supervisor)
RUN apt-get update && apt-get install -y \
    python3.12 \
    python3-pip \
    python3-venv \
    nginx \
    supervisor \
    ffmpeg \
    curl \
    htop \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# 2. إنشاء بيئة بايثون معزولة وتسطيب مكتبات الشات والواتساب
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir fastapi uvicorn websockets requests

# 3. نسخ المحرك الجبار من المرحلة الأولى
COPY --from=go-builder /app/webrtc-engine /usr/local/bin/webrtc-engine
RUN chmod +x /usr/local/bin/webrtc-engine

# 4. إعدادات Nginx للتوجيه بين الموقع، الشات، والمكالمات
RUN echo 'server { \
    listen 80; \
    server_name _; \
    location / { root /app/frontend; index index.html; } \
    location /ws { proxy_pass http://127.0.0.1:8000; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "Upgrade"; } \
    location /sdp { proxy_pass http://127.0.0.1:8081; } \
}' > /etc/nginx/sites-available/default

# 5. إعداد Supervisor (عشان لو أي حاجة فصلت ترجع في جزء من الثانية)
RUN echo '[supervisord]\n\
nodaemon=true\n\
user=root\n\
\n[program:nginx]\n\
command=nginx -g "daemon off;"\n\
autorestart=true\n\
\n[program:fastapi_backend]\n\
command=/opt/venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000\n\
autorestart=true\n\
\n[program:webrtc_engine]\n\
command=/usr/local/bin/webrtc-engine\n\
autorestart=true' > /etc/supervisor/conf.d/supervisord.conf

# إنشاء كود بايثون وهمي مؤقت عشان الـ Supervisor ميطلعش إيرور لحد ما نبرمج الواتساب
RUN mkdir -p /app/backend /app/frontend
RUN echo 'from fastapi import FastAPI\napp = FastAPI()' > /app/backend/main.py

# فتح بورت 80 للويب، وبورتات الـ UDP عشان صوت المكالمات يبقى أنقى من التليفون
EXPOSE 80
EXPOSE 10000-20000/udp

# الانطلاق
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
