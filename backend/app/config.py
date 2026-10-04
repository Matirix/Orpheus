import os
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent.parent
WORK_DIR = APP_DIR / "work"
WORK_DIR.mkdir(exist_ok=True)

# scripts/host.sh may point this somewhere else (its own certificates), so the
# server always hands out the CA that signed the certificate it is serving.
CERT_DIR = Path(os.environ.get("CERT_DIR") or APP_DIR / "certs")
CA_PEM = CERT_DIR / "ca.pem"

MAX_MINUTES = 15
YOUTUBE_RE = r"^https?://((www|m|music)\.)?(youtube\.com|youtu\.be)/.*$"
