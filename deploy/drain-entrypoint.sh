#!/bin/sh
set -eu

drain_seconds=${SHUTDOWN_DRAIN_SECONDS:-20}
case "$drain_seconds" in
  ''|*[!0-9]*)
    echo "SHUTDOWN_DRAIN_SECONDS must be a non-negative integer" >&2
    exit 1
    ;;
esac

# A real, app-owned shared mount is required. Hold the release lease until all
# nginx workers exit; the kernel releases it even after a forced container stop.
release_sha=$(node /usr/local/lib/docs/shared-docs-releases.mjs check)
store=/var/lib/conv3d-docs-releases
mkdir -p "$store/leases"
exec 9>"$store/leases/$release_sha.lock"
flock -s 9
exec 8>"$store/.publish.lock"
flock -x 8
node /usr/local/lib/docs/shared-docs-releases.mjs publish
flock -u 8
exec 8>&-

marker=/tmp/conv3d-draining
rm -f "$marker"

# Keep nginx serving while Coolify removes this unhealthy container from Traefik.
drain() {
  trap '' TERM INT
  touch "$marker"
  sleep "$drain_seconds"
  # QUIT lets accepted requests finish. Keep PID 1 alive until the master
  # exits; leaving the interrupted wait would kill its remaining workers.
  kill -QUIT "$nginx_pid" 2>/dev/null || true
  status=0
  wait "$nginx_pid" || status=$?
  exit "$status"
}

/docker-entrypoint.sh "$@" &
nginx_pid=$!
trap drain TERM INT
status=0
wait "$nginx_pid" || status=$?
exit "$status"
