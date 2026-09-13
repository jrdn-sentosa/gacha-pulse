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
import threading
import time
from pathlib import Path

# Make sibling modules (`common`, `pipeline_def`) importable by their bare names regardless
# of whether this file is loaded as a top-level module (`uvicorn serve:app`, cwd=ml/) or as
# a package submodule (`uvicorn ml.serve:app`, cwd=repo root). This also matters for
# unpickling: pipeline.joblib was built with `pipeline_def` importable as a bare top-level
# module (see build_pipeline.py), so joblib.load needs that same name resolvable here too.
sys.path.insert(0, str(Path(__file__).resolve().parent))

import joblib
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from common import MODELS_DIR

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PIPELINE_PATH = MODELS_DIR / "pipeline.joblib"

# Only the deployed dashboard (plus local dev) may call this API from a browser.
# Postman/curl testing is unaffected by this -- CORS is enforced by browsers via
# preflight requests, not by API clients, so it never blocks a Postman collection run.
ALLOWED_ORIGINS = ["https://gacha-pulse.vercel.app", "http://localhost:3000"]


def _client_ip(request: Request) -> str:
    """Modal puts its own reverse proxy in front of the app, so request.client.host would
    otherwise be the proxy's address for every caller, collapsing all clients into one
    rate-limit bucket. Prefer the standard X-Forwarded-For header (first hop = the real
    client) and fall back to request.client.host for local/direct testing.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class FixedWindowLimiter:
    """Minimal in-memory fixed-window rate limiter: at most `limit` hits per
    `window_seconds` per key.

    Deliberately not slowapi: slowapi's `@limiter.limit()` decorator skips its own check
    on any request where `request.state._rate_limiting_complete` is already true, to
    avoid double-counting one request that matches multiple registered limits. On Modal
    that state was found to leak across otherwise-unrelated requests (confirmed by direct
    inspection of slowapi's storage on the sibling eos_risk deployment: the hit counter
    only ever reached 1, no matter how many requests were sent, because every request
    after the first silently skipped its own check) -- almost certainly because Modal's
    asgi_app adapter doesn't hand each request a fully independent Starlette scope/state
    the way a standard ASGI server does. This counter needs no per-request state at all,
    and was verified correct end-to-end on the live deployment (a monotonic 1, 2, 3, then
    429, 429 sequence under a low test limit) before it replaced slowapi.
    """

    def __init__(self, limit: int, window_seconds: int = 60):
        self.limit = limit
        self.window_seconds = window_seconds
        self._counts: dict[tuple[str, int], int] = {}
        self._lock = threading.Lock()

    def hit(self, key: str) -> bool:
        """Records one hit for `key`; returns True if still within the limit."""
        bucket = int(time.time() // self.window_seconds)
        bucket_key = (key, bucket)
        with self._lock:
            for existing in [k for k in self._counts if k[0] == key and k[1] != bucket]:
                del self._counts[existing]  # drop this key's stale buckets
            self._counts[bucket_key] = self._counts.get(bucket_key, 0) + 1
            return self._counts[bucket_key] <= self.limit


predict_limiter = FixedWindowLimiter(limit=20, window_seconds=60)

app = FastAPI(
    title="Review Sentiment Classifier",
    description="Serves the TF-IDF + ReviewStatsTransformer + LogisticRegression sentiment pipeline.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
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
def predict(request: Request, payload: PredictRequest):
    """Runs one review through the pipeline and returns the predicted sentiment label
    (per bundle["label_names"]) and the model's confidence in that label, using
    bundle["decision_threshold"] as the cutoff on P(positive) rather than a hardcoded 0.5.

    Rate-limited to 20 requests/minute/IP (see FixedWindowLimiter above) -- basic abuse
    protection, not a precise quota; exceeding it returns 429.
    """
    if not predict_limiter.hit(_client_ip(request)):
        raise HTTPException(
            status_code=429,
            detail="Too many requests: /predict is limited to 20 requests per minute per IP. Please slow down and try again shortly.",
        )

    _require_bundle()

    pipeline = bundle["pipeline"]
    label_names = bundle["label_names"]
    threshold = bundle["decision_threshold"]

    classes = list(pipeline.classes_)  # sorted bools: [False, True]
    label_by_class = dict(zip(classes, label_names))

    proba = pipeline.predict_proba([payload.review_text])[0]
    positive_proba = proba[classes.index(True)]

    predicted_class = True if positive_proba >= threshold else False
    confidence = float(proba[classes.index(predicted_class)])

    return {"predicted_sentiment": label_by_class[predicted_class], "confidence": confidence}
