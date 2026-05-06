#!/usr/bin/env python3
"""Create the HY-Motion RunPod Serverless template and endpoint.

Reads:
  RUNPOD_API_KEY or ~/.config/runpod/api-key
  R2 env vars from ~/.config/hy-motion/r2.env by default

Does not print secret values.
"""
import json
import os
import urllib.request
from pathlib import Path

RUNPOD_KEY_PATH = Path(os.getenv("RUNPOD_API_KEY_FILE", "~/.config/runpod/api-key")).expanduser()
R2_ENV_PATH = Path(os.getenv("R2_ENV_FILE", "~/.config/hy-motion/r2.env")).expanduser()
IMAGE = os.getenv("HYMOTION_IMAGE", "ghcr.io/obsolete-robot/hy-motion-runpod:latest")
TEMPLATE_NAME = os.getenv("RUNPOD_TEMPLATE_NAME", "hy-motion-runpod")
ENDPOINT_NAME = os.getenv("RUNPOD_ENDPOINT_NAME", "hy-motion")
GPU_IDS = os.getenv("RUNPOD_GPU_IDS", "AMPERE_48")
WORKERS_MIN = int(os.getenv("RUNPOD_WORKERS_MIN", "0"))
WORKERS_MAX = int(os.getenv("RUNPOD_WORKERS_MAX", "1"))
IDLE_TIMEOUT = int(os.getenv("RUNPOD_IDLE_TIMEOUT", "5"))
CONTAINER_DISK_GB = int(os.getenv("RUNPOD_CONTAINER_DISK_GB", "30"))


def load_key() -> str:
    key = os.getenv("RUNPOD_API_KEY")
    if key:
        return key.strip()
    if RUNPOD_KEY_PATH.exists():
        return RUNPOD_KEY_PATH.read_text().strip()
    raise SystemExit(f"Missing RunPod API key. Set RUNPOD_API_KEY or create {RUNPOD_KEY_PATH}")


def load_env_file(path: Path) -> dict[str, str]:
    out = {}
    if not path.exists():
        raise SystemExit(f"Missing R2 env file: {path}")
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def gql(api_key: str, query: str) -> dict:
    data = json.dumps({"query": query}).encode()
    req = urllib.request.Request(
        f"https://api.runpod.io/graphql?api_key={api_key}",
        data=data,
        headers={"content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = json.load(resp)
    if body.get("errors"):
        raise SystemExit(json.dumps(body["errors"], indent=2))
    return body["data"]


def gql_string(value: str) -> str:
    return json.dumps(value)


def main() -> None:
    api_key = load_key()
    r2 = load_env_file(R2_ENV_PATH)
    required = ["R2_ENDPOINT_URL", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]
    missing = [k for k in required if not r2.get(k)]
    if missing:
        raise SystemExit(f"Missing R2 env keys in {R2_ENV_PATH}: {', '.join(missing)}")

    env = [
        {"key": "R2_ENDPOINT_URL", "value": r2["R2_ENDPOINT_URL"]},
        {"key": "R2_BUCKET", "value": r2["R2_BUCKET"]},
        {"key": "R2_ACCESS_KEY_ID", "value": r2["R2_ACCESS_KEY_ID"]},
        {"key": "R2_SECRET_ACCESS_KEY", "value": r2["R2_SECRET_ACCESS_KEY"]},
        {"key": "R2_PUBLIC_BASE_URL", "value": r2.get("R2_PUBLIC_BASE_URL", "")},
        {"key": "OUTPUT_PREFIX", "value": os.getenv("OUTPUT_PREFIX", "hy-motion")},
        {"key": "MODEL_VARIANT", "value": os.getenv("MODEL_VARIANT", "lite")},
    ]
    env_gql = "[" + ", ".join(
        "{ key: %s, value: %s }" % (gql_string(e["key"]), gql_string(e["value"])) for e in env
    ) + "]"

    template_mutation = f"""
    mutation {{
      saveTemplate(input: {{
        containerDiskInGb: {CONTAINER_DISK_GB},
        imageName: {gql_string(IMAGE)},
        isServerless: true,
        name: {gql_string(TEMPLATE_NAME)},
        volumeInGb: 0,
        env: {env_gql}
      }}) {{ id name imageName isServerless containerDiskInGb }}
    }}
    """
    template = gql(api_key, template_mutation)["saveTemplate"]
    template_id = template["id"]

    endpoint_mutation = f"""
    mutation {{
      saveEndpoint(input: {{
        gpuIds: {gql_string(GPU_IDS)},
        idleTimeout: {IDLE_TIMEOUT},
        name: {gql_string(ENDPOINT_NAME)},
        flashBootType: FLASHBOOT,
        scalerType: "QUEUE_DELAY",
        scalerValue: 4,
        templateId: {gql_string(template_id)},
        workersMax: {WORKERS_MAX},
        workersMin: {WORKERS_MIN}
      }}) {{ id name gpuIds idleTimeout templateId workersMax workersMin }}
    }}
    """
    endpoint = gql(api_key, endpoint_mutation)["saveEndpoint"]
    print(json.dumps({"template": template, "endpoint": endpoint}, indent=2))


if __name__ == "__main__":
    main()
