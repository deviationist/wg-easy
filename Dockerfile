FROM docker.io/library/node:krypton-alpine AS build
WORKDIR /app

# update corepack
RUN npm install --global corepack@latest
# Install pnpm
RUN corepack enable pnpm

# Copy Web UI
COPY src/package.json src/pnpm-lock.yaml src/pnpm-workspace.yaml ./
RUN pnpm install

# Build UI
COPY src ./
RUN pnpm build

# Build amneziawg-tools
RUN apk add linux-headers build-base go git && \
    git clone https://github.com/amnezia-vpn/amneziawg-tools.git && \
    git clone https://github.com/amnezia-vpn/amneziawg-go && \
    cd amneziawg-go && \
    make && \
    cd ../amneziawg-tools/src && \
    make && \
    sed -i 's|\[\[ $proto == -4 \]\] && cmd sysctl -q net\.ipv4\.conf\.all\.src_valid_mark=1|[[ $proto == -4 ]] \&\& [[ $(sysctl -n net.ipv4.conf.all.src_valid_mark) != 1 ]] \&\& cmd sysctl -q net.ipv4.conf.all.src_valid_mark=1|' ./wg-quick/linux.bash

FROM docker.io/library/node:krypton-alpine AS build-libsql
WORKDIR /app
RUN npm install --no-save --omit=dev libsql

# Copy build result to a new image.
# This saves a lot of disk space.
FROM docker.io/library/node:krypton-alpine
WORKDIR /app

# Cap-free healthcheck: a wg interface present in sysfs is enough to know
# wg-quick brought the link up. /usr/bin/wg works too but requires CAP_NET_ADMIN
# to talk to the wireguard netlink, which fails after DROP_PRIVILEGES=true if
# /usr/bin/wg has no file capabilities. Sysfs reads need nothing.
HEALTHCHECK --interval=1m --timeout=5s --retries=3 CMD /usr/bin/timeout 5s /bin/sh -c "ls /sys/class/net/ | /bin/grep -qE '^(wg|awg)[0-9]+$' || exit 1"

# Copy build
COPY --from=build /app/.output /app
# Copy migrations
COPY --from=build /app/server/database/migrations /app/server/database/migrations
# libsql (https://github.com/nitrojs/nitro/issues/3328)
COPY --from=build-libsql /app/node_modules /app/server/node_modules

# cli
COPY --from=build /app/cli/cli.sh /usr/local/bin/cli
RUN chmod +x /usr/local/bin/cli
# Copy amneziawg-go
COPY --from=build /app/amneziawg-go/amneziawg-go /usr/bin/amneziawg-go
RUN chmod +x /usr/bin/amneziawg-go
# Copy amneziawg-tools
COPY --from=build /app/amneziawg-tools/src/wg /usr/bin/awg
COPY --from=build /app/amneziawg-tools/src/wg-quick/linux.bash /usr/bin/awg-quick
RUN chmod +x /usr/bin/awg /usr/bin/awg-quick

# Install Linux packages
# - libcap: capsh, for the DROP_PRIVILEGES capability probe in the entrypoint
# - setpriv: the actual privilege drop with ambient caps. Alpine ships a
#   BusyBox stub at /bin/setpriv that does NOT support --reuid/--regid/
#   --clear-groups — we need the standalone `setpriv` package, which installs
#   the util-linux binary at /bin/setpriv, overwriting the BusyBox symlink.
#   (Note: NOT util-linux-misc; that package omits setpriv.)
RUN apk add --no-cache \
    dpkg \
    dumb-init \
    iptables \
    ip6tables \
    nftables \
    kmod \
    iptables-legacy \
    libcap \
    setpriv \
    wireguard-go \
    wireguard-tools && \
    sed -i 's|\[\[ $proto == -4 \]\] && cmd sysctl -q net\.ipv4\.conf\.all\.src_valid_mark=1|[[ $proto == -4 ]] \&\& [[ $(sysctl -n net.ipv4.conf.all.src_valid_mark) != 1 ]] \&\& cmd sysctl -q net.ipv4.conf.all.src_valid_mark=1|' /usr/bin/wg-quick && \
    # wg-quick's auto_su() re-execs the script via sudo when UID != 0. With
    # DROP_PRIVILEGES=true we *want* to run as non-root with ambient caps —
    # escalating via sudo would (a) fail since sudo isn't in the image, and
    # (b) discard the ambient caps even if it succeeded. Neuter the check.
    sed -i '/\[\[ \$UID == 0 \]\] ||/c\	: # wg-easy: non-root with ambient caps; no sudo escalation needed' /usr/bin/wg-quick && \
    sed -i '/\[\[ \$UID == 0 \]\] ||/c\	: # wg-easy: non-root with ambient caps; no sudo escalation needed' /usr/bin/awg-quick

RUN mkdir -p /etc/amnezia
RUN ln -s /etc/wireguard /etc/amnezia/amneziawg

# Unprivileged user used when DROP_PRIVILEGES=true. The UID/GID are fixed so
# that bind-mounted host paths can be chown'd predictably; the entrypoint
# re-chowns /etc/wireguard on first boot when the flag is set, so existing
# root-owned named volumes from 15.x deployments migrate transparently.
RUN addgroup -S -g 911 wg-easy && \
    adduser -S -D -H -u 911 -G wg-easy -s /sbin/nologin wg-easy && \
    mkdir -p /var/run/wireguard && \
    # iptables uses /run/xtables.lock as a serialization mutex. It would
    # normally create it on first invocation, but /run is root-only and the
    # non-root server can't write there. Pre-create + chown so iptables can
    # acquire the lock under DROP_PRIVILEGES=true. Harmless for root mode.
    touch /run/xtables.lock && \
    chown -R wg-easy:wg-easy /var/run/wireguard /etc/wireguard /app /run/xtables.lock

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Use iptables-legacy
RUN update-alternatives --install /usr/sbin/iptables iptables /usr/sbin/iptables-legacy 10 --slave /usr/sbin/iptables-restore iptables-restore /usr/sbin/iptables-legacy-restore --slave /usr/sbin/iptables-save iptables-save /usr/sbin/iptables-legacy-save
RUN update-alternatives --install /usr/sbin/ip6tables ip6tables /usr/sbin/ip6tables-legacy 10 --slave /usr/sbin/ip6tables-restore ip6tables-restore /usr/sbin/ip6tables-legacy-restore --slave /usr/sbin/ip6tables-save ip6tables-save /usr/sbin/ip6tables-legacy-save

# Set Environment
ENV DEBUG=Server,WireGuard,Database,CMD,Firewall
ENV PORT=51821
ENV HOST=0.0.0.0
ENV INSECURE=false
ENV INIT_ENABLED=false
ENV DISABLE_IPV6=false
# Opt-in privilege drop. When true, the entrypoint chowns state to PUID:PGID and
# re-execs the server via setpriv with NET_ADMIN+NET_RAW (plus SYS_MODULE if the
# container has it) in the ambient set so wg-quick and iptables children inherit
# the capabilities they need. Default false to preserve the behaviour of 15.x
# deployments. See docs/advanced/config/hardening.md.
ENV DROP_PRIVILEGES=false
# UID/GID the unprivileged process runs as when DROP_PRIVILEGES=true. Defaults
# to 911:911 (the user baked into the image). Override to match the host user
# that owns the bind-mounted /etc/wireguard, if any.
ENV PUID=911
ENV PGID=911

LABEL org.opencontainers.image.source=https://github.com/wg-easy/wg-easy

# Run Web UI
CMD ["/entrypoint.sh"]
