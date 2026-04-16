from app.schemas.common import FlexibleModel


class VisionMealRequest(FlexibleModel):
    imageDataUrl: str | None = None


class DietEvaluationRequest(FlexibleModel):
    pass
