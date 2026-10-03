#!/bin/sh
set -eu

# Keep nginx serving while Coolify removes this unhealthy container from Traefik.
drain() {
  trap '' TERM INT
  touch /tmp/conv3d-draining
  sleep "${SHUTDOWN_DRAIN_SECONDS:-20}"
  kill -QUIT "$child" 2>/dev/null || true
  # The outer wait was interrupted by TERM. Keep PID 1 alive until nginx
  # finishes accepted requests, or Docker kills its remaining workers.
  status=0
  wait "$child" || status=$?
  exit "$status"
}

rm -f /tmp/conv3d-draining
/docker-entrypoint.sh "$@" &
child=$!
trap drain TERM INT
status=0
wait "$child" || status=$?
exit "$status"
