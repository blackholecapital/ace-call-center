#!/usr/bin/env bash
set -euo pipefail

RUNTIME_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${EILA_VENV_DIR:-$RUNTIME_DIR/.venv}"
PYTHON_BIN="${EILA_PYTHON_BIN:-python3}"
REQUIREMENTS_HASH_FILE="$VENV_DIR/.eila-requirements.sha256"

cd "$RUNTIME_DIR"

if [ ! -x "$VENV_DIR/bin/python" ]; then
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

CURRENT_REQUIREMENTS_HASH="$(sha256sum requirements.txt | awk '{print $1}')"
INSTALLED_REQUIREMENTS_HASH="$(test -f "$REQUIREMENTS_HASH_FILE" && sed -n '1p' "$REQUIREMENTS_HASH_FILE" || true)"

if [ "$CURRENT_REQUIREMENTS_HASH" != "$INSTALLED_REQUIREMENTS_HASH" ]; then
  "$VENV_DIR/bin/python" -m pip install --upgrade pip
  "$VENV_DIR/bin/python" -m pip install -r requirements.txt
  printf '%s\n' "$CURRENT_REQUIREMENTS_HASH" > "$REQUIREMENTS_HASH_FILE"
fi

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${EILA_RUNTIME_TOKEN:?Set EILA_RUNTIME_TOKEN in .env or the environment}"

exec "$VENV_DIR/bin/uvicorn" eila_runtime.server:app \
  --host "${EILA_HOST:-0.0.0.0}" \
  --port "${EILA_PORT:-8000}" \
  --log-level "${EILA_LOG_LEVEL:-info}"
