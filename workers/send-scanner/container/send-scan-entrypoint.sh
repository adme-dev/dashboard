#!/bin/sh
set -eu

cloudflare_ca=/etc/cloudflare/certs/cloudflare-containers-ca.crt
if [ -f "$cloudflare_ca" ]; then
  cp "$cloudflare_ca" /usr/local/share/ca-certificates/cloudflare-containers-ca.crt
  update-ca-certificates >/dev/null
fi

/init &
clamav_init_pid=$!

attempt=0
until nc -z 127.0.0.1 3310; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 600 ]; then
    kill "$clamav_init_pid" 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

exec /usr/local/bin/send-scan-server
