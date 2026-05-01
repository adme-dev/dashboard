#!/usr/bin/env bash
# Copies server/utils/leads/* into workers/leads-delivery-worker/src/ before deploy.
# Until we set up a proper monorepo or shared package, copy is the simplest path.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
DST="$ROOT/workers/leads-delivery-worker/src"
mkdir -p "$DST/leads"
cp -R "$ROOT/server/utils/leads/." "$DST/leads/"
# Re-export the dispatch entry from index for the Worker to import as './dispatch'
cat > "$DST/dispatch.ts" <<'EOF'
export { handleQueueMessage } from './leads/dispatch'
EOF
echo "synced shared leads code"
