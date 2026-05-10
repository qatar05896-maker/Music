# ==========================================
# المرحلة الأولى: بناء المحرك الحقيقي بلغة Go
# ==========================================
FROM golang:1.26-bookworm AS go-builder
WORKDIR /app

RUN go mod init webrtc-engine
RUN go get github.com/pion/webrtc/v4
COPY main.go .
RUN CGO_ENABLED=0 GOOS=linux go build -o webrtc-engine main.go

# ==========================================
# المرحلة الثانية: بيئة Ubuntu 24.04 
# ==========================================
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

# تحديث وتسطيب الأدوات
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

# نقل ملف المكتبات وتسطيبه
COPY requirements.txt /app/
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir -r /app/requirements.txt

# نسخ ملفات المشروع بالكامل
COPY backend /app/backend
COPY frontend /app/frontend
COPY --from=go-builder /app/webrtc-engine /usr/local/bin/webrtc-engine
RUN chmod +x /usr/local/bin/webrtc-engine

# إعداد Nginx على بورت 8080 وتوزيع الطلبات
RUN echo 'server { \
    listen 8080; \
    server_name _; \
    \
    # الواجهة الأمامية \
    location / { \
        root /app/frontend; \
        index index.html; \
        try_files $uri $uri/ /index.html; \
    } \
    \
    # الشات (WebSockets) - بايثون 8000 \
    location /ws/ { \
        proxy_pass http://127.0.0.1:8000; \
        proxy_http_version 1.1; \
        proxy_set_header Upgrade $http_upgrade; \
        proxy_set_header Connection "Upgrade"; \
        proxy_set_header Host $host; \
    } \
    \
    # الواتساب والـ API - بايثون 8000 \
    location /api/ { \
        proxy_pass http://127.0.0.1:8000; \
        proxy_set_header Host $host; \
    } \
    \
    # مكالمات الفيديو والصوت - جو 8081 \
    location /join { \
        proxy_pass http://127.0.0.1:8081; \
        proxy_set_header Host $host; \
    } \
}' > /etc/nginx/sites-available/default

# إعداد Supervisor لتشغيل كل الخدمات
RUN echo '[supervisord]\n\
nodaemon=true\n\
user=root\n\
\n[program:nginx]\n\
command=nginx -g "daemon off;"\n\
autorestart=true\n\
\n[program:fastapi_backend]\n\
command=/opt/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000\n\
directory=/app/backend\n\
autorestart=true\n\
\n[program:webrtc_engine]\n\
command=/usr/local/bin/webrtc-engine\n\
autorestart=true' > /etc/supervisor/conf.d/supervisord.conf

# فتح بورت 8080 وبورتات المكالمات
EXPOSE 8080
EXPOSE 10000-20000/udp

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
