#!/bin/bash
set -euo pipefail
: "${R07_DASHBOARD_ROOT:?Set to an installed Dashboard checkout for pg}"
R07_SPIKE_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
R07_CLUSTER_DIR=$(mktemp -d /private/tmp/studio-builder-r07.XXXXXX)
printf 'Synthetic cluster logs: %s\n' "$R07_CLUSTER_DIR"
R07_PORT=${R07_PORT:-55457}
initdb -D "$R07_CLUSTER_DIR/data" --auth-local=trust --auth-host=trust -U postgres > "$R07_CLUSTER_DIR/init.log"
pg_ctl -D "$R07_CLUSTER_DIR/data" -l "$R07_CLUSTER_DIR/server.log" -o "-h 127.0.0.1 -p $R07_PORT -k $R07_CLUSTER_DIR" -w start
trap 'pg_ctl -D "$R07_CLUSTER_DIR/data" -m fast -w stop > "$R07_CLUSTER_DIR/stop.log"' EXIT
createdb -h 127.0.0.1 -p "$R07_PORT" -U postgres studio_builder_r07
export R07_DATABASE_TEST_URL="postgresql://postgres@127.0.0.1:$R07_PORT/studio_builder_r07"
node --test "$R07_SPIKE_DIR/experiment.test.mjs"
