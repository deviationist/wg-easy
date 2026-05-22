---
title: Container Hardening
---

By default, `wg-easy` runs as `root` inside the container with Docker's default
capability set plus `NET_ADMIN` and `SYS_MODULE`. That works out of the box, but
it grants the container more privilege than it needs. This page documents how to
restrict it.

There are two independent axes to harden along, and you can apply either one
without the other.

## Axis 1: Trim the Linux capability set

Docker's default capability set is broad — it includes `CHOWN`, `FOWNER`,
`DAC_OVERRIDE`, `FSETID`, `KILL`, `SETGID`, `SETUID`, `SETPCAP`, `SETFCAP`,
`NET_BIND_SERVICE`, `NET_RAW`, `SYS_CHROOT`, `MKNOD`, and `AUDIT_WRITE`. None of
those are needed by `wg-easy`. You can drop them all and re-add only what's
actually used:

```yaml
cap_drop:
  - ALL
cap_add:
  - NET_ADMIN
  - NET_RAW
  - SYS_MODULE  # remove if the host preloads the `wireguard` kernel module
```

/// warning | `NET_RAW` is not optional

The image uses `iptables-legacy` by default. `iptables-legacy` opens a raw
socket (`socket(AF_INET, SOCK_RAW, IPPROTO_RAW)`) before pushing rules — that
syscall requires `CAP_NET_RAW`.

Without it, `iptables` fails with:

```text
iptables: can't initialize iptables table 'nat': Permission denied (you must be root)
```

The error message is misleading: it's not about being root, it's about the raw
socket. Docker's default cap set includes `NET_RAW`, so the failure only shows
up after you add `cap_drop: [ALL]`. Rootful Podman also omits `NET_RAW` from
its default set — same failure mode.

///

`SYS_MODULE` is only needed when the container has to `modprobe wireguard`
itself. If your host already has the kernel module loaded — check with
`lsmod | grep wireguard` — you can drop it. To preload it persistently:

```shell
echo wireguard | sudo tee /etc/modules-load.d/wireguard.conf
```

## Axis 2: Run the server as a non-root user

Set `DROP_PRIVILEGES=true` and the entrypoint will:

1. `chown -R $PUID:$PGID /etc/wireguard /var/run/wireguard` (idempotent — safe
   to point at an existing root-owned named volume from a 15.x deployment, the
   chown will run once and then no-op).
2. Re-exec the server via `setpriv` as `$PUID:$PGID` with `NET_ADMIN`,
   `NET_RAW`, and (if granted) `SYS_MODULE` in the **ambient** capability set,
   so that `wg-quick`, `iptables`, `wg`, and `ip` children inherit them across
   `execve(2)`.

`PUID` and `PGID` default to `911` (the user the image bakes in). Override them
when bind-mounting `/etc/wireguard` from the host and you want the files on the
host to be owned by a specific local user — e.g. set `PUID=1000` and `PGID=1000`
to match the typical desktop Linux user.

This axis composes with `no-new-privileges:true`, because the capability
transfer happens before the privilege drop — no file capabilities or setuid
binaries are involved.

```yaml
environment:
  - DROP_PRIVILEGES=true
security_opt:
  - no-new-privileges:true
```

The default is `DROP_PRIVILEGES=false` so existing deployments are unaffected.

## Full hardened compose

Combining both axes, on top of the default `docker-compose.yml`:

```yaml
services:
  wg-easy:
    image: ghcr.io/wg-easy/wg-easy:15
    # ... unchanged: volumes, ports, sysctls, networks ...
    cap_drop:
      - ALL
    cap_add:
      - NET_ADMIN
      - NET_RAW
      - SYS_MODULE  # remove if the host preloads the wireguard module
    security_opt:
      - no-new-privileges:true
    environment:
      - DROP_PRIVILEGES=true
      # - PUID=1000           # optional, defaults to 911
      # - PGID=1000
```

## Read-only root filesystem

`wg-easy` writes to `/etc/wireguard` (its volume) and reads `/sys/class/net/`,
`/proc`, `/lib/modules`. It does not write anywhere else under `/`. You can
combine the above with `read_only: true` if you provide a tmpfs for
`/var/run/wireguard` (where `wg-quick` keeps transient state):

```yaml
read_only: true
tmpfs:
  - /var/run/wireguard
  - /tmp
```

## Alternative: Docker user namespaces (`userns-remap`)

If you'd rather not change the container at all, the daemon-level alternative
is `userns-remap` in `/etc/docker/daemon.json`:

```json
{ "userns-remap": "default" }
```

This maps in-container UID 0 to an unprivileged host UID (e.g. 100000). A
container compromise that gains in-container root then has roughly the
authority of an unprivileged host user. This works without `DROP_PRIVILEGES`
and applies to every container the daemon runs — not specific to `wg-easy`.

Trade-off: bind-mounted host directories must be readable/writable by the
remapped UID, which often means re-`chown`ing them into the remapped range.

## What this does not protect against

- A vulnerability in WireGuard or its protocol — kernel-level WireGuard runs
  regardless of how the userspace container is configured.
- Compromise of the host kernel via `SYS_MODULE` (if granted) — that capability
  is broad. Prefer host-side module preload and drop `SYS_MODULE`.
- Misconfigured PreUp / PostUp hooks, which run as whatever `wg-quick` runs as
  (root, or the unprivileged user with the ambient set). Validate hooks before
  saving.
