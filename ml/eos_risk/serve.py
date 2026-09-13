"""FastAPI service exposing the EoS-risk pipeline bundle (ml/eos_risk/models/pipeline.joblib,
built by ml/eos_risk/build_pipeline.py) over HTTP.

Load behavior: the bundle is loaded once, at module import time (not inside a request
handler), into the module-level `bundle` variable. If loading fails for any reason -- the
file is missing, the pickle is corrupt, or the `pipeline_def` module (needed to unpickle
the custom EoSRiskTransformer step) can't be imported -- the failure is logged and
`bundle` is set to None. The app still imports and starts cleanly in that case; every route
checks `bundle is None` itself and returns 503, so a bad model file degrades the service
instead of crashing it at boot or 500ing on every request.

Run from within ml/eos_risk/:  uv run uvicorn serve:app --reload
"""
import logging
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import joblib
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SCRIPT_DIR = Path(__file__).resolve().parent
PIPELINE_PATH = SCRIPT_DIR / "models" / "pipeline.joblib"

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
    avoid double-counting one request that matches multiple registered limits. On this
    Modal deployment that state was found to leak across otherwise-unrelated requests
    (confirmed by direct inspection of slowapi's storage: the hit counter only ever
    reached 1, no matter how many requests were sent, because every request after the
    first silently skipped its own check) -- almost certainly because Modal's asgi_app
    adapter doesn't hand each request a fully independent Starlette scope/state the way a
    standard ASGI server does. This counter needs no per-request state at all, and was
    verified correct end-to-end on the live deployment (a monotonic 1, 2, 3, then 429, 429
    sequence under a 3/minute test limit) before it replaced slowapi.
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

# Risk-score bands for the plain-language interpretation, chosen to roughly span the
# range observed across the 5 live games during exploration (0.03 to 1.99) -- not a
# calibrated probability cutoff, just a readability aid. See the CAVEAT below.
LOW_MAX = 0.15
MODERATE_MAX = 0.35
ELEVATED_MAX = 1.2

CAVEAT = (
    "risk_score's base_rate_risk component is a cumulative-survival proxy (the fraction "
    "of tracked games this age that have already shut down), not a true conditional "
    "hazard rate (the probability of shutting down soon, given having already survived "
    "to this age) -- see ml/eos_risk/results.md."
)

app = FastAPI(
    title="Gacha EoS Risk Score",
    description="Serves the base-rate-prior x sentiment/volume EoS-risk pipeline.",
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
    sentiment_slope: float
    sentiment_volatility: float = Field(ge=0)
    volume_slope: float
    age_weeks: float = Field(gt=0)


class PredictResponse(BaseModel):
    risk_score: float
    base_rate_risk: float
    score_sv: float
    interpretation: str
    caveat: str


class HealthResponse(BaseModel):
    status: str


class InfoResponse(BaseModel):
    steps: list[str]
    built_at: str
    sklearn_version: str
    survival_checkpoints: dict[int, float]


def _require_bundle():
    if bundle is None:
        raise HTTPException(status_code=503, detail="Pipeline bundle is not loaded.")


def _interpretation(risk_score: float) -> str:
    if risk_score < LOW_MAX:
        return "low"
    if risk_score < MODERATE_MAX:
        return "moderate"
    if risk_score < ELEVATED_MAX:
        return "elevated"
    return "high"


@app.get("/health", response_model=HealthResponse)
def health():
    """Liveness/uptime check: is the service up with a usable pipeline loaded?"""
    _require_bundle()
    return {"status": "ok"}


@app.get("/info", response_model=InfoResponse)
def info():
    """Bundle metadata: pipeline steps, build time, sklearn version, and the survival
    checkpoints the base-rate prior was built from.
    """
    _require_bundle()
    return {**bundle["metadata"], "survival_checkpoints": bundle["survival_checkpoints"]}


@app.post("/predict", response_model=PredictResponse)
def predict(request: Request, payload: PredictRequest):
    """Scores one game's current feature snapshot: the fitted pipeline's
    EoSRiskTransformer z-scores sentiment_slope/sentiment_volatility/volume_slope
    against its pooled training statistics, combines that with a base-rate risk prior
    interpolated from age_weeks against the survival checkpoints, and returns the
    combined risk_score plus both intermediate components.

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
    row = [[payload.sentiment_slope, payload.sentiment_volatility, payload.volume_slope, payload.age_weeks]]
    risk_score, base_rate_risk, score_sv = pipeline.transform(row)[0]

    return {
        "risk_score": float(risk_score),
        "base_rate_risk": float(base_rate_risk),
        "score_sv": float(score_sv),
        "interpretation": _interpretation(float(risk_score)),
        "caveat": CAVEAT,
    }
