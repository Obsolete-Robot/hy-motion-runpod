# HY-Motion RunPod Serverless Worker

RunPod Serverless wrapper for Tencent HY-Motion 1.0 text-to-3D human motion generation.

## Request

```json
{
  "input": {
    "prompt": "A person walks forward, trips, catches balance, then waves.",
    "model": "lite",
    "duration": 4,
    "num_seeds": 1
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

The Docker image bakes in the HY-Motion 1.0 Lite checkpoint under `/app/ckpts/tencent/HY-Motion-1.0-Lite` so RunPod Serverless can run with no network volume attached. To use the full checkpoint, either bake it into a separate image or attach/populate a RunPod network volume and set `MODEL_ROOT` accordingly.
