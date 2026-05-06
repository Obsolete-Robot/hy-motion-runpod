FROM runpod/pytorch:0.7.2-dev-cu1241-torch251-ubuntu2204

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/app/.cache/huggingface \
    HYMOTION_DIR=/app/HY-Motion-1.0 \
    MODEL_ROOT=/app/ckpts/tencent \
    PYTHON=/usr/bin/python3.10

RUN ln -sf /usr/bin/python3.10 /usr/local/bin/python \
    && ln -sf /usr/bin/python3.10 /usr/local/bin/python3 \
    && ln -sf /usr/local/lib/python3.10/dist-packages/pip /usr/local/bin/pip \
    && ln -sf /usr/local/lib/python3.10/dist-packages/pip /usr/local/bin/pip3

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    git git-lfs ffmpeg curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN git lfs install \
    && git clone https://github.com/Tencent-Hunyuan/HY-Motion-1.0.git /app/HY-Motion-1.0

WORKDIR /app/HY-Motion-1.0
RUN python -m pip install --upgrade pip \
    && python -m pip install -r requirements.txt

RUN python - <<'PY'
from huggingface_hub import snapshot_download
snapshot_download(
    repo_id="tencent/HY-Motion-1.0",
    local_dir="/app/ckpts/tencent",
    local_dir_use_symlinks=False,
    allow_patterns=["HY-Motion-1.0-Lite/*"],
)
PY

WORKDIR /app
COPY requirements-worker.txt /app/requirements-worker.txt
RUN python -m pip install -r /app/requirements-worker.txt

COPY handler.py /app/handler.py
COPY download_models.py /app/download_models.py

CMD ["/usr/bin/python3.10", "-u", "/app/handler.py"]
