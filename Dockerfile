FROM runpod/pytorch:2.4.0-py3.11-cuda12.1.1-devel

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/runpod-volume/huggingface \
    HYMOTION_DIR=/app/HY-Motion-1.0 \
    MODEL_ROOT=/runpod-volume/ckpts/tencent

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    git git-lfs ffmpeg curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN git lfs install \
    && git clone https://github.com/Tencent-Hunyuan/HY-Motion-1.0.git /app/HY-Motion-1.0

WORKDIR /app/HY-Motion-1.0
RUN pip install --upgrade pip \
    && pip install -r requirements.txt

WORKDIR /app
COPY requirements-worker.txt /app/requirements-worker.txt
RUN pip install -r /app/requirements-worker.txt

COPY handler.py /app/handler.py
COPY download_models.py /app/download_models.py

CMD ["python", "-u", "/app/handler.py"]
