#!/usr/bin/env python3
"""Submit a deterministic single-image mesh job to Hunyuan3D's Gradio API."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import mimetypes
import shutil
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--image", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--caption", default=None)
    parser.add_argument("--steps", type=int, default=30)
    parser.add_argument("--guidance", type=float, default=5.0)
    parser.add_argument("--seed", type=int, default=1847)
    parser.add_argument("--octree-resolution", type=int, default=256)
    parser.add_argument("--num-chunks", type=int, default=8000)
    parser.add_argument("--keep-background", action="store_true")
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def request_json(url: str, payload: dict[str, Any] | None = None) -> Any:
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def source_file_data(path: Path) -> dict[str, Any]:
    mime_type = mimetypes.guess_type(path.name)[0] or "image/png"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return {
        "path": None,
        "url": f"data:{mime_type};base64,{encoded}",
        "size": path.stat().st_size,
        "orig_name": path.name,
        "mime_type": mime_type,
        "is_stream": False,
        "meta": {"_type": "gradio.FileData"},
    }


def await_sse(url: str) -> list[Any]:
    request = urllib.request.Request(url, headers={"Accept": "text/event-stream"})
    event_name = ""
    with urllib.request.urlopen(request, timeout=None) as response:
        for raw_line in response:
            line = raw_line.decode("utf-8").rstrip("\r\n")
            if line.startswith("event:"):
                event_name = line.split(":", 1)[1].strip()
                continue
            if not line.startswith("data:"):
                continue
            payload = line.split(":", 1)[1].strip()
            if event_name == "error":
                raise RuntimeError(f"Hunyuan generation failed: {payload}")
            if event_name == "complete":
                result = json.loads(payload)
                if not isinstance(result, list):
                    raise RuntimeError("Gradio completion payload was not a list")
                return result
    raise RuntimeError("Gradio event stream closed without a completion event")


def safe_name(value: str, index: int) -> str:
    candidate = Path(value).name.strip()
    if not candidate or candidate in {".", ".."}:
        candidate = f"artifact_{index:02d}.bin"
    return f"{index:02d}_{candidate}"


def materialize_file(base_url: str, value: Any, output: Path, index: int) -> Path:
    if isinstance(value, str):
        server_path = Path(value)
        name = safe_name(value, index)
        destination = output / name
        if destination.exists():
            raise FileExistsError(destination)
        if server_path.is_file():
            shutil.copy2(server_path, destination)
            return destination
        if value.startswith(("http://", "https://", "/")):
            resolved = urllib.parse.urljoin(base_url.rstrip("/") + "/", value)
            with urllib.request.urlopen(resolved, timeout=300) as response, destination.open("wb") as stream:
                shutil.copyfileobj(response, stream)
            return destination
        raise RuntimeError(f"returned file {index} is not retrievable: {value!r}")
    if not isinstance(value, dict):
        raise RuntimeError(f"returned file {index} has unsupported type {type(value).__name__}")
    name = safe_name(str(value.get("orig_name") or value.get("path") or "artifact.bin"), index)
    destination = output / name
    if destination.exists():
        raise FileExistsError(destination)
    file_url = value.get("url")
    if isinstance(file_url, str) and file_url:
        resolved = urllib.parse.urljoin(base_url.rstrip("/") + "/", file_url)
        with urllib.request.urlopen(resolved, timeout=300) as response, destination.open("wb") as stream:
            shutil.copyfileobj(response, stream)
        return destination
    server_path = value.get("path")
    if isinstance(server_path, str) and Path(server_path).is_file():
        shutil.copy2(server_path, destination)
        return destination
    raise RuntimeError(f"returned file {index} has no retrievable URL or path")


def main() -> int:
    args = parse_args()
    source = args.image.expanduser().resolve()
    output = args.output_dir.expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    if output.exists() and any(output.iterdir()):
        raise RuntimeError(f"output directory must be empty: {output}")
    output.mkdir(parents=True, exist_ok=True)

    base_url = args.base_url.rstrip("/")
    payload = {
        "data": [
            args.caption,
            source_file_data(source),
            None,
            None,
            None,
            None,
            args.steps,
            args.guidance,
            args.seed,
            args.octree_resolution,
            not args.keep_background,
            args.num_chunks,
            False,
        ]
    }
    submission = request_json(f"{base_url}/gradio_api/call/generation_all", payload)
    event_id = str(submission.get("event_id", "")) if isinstance(submission, dict) else ""
    if not event_id:
        raise RuntimeError(f"Gradio did not return an event id: {submission!r}")
    result = await_sse(
        f"{base_url}/gradio_api/call/generation_all/{urllib.parse.quote(event_id, safe='')}"
    )

    artifacts: list[dict[str, Any]] = []
    for index, value in enumerate(result[:2]):
        if value is None:
            continue
        path = materialize_file(base_url, value, output, index)
        artifacts.append(
            {
                "result_index": index,
                "filename": path.name,
                "bytes": path.stat().st_size,
                "sha256": sha256_file(path),
            }
        )
    receipt = {
        "endpoint": "generation_all",
        "source_image": source.name,
        "source_sha256": sha256_file(source),
        "settings": {
            "caption": args.caption,
            "steps": args.steps,
            "guidance": args.guidance,
            "seed_requested": args.seed,
            "octree_resolution": args.octree_resolution,
            "remove_background": not args.keep_background,
            "num_chunks": args.num_chunks,
            "randomize_seed": False,
        },
        "returned_seed": result[4] if len(result) > 4 else None,
        "mesh_stats": result[3] if len(result) > 3 else None,
        "artifacts": artifacts,
    }
    receipt_path = output / "generation_receipt.json"
    receipt_path.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"receipt": str(receipt_path), "artifacts": artifacts}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # concise CLI failure surface; full type is preserved
        print(f"HUNYUAN_IMAGE_MESH_ERROR: {type(exc).__name__}: {exc}", file=sys.stderr)
        raise
