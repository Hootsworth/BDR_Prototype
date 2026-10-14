FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PROTOTYPE_DATA_DIR=/tmp/gtm-data \
    PORT=8080 \
    FIREBASE_PROJECT_ID=bdrcreek \
    FIREBASE_USE_FIRESTORE=true \
    CLERK_BACKEND_AUTH_REQUIRED=true \
    HOSTED_API_ONLY=true

WORKDIR /app
COPY requirements-hosted.txt ./requirements-hosted.txt
RUN pip install --no-cache-dir -r requirements-hosted.txt
COPY server.py firebase_backend.py ./

EXPOSE 8080
CMD ["python", "server.py"]
