from __future__ import annotations

import logging
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.schemas.common import ApiError


logger = logging.getLogger(__name__)


def _is_sse_request(request: Request) -> bool:
    accept = request.headers.get("accept", "").lower()
    return "text/event-stream" in accept or request.url.path.endswith("/stream")


def install_error_handlers(app: FastAPI) -> None:
    @app.middleware("http")
    async def request_error_boundary(request: Request, call_next):
        request_id = request.headers.get("x-request-id") or uuid4().hex

        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "backend.request_failed request_id=%s method=%s path=%s query=%s client=%s",
                request_id,
                request.method,
                request.url.path,
                request.url.query,
                request.client.host if request.client else "",
            )
            if _is_sse_request(request):
                raise
            error = ApiError(error="Internal server error", details=f"request_id={request_id}")
            return JSONResponse(
                status_code=500,
                content=error.model_dump(mode="json"),
                headers={"X-Request-Id": request_id},
            )

        response.headers.setdefault("X-Request-Id", request_id)
        return response
