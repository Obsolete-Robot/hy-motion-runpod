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
