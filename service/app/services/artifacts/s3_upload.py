"""S3 upload utility for debate artifacts.

Supports both S3 storage (for production/cloud deployments) and local file storage
(for Community Edition self-hosted deployments).

When S3 is not configured, files are saved to LOCAL_ARTIFACTS_PATH (/data/artifacts by default).
"""
from __future__ import annotations

import asyncio
import logging
import os
import shutil
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

try:
    import boto3
    from botocore.exceptions import BotoCoreError, ClientError
    BOTO3_AVAILABLE = True
except ImportError:
    BotoCoreError = ClientError = Exception
    BOTO3_AVAILABLE = False

# Local artifacts path for Community Edition (no S3)
LOCAL_ARTIFACTS_PATH = Path(os.getenv("ARTIFACTS_PATH", "/data/artifacts"))


def _is_s3_configured() -> bool:
    """Check if S3 is configured."""
    return bool(os.getenv("S3_ARTIFACTS_BUCKET") or os.getenv("AWS_S3_BUCKET"))


def _save_to_local(source_path: Path, filename: str, content_type: str = "application/json") -> str:
    """
    Save file to local artifacts directory.
    
    Args:
        source_path: Path to the source file
        filename: Filename for the saved file
        content_type: MIME type (for logging purposes)
    
    Returns:
        Local file URI in format: file:///data/artifacts/filename
    """
    # Ensure artifacts directory exists
    LOCAL_ARTIFACTS_PATH.mkdir(parents=True, exist_ok=True)
    
    dest_path = LOCAL_ARTIFACTS_PATH / filename
    shutil.copy2(source_path, dest_path)
    
    logger.info(f"[artifacts] Saved {content_type} to local storage: {dest_path}")
    return f"file://{dest_path}"


def _read_from_local(file_uri: str) -> bytes:
    """
    Read file from local artifacts directory.
    
    Args:
        file_uri: Local file URI in format file:///path/to/file
    
    Returns:
        File contents as bytes
    """
    # Parse file:// URI
    if file_uri.startswith("file://"):
        file_path = Path(file_uri[7:])  # Remove "file://" prefix
    else:
        file_path = Path(file_uri)
    
    if not file_path.exists():
        raise FileNotFoundError(f"Local file not found: {file_path}")
    
    return file_path.read_bytes()


def _delete_from_local(file_uri: str) -> bool:
    """
    Delete file from local artifacts directory.
    
    Args:
        file_uri: Local file URI in format file:///path/to/file
    
    Returns:
        True if deletion succeeded
    """
    # Parse file:// URI
    if file_uri.startswith("file://"):
        file_path = Path(file_uri[7:])  # Remove "file://" prefix
    else:
        file_path = Path(file_uri)
    
    if file_path.exists():
        file_path.unlink()
        logger.info(f"[artifacts] Deleted local file: {file_path}")
        return True
    return False


def upload_json_to_s3(json_path: Path, session_id: str) -> str:
    """
    Upload JSON file to S3 or local storage and return URI.
    
    For Community Edition (no S3 configured), saves to local artifacts directory.
    
    Args:
        json_path: Path to the JSON file to upload
        session_id: Session ID for constructing filename
    
    Returns:
        URI in format: s3://bucket-name/path/to/file.json or file:///path/to/file.json
    
    Raises:
        Exception: If upload fails
    """
    if not json_path.exists():
        raise FileNotFoundError(f"JSON file not found: {json_path}")
    
    # Check if S3 is configured
    bucket_name = os.getenv("S3_ARTIFACTS_BUCKET") or os.getenv("AWS_S3_BUCKET")
    
    # If S3 not configured, save locally (Community Edition)
    if not bucket_name:
        filename = f"{session_id}_debate_output.json"
        return _save_to_local(json_path, filename, "application/json")
    
    # S3 upload path
    if not BOTO3_AVAILABLE:
        raise ImportError("boto3 is not installed. Install with: pip install boto3")
    
    # Construct S3 key
    s3_key = f"debate-outputs/{session_id}_debate_output.json"
    
    # Initialize S3 client
    s3_client = boto3.client(
        "s3",
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        region_name=os.getenv("AWS_REGION", "us-east-1"),
    )
    
    try:
        # Upload file
        s3_client.upload_file(
            str(json_path),
            bucket_name,
            s3_key,
            ExtraArgs={"ContentType": "application/json"},
        )
        
        # Return S3 URI
        s3_uri = f"s3://{bucket_name}/{s3_key}"
        return s3_uri
    
    except (BotoCoreError, ClientError) as e:
        raise Exception(f"Failed to upload JSON to S3: {e}") from e


