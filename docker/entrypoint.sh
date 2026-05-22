#!/bin/sh
# wg-easy container entrypoint.
#
# By default, runs the server as root (back-compat). When DROP_PRIVILEGES=true,
# chowns the runtime state directories to PUID:PGID and re-execs the server as
# that UID with NET_ADMIN and NET_RAW in the ambient capability set so wg-quick
# and iptables children inherit them across execve.
#
# Capabilities still come from the container runtime (cap_add). DROP_PRIVILEGES
# does not grant them — it only restricts which UID gets to use them. Compose
# users must pair DROP_PRIVILEGES=true with `cap_drop: [ALL]` and an explicit
# `cap_add: [NET_ADMIN, NET_RAW]` (plus SYS_MODULE if the host does not preload
# the wireguard kernel module).
#
# Env vars:
#   DROP_PRIVILEGES  Default false. When true, drops to PUID:PGID via setpriv.
#   PUID             Default 911. UID the server runs as after privilege drop.
#   PGID             Default 911. GID the server runs as after privilege drop.
#
# PUID/PGID default to 911 because that's the user the Dockerfile bakes in. They
# matter when bind-mounting /etc/wireguard from the host and you want the files
# on the host to be owned by a specific local user.

set -eu

PUID="${PUID:-911}"
PGID="${PGID:-911}"

run_as_root() {
  exec /usr/bin/dumb-init node /app/server/index.mjs
}

if [ "${DROP_PRIVILEGES:-false}" != "true" ]; then
  run_as_root
fi

# Alpine's BusyBox ships a stub /bin/setpriv that lacks --reuid/--regid/
# --clear-groups. The standalone `setpriv` Alpine package installs the full
# util-linux binary at /bin/setpriv, overwriting the BusyBox symlink. Verify
# we have the real one by asking for an option BusyBox doesn't support.
SETPRIV=/bin/setpriv
if ! "$SETPRIV" --help 2>&1 | grep -q -- '--reuid'; then
  echo "DROP_PRIVILEGES=true requires util-linux setpriv (with --reuid) at $SETPRIV." >&2
  echo "Install the Alpine 'setpriv' package — util-linux-misc does NOT include it." >&2
  exit 1
fi

# Make state writable by the unprivileged user. We only invoke chown when
# something is actually mis-owned — the chown syscall itself requires
# CAP_CHOWN, and `cap_drop: [ALL] + cap_add: [NET_ADMIN, NET_RAW]` (the
# documented hardened compose) removes it even though we're still nominally
# root. Without this check, every boot after the first would fail.
#
# When work IS needed and we lack CAP_CHOWN, fail with a clear remediation
# message — pre-chown on the host, or add CHOWN to cap_add.
for dir in /etc/wireguard /var/run/wireguard; do
  [ -d "$dir" ] || mkdir -p "$dir"
  # find returns the first mis-owned path, if any
  mismatch=$(find "$dir" \( ! -uid "${PUID}" -o ! -gid "${PGID}" \) -print -quit 2>/dev/null || true)
  if [ -z "$mismatch" ]; then
    continue
  fi
  if ! chown -R "${PUID}:${PGID}" "$dir" 2>/dev/null; then
    echo "ERROR: failed to chown $dir to ${PUID}:${PGID}." >&2
    echo "  The container lacks CAP_CHOWN — your cap_add probably has only NET_ADMIN+NET_RAW." >&2
    echo "  Fix either by:" >&2
    echo "    (a) pre-chowning the host bind path:  sudo chown -R ${PUID}:${PGID} <host_path>" >&2
    echo "    (b) adding 'CHOWN' to cap_add (lifecycle: only used by this entrypoint, not at runtime)" >&2
    exit 1
  fi
done

# Build the ambient set from whatever the container actually has in its
# permitted set, so SYS_MODULE is passed through when the operator added it
# (host has no preloaded wireguard module) and silently skipped otherwise.
AMBIENT="+net_admin,+net_raw"
if capsh --has-p=cap_sys_module >/dev/null 2>&1; then
  AMBIENT="${AMBIENT},+sys_module"
fi

# --clear-groups rather than --init-groups so we don't depend on PUID having a
# /etc/passwd entry. The baked-in wg-easy user exists at UID 911, but a user
# passing PUID=1000 to match their host UID won't.
exec "$SETPRIV" \
  --reuid="${PUID}" \
  --regid="${PGID}" \
  --clear-groups \
  --inh-caps="${AMBIENT}" \
  --ambient-caps="${AMBIENT}" \
  -- /usr/bin/dumb-init node /app/server/index.mjs
