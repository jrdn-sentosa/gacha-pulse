"""Modal deployment of the EoS-risk FastAPI service (ml/eos_risk/serve.py).

Builds a container image containing exactly what serve.py needs to import and run:
serve.py itself, pipeline_def.py (the module joblib needs importable by name to unpickle
the custom EoSRiskTransformer step), and the fitted bundle itself
(models/pipeline.joblib). Everything else in ml/eos_risk/ (exploration scripts, the
exploration_output CSV, other models/ artifacts) is deliberately left out of the image.

scikit-learn is pinned to exactly 1.9.1, matching the bundle's confirmed
metadata["sklearn_version"] (see ml/eos_risk/build_pipeline.py's output and
ml/eos_risk/pyproject.toml) -- any other installed version would either reintroduce
InconsistentVersionWarning or, worse, an incompatible unpickle.

serve.py's FastAPI `app` is imported lazily inside the @modal.asgi_app()-decorated
function, not at this module's top level -- this file is parsed locally by the `modal`
CLI/client when you run `modal deploy`, and importing serve.py there would run its
module-level joblib.load(...) against a local environment that doesn't have the image's
pinned dependencies or file layout. Deferring the import into the function body means it
only happens inside the container, once per container start (Python caches the module
after the first import), which preserves serve.py's existing load-once-at-import
behavior without changing any of its code.

Deploy:  modal deploy ml/eos_risk/modal_serve.py
"""
from pathlib import Path

import modal

SCRIPT_DIR = Path(__file__).resolve().parent
CONTAINER_APP_DIR = "/app"

image = (
    modal.Image.debian_slim(python_version="3.13")
    .pip_install(
        "scikit-learn==1.9.1",  # must match bundle metadata["sklearn_version"] exactly
        "joblib==1.6.0",
        "numpy",
        "fastapi==0.141.1",
        "pydantic==2.13.5",
    )
    .add_local_file(SCRIPT_DIR / "serve.py", f"{CONTAINER_APP_DIR}/serve.py", copy=True)
    .add_local_file(SCRIPT_DIR / "pipeline_def.py", f"{CONTAINER_APP_DIR}/pipeline_def.py", copy=True)
    .add_local_file(
        SCRIPT_DIR / "models" / "pipeline.joblib",
        f"{CONTAINER_APP_DIR}/models/pipeline.joblib",
        copy=True,
    )
)

app = modal.App("gacha-eos-risk")


# max_containers=1: slowapi's rate limiter keeps its counters in-process. Without this,
# Modal can scale this function out to multiple containers under load, each with its own
# independent counter, silently defeating the "20/minute per IP" limit (confirmed
# empirically: 31 rapid requests all returned 200 before this was added). One container
# is a deliberate, honest tradeoff for "basic" abuse protection on a low-traffic internal
# API -- a correct limit across replicas would need a shared store (e.g. Redis), which is
# out of scope here.
@app.function(image=image, max_containers=1)
@modal.asgi_app()
def fastapi_app():
    import sys

    sys.path.insert(0, CONTAINER_APP_DIR)
    from serve import app as web_app  # triggers serve.py's module-level bundle load

    return web_app
