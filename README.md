# HY-Motion RunPod Serverless Worker

RunPod Serverless wrapper for Tencent HY-Motion 1.0 text-to-3D human motion generation.

## Request

```json
{
  "input": {
    "prompt": "A person walks forward, trips, catches balance, then waves.",
    "model": "lite",
    "duration_seconds": 5,
    "num_seeds": 1,
    "cfg_scale": 5,
    "disable_rewrite": true,
    "disable_duration_est": true
  }
}
```

## Response

```json
{
  "job_id": "...",
  "files": [...],
  "output_dir": "..."
}
```

For production, configure S3/R2 env vars so outputs are uploaded and returned as URLs.

The Docker image bakes in both HY-Motion 1.0 Lite and Full checkpoints under `/app/HY-Motion-1.0/ckpts/tencent/` so RunPod Serverless can serve either `model: "lite"` or `model: "full"` with no network volume attached. The worker also accepts `duration_seconds`, `duration_frames`, `cfg_scale`, `validation_steps`, `disable_rewrite`, and `disable_duration_est`.
