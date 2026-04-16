from fastapi.middleware.cors import CORSMiddleware

from app.core.config import Settings


def build_cors_kwargs(settings: Settings) -> dict[str, object]:
    return {
        "allow_origins": settings.cors_origins,
        "allow_credentials": True,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
        "expose_headers": ["Content-Type", "Cache-Control"],
    }


def install_cors(app, settings: Settings) -> None:
    app.add_middleware(CORSMiddleware, **build_cors_kwargs(settings))
