from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, Request, status

from app.core.config import get_settings


SERVICE_SCOPE_HEADER = "x-smartchildcare-service-scope"
SERVICE_TIMESTAMP_HEADER = "x-smartchildcare-service-timestamp"
SERVICE_SIGNATURE_HEADER = "x-smartchildcare-service-signature"
SERVICE_PATH_HEADER = "x-smartchildcare-service-path"
MAX_CLOCK_SKEW_SECONDS = 300


@dataclass(frozen=True)
class ServiceScope:
    institution_id: str | None = None
    role: str | None = None
    account_kind: str | None = None
    child_ids: tuple[str, ...] = ()
    class_name: str | None = None
    unsigned_dev: bool = False


def _is_development_environment(value: str) -> bool:
    return value.strip().lower() in {"development", "dev", "local", "test", "testing"}


def _secret_value() -> str | None:
    secret = get_settings().brain_internal_shared_secret
    if secret is None:
        return None
    value = secret.get_secret_value().strip()
    return value or None


def _request_target_path(request: Request) -> str:
    query = request.url.query
    return f"{request.url.path}?{query}" if query else request.url.path


def _decode_scope(value: str) -> dict[str, Any]:
    try:
        padded = value + ("=" * (-len(value) % 4))
        decoded = base64.urlsafe_b64decode(padded.encode("utf-8"))
        payload = json.loads(decoded.decode("utf-8"))
    except Exception as error:  # noqa: BLE001 - convert malformed auth to a uniform 401.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid service scope") from error
    return payload if isinstance(payload, dict) else {}


def _scope_from_payload(payload: dict[str, Any]) -> ServiceScope:
    child_ids = payload.get("childIds") or payload.get("child_ids") or []
    normalized_child_ids = tuple(
        item.strip()
        for item in child_ids
        if isinstance(item, str) and item.strip()
    ) if isinstance(child_ids, list) else ()
    return ServiceScope(
        institution_id=str(payload.get("institutionId") or payload.get("institution_id") or "").strip() or None,
        role=str(payload.get("role") or "").strip() or None,
        account_kind=str(payload.get("accountKind") or payload.get("account_kind") or "").strip() or None,
        child_ids=normalized_child_ids,
        # TODO(T8B-classId): className remains the scoped teacher boundary until stable classId is migrated.
        class_name=str(payload.get("className") or payload.get("class_name") or "").strip() or None,
    )


def _signature_payload(method: str, target_path: str, timestamp: str, scope_token: str) -> bytes:
    return "\n".join([method.upper(), target_path, timestamp, scope_token]).encode("utf-8")


async def require_internal_service(request: Request) -> ServiceScope:
    settings = get_settings()
    secret = _secret_value()
    if not secret:
        if _is_development_environment(settings.environment):
            return ServiceScope(unsigned_dev=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="internal service auth is not configured",
        )

    scope_token = request.headers.get(SERVICE_SCOPE_HEADER)
    timestamp = request.headers.get(SERVICE_TIMESTAMP_HEADER)
    signature = request.headers.get(SERVICE_SIGNATURE_HEADER)
    signed_path = request.headers.get(SERVICE_PATH_HEADER)
    if not scope_token or not timestamp or not signature or not signed_path:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing service signature")

    actual_path = _request_target_path(request)
    if signed_path != actual_path:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="service signature path mismatch")

    try:
        request_timestamp = int(timestamp)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid service timestamp") from error
    if abs(int(time.time()) - request_timestamp) > MAX_CLOCK_SKEW_SECONDS:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="stale service signature")

    expected = hmac.new(
        secret.encode("utf-8"),
        _signature_payload(request.method, signed_path, timestamp, scope_token),
        hashlib.sha256,
    ).digest()
    try:
        provided = base64.urlsafe_b64decode((signature + "=" * (-len(signature) % 4)).encode("utf-8"))
    except Exception as error:  # noqa: BLE001 - malformed auth should stay a 401.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid service signature") from error
    if not hmac.compare_digest(expected, provided):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid service signature")

    return _scope_from_payload(_decode_scope(scope_token))


def require_child_in_service_scope(scope: ServiceScope, child_id: str) -> None:
    if scope.unsigned_dev:
        return
    if child_id in scope.child_ids:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="child is outside service scope")
