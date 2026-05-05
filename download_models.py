"""Download HY-Motion checkpoints into the persistent RunPod volume.

Run manually inside a pod/worker image if the HF repo layout changes.
"""
import os
import subprocess
from pathlib import Path

MODEL_ROOT = Path(os.getenv("MODEL_ROOT", "/runpod-volume/ckpts/tencent"))
REPO = "tencent/HY-Motion-1.0"

MODEL_ROOT.mkdir(parents=True, exist_ok=True)

# Prefer huggingface_hub snapshot_download if available; fallback instructions are in README.
subprocess.check_call([
    "python", "-c",
    "from huggingface_hub import snapshot_download; "
    f"snapshot_download(repo_id='{REPO}', local_dir='{MODEL_ROOT}', local_dir_use_symlinks=False)"
])
print(f"Downloaded HY-Motion files to {MODEL_ROOT}")
