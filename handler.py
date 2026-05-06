import json
import os
import shutil
import subprocess
import uuid
from pathlib import Path

# RunPod currently injects RUNPOD_WEBHOOK_GET_JOB with $RUNPOD_POD_ID, while
# runpod-python 1.9.0's job client substitutes $ID. Normalize before importing
# runpod so module-level URL constants are built correctly.
if "$RUNPOD_POD_ID" in os.getenv("RUNPOD_WEBHOOK_GET_JOB", ""):
    os.environ["RUNPOD_WEBHOOK_GET_JOB"] = os.environ["RUNPOD_WEBHOOK_GET_JOB"].replace(
        "$RUNPOD_POD_ID", "$ID"
    )

import runpod

try:
    import boto3
except Exception:  # boto3 optional unless upload env is configured
    boto3 = None

HYMOTION_DIR = Path(os.getenv("HYMOTION_DIR", "/app/HY-Motion-1.0"))
MODEL_ROOT = Path(os.getenv("MODEL_ROOT", "/runpod-volume/ckpts/tencent"))
WORK_ROOT = Path(os.getenv("WORK_ROOT", "/tmp/hymotion-jobs"))


def model_path(variant: str) -> tuple[str, Path]:
    variant = (variant or "lite").lower()
    if variant in {"lite", "hy-motion-1.0-lite", "HY-Motion-1.0-Lite".lower()}:
        return "lite", MODEL_ROOT / "HY-Motion-1.0-Lite"
    if variant in {"full", "standard", "hy-motion-1.0", "HY-Motion-1.0".lower()}:
        full_path = MODEL_ROOT / "HY-Motion-1.0"
        if full_path.exists():
            return "full", full_path
        return "lite", MODEL_ROOT / "HY-Motion-1.0-Lite"
    raise ValueError(f"Unknown model variant: {variant}")


def upload_file(path: Path, job_id: str) -> str | None:
    bucket = os.getenv("S3_BUCKET") or os.getenv("R2_BUCKET")
    endpoint = os.getenv("S3_ENDPOINT_URL") or os.getenv("R2_ENDPOINT_URL")
    access_key = os.getenv("S3_ACCESS_KEY_ID") or os.getenv("R2_ACCESS_KEY_ID")
    secret_key = os.getenv("S3_SECRET_ACCESS_KEY") or os.getenv("R2_SECRET_ACCESS_KEY")
    public_base = os.getenv("S3_PUBLIC_BASE_URL") or os.getenv("R2_PUBLIC_BASE_URL")

    if not all([bucket, endpoint, access_key, secret_key]) or boto3 is None:
        return None

    key_prefix = os.getenv("OUTPUT_PREFIX", "hy-motion")
    key = f"{key_prefix}/{job_id}/{path.name}"
    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=os.getenv("S3_REGION", "auto"),
    )
    client.upload_file(str(path), bucket, key)
    if public_base:
        return f"{public_base.rstrip('/')}/{key}"
    return f"s3://{bucket}/{key}"


def handler(event):
    inp = event.get("input") or {}
    prompt = (inp.get("prompt") or "").strip()
    if not prompt:
        return {"error": "Missing input.prompt"}

    job_id = str(uuid.uuid4())
    job_dir = WORK_ROOT / job_id
    input_dir = job_dir / "input"
    output_dir = job_dir / "output"
    input_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    # HY-Motion works best with short action-focused English prompts.
    (input_dir / "prompt.txt").write_text(prompt, encoding="utf-8")

    requested_variant = inp.get("model") or os.getenv("MODEL_VARIANT", "lite")
    resolved_variant, mp = model_path(requested_variant)
    if not mp.exists():
        return {
            "error": "Model path not found. Run/download checkpoints first or mount persistent volume.",
            "model_path": str(mp),
            "requested_model": requested_variant,
            "resolved_model": resolved_variant,
        }

    cmd = [
        "python3", "local_infer.py",
        "--model_path", str(mp),
        "--input_text_dir", str(input_dir),
        "--output_dir", str(output_dir),
        "--disable_duration_est",
        "--disable_rewrite",
        "--num_seeds", str(int(inp.get("num_seeds", 1))),
    ]

    env = os.environ.copy()
    result = subprocess.run(
        cmd,
        cwd=str(HYMOTION_DIR),
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=int(inp.get("timeout_seconds", os.getenv("INFER_TIMEOUT_SECONDS", "900"))),
    )

    files = [p for p in output_dir.rglob("*") if p.is_file()]
    uploaded = []
    for p in files:
        url = upload_file(p, job_id)
        uploaded.append({"name": p.name, "path": str(p), "url": url})

    response = {
        "job_id": job_id,
        "returncode": result.returncode,
        "files": uploaded,
        "output_dir": str(output_dir),
        "log_tail": result.stdout[-4000:],
    }

    if result.returncode != 0:
        response["error"] = "HY-Motion inference failed"
    return response


runpod.serverless.start({"handler": handler})
