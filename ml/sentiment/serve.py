"""FastAPI service exposing the sentiment classifier pipeline bundle (ml/models/pipeline.joblib,
built by ml/build_pipeline.py) over HTTP.

Load behavior: the bundle is loaded once, at module import time (not inside a request
handler), into the module-level `bundle` variable. If loading fails for any reason -- the
file is missing, the pickle is corrupt, or the `pipeline_def` module (needed to unpickle
the custom ReviewStatsTransformer step) can't be imported -- the failure is logged and
`bundle` is set to None. The app still imports and starts cleanly in that case; every route
checks `bundle is None` itself and returns 503, so a bad model file degrades the service
instead of crashing it at boot or 500ing on every request.

Run from within ml/:      uv run uvicorn serve:app --reload
Run from the repo root:   uvicorn ml.serve:app --reload
"""
import logging
import sys
from pathlib import Path

# Make sibling modules (`common`, `pipeline_def`) importable by their bare names regardless
# of whether this file is loaded as a top-level module (`uvicorn serve:app`, cwd=ml/) or as
# a package submodule (`uvicorn ml.serve:app`, cwd=repo root). This also matters for
# unpickling: pipeline.joblib was built with `pipeline_def` importable as a bare top-level
# module (see build_pipeline.py), so joblib.load needs that same name resolvable here too.
sys.path.insert(0, str(Path(__file__).resolve().parent))

import joblib
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from common import MODELS_DIR

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PIPELINE_PATH = MODELS_DIR / "pipeline.joblib"

app = FastAPI(
    title="Review Sentiment Classifier",
    description="Serves the TF-IDF + ReviewStatsTransformer + LogisticRegression sentiment pipeline.",
    version="1.0.0",
)

bundle = None
try:
    bundle = joblib.load(PIPELINE_PATH)
    logger.info("Loaded pipeline bundle from %s", PIPELINE_PATH)
except Exception:
    logger.exception("Failed to load pipeline bundle from %s -- serving in degraded mode (503s).", PIPELINE_PATH)
    bundle = None


class PredictRequest(BaseModel):
    review_text: str = Field(min_length=1, max_length=5000)


class PredictResponse(BaseModel):
    predicted_sentiment: str
    confidence: float


class HealthResponse(BaseModel):
    status: str


class InfoResponse(BaseModel):
    steps: list[str]
    built_at: str
    sklearn_version: str
    decision_threshold: float
    label_names: list[str]


def _require_bundle():
    if bundle is None:
        raise HTTPException(status_code=503, detail="Model bundle is not loaded.")


@app.get("/health", response_model=HealthResponse)
def health():
    """Liveness/uptime check: is the service up with a usable model loaded?"""
    _require_bundle()
    return {"status": "ok"}


@app.get("/info", response_model=InfoResponse)
def info():
    """Bundle metadata: pipeline steps, build time, sklearn version, decision threshold, labels."""
    _require_bundle()
    return {
        **bundle["metadata"],
        "decision_threshold": bundle["decision_threshold"],
        "label_names": bundle["label_names"],
    }


@app.post("/predict", response_model=PredictResponse)
def predict(request: PredictRequest):
    """Runs one review through the pipeline and returns the predicted sentiment label
    (per bundle["label_names"]) and the model's confidence in that label, using
    bundle["decision_threshold"] as the cutoff on P(positive) rather than a hardcoded 0.5.
    """
    _require_bundle()

    pipeline = bundle["pipeline"]
    label_names = bundle["label_names"]
    threshold = bundle["decision_threshold"]

    classes = list(pipeline.classes_)  # sorted bools: [False, True]
    label_by_class = dict(zip(classes, label_names))

    proba = pipeline.predict_proba([request.review_text])[0]
    positive_proba = proba[classes.index(True)]

    predicted_class = True if positive_proba >= threshold else False
    confidence = float(proba[classes.index(predicted_class)])

    return {"predicted_sentiment": label_by_class[predicted_class], "confidence": confidence}