async def upload_json_to_s3_async(json_path: Path, session_id: str) -> str:
    """
    Async wrapper for upload_json_to_s3.
    
    Upload JSON file to S3 and return S3 URI (runs in thread pool to avoid blocking).
    
    Args:
        json_path: Path to the JSON file to upload
        session_id: Session ID for constructing S3 key
    
    Returns:
        S3 URI in format: s3://bucket-name/path/to/file.json
    
    Raises:
        Exception: If S3 upload fails or boto3 is not available
    """
    return await asyncio.to_thread(upload_json_to_s3, json_path, session_id)


def read_json_from_s3(uri: str) -> bytes:
    """
    Read JSON file from S3 or local storage.
    
    Supports both S3 URIs (s3://) and local file URIs (file://).
    
    Args:
        uri: URI in format s3://bucket-name/path/to/file.json or file:///path/to/file.json
    
    Returns:
        File contents as bytes
    
    Raises:
        ImportError: If boto3 is not installed (for S3 URIs)
        ValueError: If URI format is invalid
        FileNotFoundError: If object/file does not exist
        Exception: If read fails with detailed error message
    """
    # Handle local file URIs (Community Edition)
    if uri.startswith("file://"):
        return _read_from_local(uri)
    
    # Handle S3 URIs
    if not uri.startswith("s3://"):
        raise ValueError(f"Invalid URI format: {uri}. Expected s3:// or file:// URI")
    
    if not BOTO3_AVAILABLE:
        raise ImportError("boto3 is not installed. Install with: pip install boto3")
    
    parsed = urlparse(uri)
    bucket = parsed.netloc
    key = parsed.path.lstrip("/")
    
    if not bucket or not key:
        raise ValueError(f"Invalid S3 URI format: {uri}. Expected s3://bucket-name/path/to/file.json")
    
    try:
        s3_client = boto3.client(
            "s3",
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
            region_name=os.getenv("AWS_REGION", "us-east-1"),
        )
        
        # First check if object exists
        try:
            s3_client.head_object(Bucket=bucket, Key=key)
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            if error_code == "404" or error_code == "NoSuchKey":
                raise FileNotFoundError(f"S3 object not found: s3://{bucket}/{key}") from e
            raise Exception(f"Failed to check S3 object existence: {e}") from e
        
        # Read the object
        response = s3_client.get_object(Bucket=bucket, Key=key)
        body = response.get("Body")
        if body is None:
            raise Exception(f"S3 object has no body: s3://{bucket}/{key}")
        return body.read()
    except (BotoCoreError, ClientError) as e:
        error_code = e.response.get("Error", {}).get("Code", "Unknown") if hasattr(e, "response") else "Unknown"
        error_message = e.response.get("Error", {}).get("Message", str(e)) if hasattr(e, "response") else str(e)
        raise Exception(f"Failed to read from S3 (Error: {error_code}): {error_message}") from e


def delete_json_from_s3(uri: str) -> bool:
    """
    Delete JSON file from S3 or local storage.
    
    Supports both S3 URIs (s3://) and local file URIs (file://).
    
    Args:
        uri: URI in format s3://bucket-name/path/to/file.json or file:///path/to/file.json
    
    Returns:
        True if deletion succeeded, False otherwise
    
    Raises:
        Exception: If deletion fails with detailed error message
    """
    # Handle local file URIs (Community Edition)
    if uri.startswith("file://"):
        return _delete_from_local(uri)
    
    # Handle S3 URIs
    if not uri.startswith("s3://"):
        raise ValueError(f"Invalid URI format: {uri}. Expected s3:// or file:// URI")
    
    if not BOTO3_AVAILABLE:
        raise ImportError("boto3 is not installed. Install with: pip install boto3")
    
    parsed = urlparse(uri)
    bucket = parsed.netloc
    key = parsed.path.lstrip("/")
    
    if not bucket or not key:
        raise ValueError(f"Invalid S3 URI format: {uri}. Expected s3://bucket-name/path/to/file.json")
    
    try:
        s3_client = boto3.client(
            "s3",
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
            region_name=os.getenv("AWS_REGION", "us-east-1"),
        )
        
        # Delete the object
        s3_client.delete_object(Bucket=bucket, Key=key)
        return True
    except (BotoCoreError, ClientError) as e:
        error_code = e.response.get("Error", {}).get("Code", "Unknown") if hasattr(e, "response") else "Unknown"
        error_message = e.response.get("Error", {}).get("Message", str(e)) if hasattr(e, "response") else str(e)
        raise Exception(f"Failed to delete from S3 (Error: {error_code}): {error_message}") from e


async def delete_json_from_s3_async(s3_uri: str) -> bool:
    """
    Async wrapper for delete_json_from_s3.
    
    Delete JSON file from S3 (runs in thread pool to avoid blocking).
    
    Args:
        s3_uri: S3 URI in format s3://bucket-name/path/to/file.json
    
    Returns:
        True if deletion succeeded, False otherwise
    
    Raises:
        Exception: If S3 deletion fails
    """
    return await asyncio.to_thread(delete_json_from_s3, s3_uri)


