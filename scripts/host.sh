#!/usr/bin/env bash
set -euo pipefail

# Serve the built app over HTTPS on the local network. Safari (iPad/iPhone)
# only exposes navigator.mediaDevices in a secure context, so plain HTTP on
# 8000 can load the page but can never be granted the microphone.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="${CERT_DIR:-$ROOT/certs}"
PORT="${PORT:-8443}"
SKIP_BUILD="${SKIP_BUILD:-0}"

LAN="${LAN:-$(ip route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p' | head -n 1 || true)}"
if [ -z "${LAN:-}" ]; then
  LAN="$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -n 1 || true)"
fi
if [ -z "${LAN:-}" ]; then
  echo "host.sh: no LAN address detected; rerun as LAN=192.168.1.78 bash scripts/host.sh" >&2
  exit 1
fi

NAME="$(uname -n 2>/dev/null || echo localhost)"
SANS="IP:${LAN},IP:127.0.0.1,DNS:localhost,DNS:${NAME},DNS:${NAME}.local"

mkdir -p "$CERT_DIR"

# The CA is created once and kept: it is what the iPad trusts, and reusing it
# is what makes the iPad install a one-time step.
if [ ! -s "$CERT_DIR/ca.pem" ] || [ ! -s "$CERT_DIR/ca-key.pem" ]; then
  echo "Creating the local CA in $CERT_DIR (kept for future runs)."
  openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
    -keyout "$CERT_DIR/ca-key.pem" -out "$CERT_DIR/ca.pem" \
    -subj "/CN=Orpheus local CA" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
  chmod 600 "$CERT_DIR/ca-key.pem"
fi

cat > "$CERT_DIR/host.ext" <<EOF
[server]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = ${SANS}
EOF

if ! out="$(openssl req -new -newkey rsa:2048 -nodes \
  -keyout "$CERT_DIR/host.key" -out "$CERT_DIR/host.csr" \
  -subj "/CN=${LAN}" 2>&1)"; then
  echo "$out" >&2
  exit 1
fi
# Reissued on every run so a changed address needs no reinstall on the device.
if ! out="$(openssl x509 -req -in "$CERT_DIR/host.csr" \
  -CA "$CERT_DIR/ca.pem" -CAkey "$CERT_DIR/ca-key.pem" -CAcreateserial \
  -days 825 -sha256 -extfile "$CERT_DIR/host.ext" -extensions server \
  -out "$CERT_DIR/host.pem" 2>&1)"; then
  echo "$out" >&2
  exit 1
fi
rm -f "$CERT_DIR/host.csr"
chmod 600 "$CERT_DIR/host.key"
openssl verify -CAfile "$CERT_DIR/ca.pem" "$CERT_DIR/host.pem" >/dev/null

if [ "$SKIP_BUILD" != "1" ]; then
  echo "Building the frontend."
  (cd "$ROOT/frontend" && npm run build)
fi

# Run from the project venv rather than `uv run`, so an existing environment
# (including the ml extra) is never resynced out from under a running session.
if ! "$ROOT/.venv/bin/python" -c "import uvicorn" >/dev/null 2>&1; then
  echo "Setting up the Python environment."
  (cd "$ROOT" && uv sync)
fi

export CERT_DIR
URL="https://${LAN}:${PORT}"
CA_URL="${URL}/ca.pem"
echo "URL=${URL}"

qr() {
  uv run --no-sync --with qrcode python -c '
import qrcode, sys
q = qrcode.QRCode(border=1)
q.add_data(sys.argv[1])
q.make(fit=True)
for row in q.get_matrix():
    print("".join("\u2588\u2588" if c else "  " for c in row))
' "$1"
}

cat <<EOF

  One-time on the iPad — install the certificate first:
    ${CA_URL}

  1. Open that link (first QR below). Safari warns that the certificate is not
     yet trusted — that is expected before the CA is installed: Show Details >
     visit this website anyway, then allow the download.
  2. Settings > Profile Downloaded > Install (passcode if it asks).
  3. Settings > General > About > Certificate Trust Settings > switch on
     "Orpheus local CA". Installing and trusting are two separate taps: both
     are required, and this is the only step that happens once.

  Then open the app (second QR below) and allow the microphone:
    ${URL}

  Every run issues a fresh leaf certificate against that same CA, so a new
  address never needs another install — only the CA above is trusted once.
EOF

echo "  certificate: ${CA_URL}"
if qr_out="$(qr "$CA_URL" 2>&1)"; then
  echo "$qr_out"
else
  echo "  (QR could not be drawn — open ${CA_URL} by hand.)"
fi

echo "  app: ${URL}"
if qr_out="$(qr "$URL" 2>&1)"; then
  echo "$qr_out"
else
  echo "  (QR could not be drawn — open ${URL} by hand.)"
fi

cd "$ROOT"
exec "$ROOT/.venv/bin/python" -m uvicorn backend.app.main:app \
  --host 0.0.0.0 --port "$PORT" \
  --ssl-certfile "$CERT_DIR/host.pem" --ssl-keyfile "$CERT_DIR/host.key"
