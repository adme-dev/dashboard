#!/bin/sh
# Rebuild local Graphify artifacts for architecture review and R2 upload.

set -e

PYTHON=${GRAPHIFY_PYTHON:-/Users/paulgiurin/.local/pipx/venvs/graphifyy/bin/python}

if [ ! -x "$PYTHON" ]; then
  echo "[graphify] Missing executable Graphify Python: $PYTHON" >&2
  echo "[graphify] Install Graphify with pipx or set GRAPHIFY_PYTHON to the interpreter that imports graphify." >&2
  exit 1
fi

mkdir -p graphify-out
printf '%s\n' "$PYTHON" > graphify-out/.graphify_python

echo "[graphify] Using $PYTHON"
"$PYTHON" scripts/rebuild-graphify-ast.py

echo "[graphify] Open graphify-out/obsidian in Obsidian for local architecture review."
echo "[graphify] Upload with: node --env-file=.env scripts/upload-graphify.mjs graphify-out <r2-prefix>"