def upload_pdf_to_s3(pdf_path: Path, session_id: str) -> str:
    """
    Upload PDF file to S3 or local storage and return URI.
    
    For Community Edition (no S3 configured), saves to local artifacts directory.
    
    Args:
        pdf_path: Path to the PDF file to upload
        session_id: Session ID for constructing filename
    
    Returns:
        URI in format: s3://bucket-name/path/to/file.pdf or file:///path/to/file.pdf
    
    Raises:
        Exception: If upload fails
    """
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF file not found: {pdf_path}")
    
    # Check if S3 is configured
    bucket_name = os.getenv("S3_ARTIFACTS_BUCKET") or os.getenv("AWS_S3_BUCKET")
    
    # If S3 not configured, save locally (Community Edition)
    if not bucket_name:
        filename = f"{session_id}_executive_brief.pdf"
        return _save_to_local(pdf_path, filename, "application/pdf")
    
    # S3 upload path
    if not BOTO3_AVAILABLE:
        raise ImportError("boto3 is not installed. Install with: pip install boto3")
    
    # Construct S3 key
    s3_key = f"debate-outputs/{session_id}_executive_brief.pdf"
    
    # Initialize S3 client
    s3_client = boto3.client(
        "s3",
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        region_name=os.getenv("AWS_REGION", "us-east-1"),
    )
    
    try:
        # Upload file
        s3_client.upload_file(
            str(pdf_path),
            bucket_name,
            s3_key,
            ExtraArgs={"ContentType": "application/pdf"},
        )
        
        # Return S3 URI
        s3_uri = f"s3://{bucket_name}/{s3_key}"
        return s3_uri
    
    except (BotoCoreError, ClientError) as e:
        raise Exception(f"Failed to upload PDF to S3: {e}") from e


async def upload_pdf_to_s3_async(pdf_path: Path, session_id: str) -> str:
    """
    Async wrapper for upload_pdf_to_s3.
    
    Upload PDF file to S3 and return S3 URI (runs in thread pool to avoid blocking).
    
    Args:
        pdf_path: Path to the PDF file to upload
        session_id: Session ID for constructing S3 key
    
    Returns:
        S3 URI in format: s3://bucket-name/path/to/file.pdf
    
    Raises:
        Exception: If S3 upload fails or boto3 is not available
    """
    return await asyncio.to_thread(upload_pdf_to_s3, pdf_path, session_id)


def read_pdf_from_s3(uri: str) -> bytes:
    """
    Read PDF file from S3 or local storage.
    
    Supports both S3 URIs (s3://) and local file URIs (file://).
    
    Args:
        uri: URI in format s3://bucket-name/path/to/file.pdf or file:///path/to/file.pdf
    
    Returns:
        File contents as bytes
    
    Raises:
        ImportError: If boto3 is not installed (for S3 URIs)
        ValueError: If URI format is invalid
        FileNotFoundError: If object/file does not exist
        Exception: If read fails with detailed error message
    """
    # Handle local file URIs (Community Edition)
    if uri.startswith("file://"):
        return _read_from_local(uri)
    
    # Handle S3 URIs
    if not uri.startswith("s3://"):
        raise ValueError(f"Invalid URI format: {uri}. Expected s3:// or file:// URI")
    
    if not BOTO3_AVAILABLE:
        raise ImportError("boto3 is not installed. Install with: pip install boto3")
    
    parsed = urlparse(uri)
    bucket = parsed.netloc
    key = parsed.path.lstrip("/")
    
    if not bucket or not key:
        raise ValueError(f"Invalid S3 URI format: {uri}. Expected s3://bucket-name/path/to/file.pdf")
    
    try:
        s3_client = boto3.client(
            "s3",
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
            region_name=os.getenv("AWS_REGION", "us-east-1"),
        )
        
        # First check if object exists
        try:
            s3_client.head_object(Bucket=bucket, Key=key)
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            if error_code == "404" or error_code == "NoSuchKey":
                raise FileNotFoundError(f"S3 object not found: s3://{bucket}/{key}") from e
            raise Exception(f"Failed to check S3 object existence: {e}") from e
        
        # Read the object
        response = s3_client.get_object(Bucket=bucket, Key=key)
        body = response.get("Body")
        if body is None:
            raise Exception(f"S3 object has no body: s3://{bucket}/{key}")
        return body.read()
    except (BotoCoreError, ClientError) as e:
        error_code = e.response.get("Error", {}).get("Code", "Unknown") if hasattr(e, "response") else "Unknown"
        error_message = e.response.get("Error", {}).get("Message", str(e)) if hasattr(e, "response") else str(e)
        raise Exception(f"Failed to read from S3 (Error: {error_code}): {error_message}") from e

