"""Download HY-Motion checkpoints into the persistent RunPod volume.

Run manually inside a pod/worker image if the HF repo layout changes.
"""
import os
import subprocess
from pathlib import Path

MODEL_ROOT = Path(os.getenv("MODEL_ROOT", "/app/HY-Motion-1.0/ckpts/tencent"))
REPO = "tencent/HY-Motion-1.0"
VARIANT = os.getenv("MODEL_VARIANT", "lite").lower()

MODEL_ROOT.mkdir(parents=True, exist_ok=True)

allow_patterns = None
if VARIANT in {"lite", "hy-motion-1.0-lite"}:
    allow_patterns = ["HY-Motion-1.0-Lite/*"]
elif VARIANT in {"full", "standard", "hy-motion-1.0"}:
    allow_patterns = ["HY-Motion-1.0/*"]

code = (
    "from huggingface_hub import snapshot_download; "
    f"snapshot_download(repo_id={REPO!r}, local_dir={str(MODEL_ROOT)!r}, "
    f"local_dir_use_symlinks=False, allow_patterns={allow_patterns!r})"
)
subprocess.check_call(["python", "-c", code])
print(f"Downloaded HY-Motion files to {MODEL_ROOT}")
