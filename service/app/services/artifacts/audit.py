from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.request import urlopen

try:
    from botocore.exceptions import BotoCoreError, ClientError  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    BotoCoreError = ClientError = Exception  # type: ignore[misc,assignment]

_S3_CLIENT: Any | None = None


def _get_s3_client():
    global _S3_CLIENT
    if _S3_CLIENT is not None:
        return _S3_CLIENT
    try:
        import boto3  # type: ignore
    except ImportError:
        return None
    _S3_CLIENT = boto3.client("s3")
    return _S3_CLIENT


def _read_from_s3(uri: str) -> bytes | None:
    parsed = urlparse(uri)
    bucket = parsed.netloc
    key = parsed.path.lstrip("/")
    if not bucket or not key:
        return None
    client = _get_s3_client()
    if client is None:
        return None
    try:
        response = client.get_object(Bucket=bucket, Key=key)
    except (BotoCoreError, ClientError):
        return None
    body = response.get("Body")
    if body is None:
        return None
    return body.read()


def _read_from_http(uri: str) -> bytes | None:
    try:
        with urlopen(uri) as response:  # nosec: trusted signed URLs
            return response.read()
    except Exception:
        return None


def _read_from_path(uri: str) -> bytes | None:
    path = Path(uri)
    if not path.exists():
        return None
    try:
        return path.read_bytes()
    except OSError:
        return None


def _load_audit_bytes(audit_uri: str) -> bytes | None:
    if audit_uri.startswith("s3://"):
        return _read_from_s3(audit_uri)
    if audit_uri.startswith("file://"):
        # Handle file:// URIs by stripping prefix and reading as local path
        return _read_from_path(audit_uri[7:])  # Remove "file://" prefix
    if audit_uri.startswith("http://") or audit_uri.startswith("https://"):
        return _read_from_http(audit_uri)
    return _read_from_path(audit_uri)


@lru_cache(maxsize=256)
def get_audit_topic(audit_uri: str | None) -> str | None:
    if not audit_uri:
        return None
    payload = _load_audit_bytes(audit_uri)
    if not payload:
        return None
    try:
        data = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    topic = data.get("topic")
    if isinstance(topic, str):
        normalized = topic.strip()
        return normalized or None
    return None
