#!/bin/sh
set -eu

DATA_DIR="${IRM_DATA_DIR:-/data}"
OVERLAY_DIR="${DATA_DIR}/bin"
OVERLAY_SERVER="${OVERLAY_DIR}/server"
OVERLAY_DIST="${OVERLAY_DIR}/dist"
MARKER_FILE="${OVERLAY_DIR}/base_image_version"

if [ -f "$MARKER_FILE" ] && [ -n "${IRM_IMAGE_VERSION:-}" ]; then
  STAMPED_VERSION=$(tr -d '\r\n ' < "$MARKER_FILE" 2>/dev/null || true)
  if [ "$STAMPED_VERSION" != "$IRM_IMAGE_VERSION" ]; then
    echo "[IRM] Detected newly deployed container image (${IRM_IMAGE_VERSION}, was ${STAMPED_VERSION}); clearing previous overlay binary."
    rm -rf "$OVERLAY_DIR"
  fi
fi

if [ -x "$OVERLAY_SERVER" ]; then
  if "$OVERLAY_SERVER" -version >/dev/null 2>&1; then
    if [ -d "$OVERLAY_DIST" ]; then
      export IRM_AGENT_BIN_DIR="$OVERLAY_DIST"
    fi
    exec "$OVERLAY_SERVER" "$@"
  else
    echo "[IRM] Warning: overlay binary failed health pre-flight; falling back to image binary /app/server" >&2
    rm -f "$OVERLAY_SERVER"
  fi
fi

exec /app/server "$@"
