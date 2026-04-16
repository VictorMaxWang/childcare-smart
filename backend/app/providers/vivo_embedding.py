from app.core.config import Settings


class VivoEmbeddingProvider:
    def __init__(self, settings: Settings):
        self.settings = settings

    def embed(self, texts: list[str]) -> dict:
        return {
            "provider": "vivo-embedding-stub",
            "mode": "mock",
            "vectors": [[0.0] * 8 for _ in texts],
        }
