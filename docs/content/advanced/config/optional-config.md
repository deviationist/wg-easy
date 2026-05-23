---
title: Optional Configuration
---

You can set these environment variables to configure the container. They are not required, but can be useful in some cases.

| Env                     | Default     | Example     | Description                                                                                          |
| ----------------------- | ----------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| `PORT`                  | `51821`     | `6789`      | TCP port for Web UI.                                                                                 |
| `HOST`                  | `0.0.0.0`   | `localhost` | IP address web UI binds to.                                                                          |
| `INSECURE`              | `false`     | `true`      | If access over http is allowed                                                                       |
| `DISABLE_IPV6`          | `false`     | `true`      | If IPv6 support should be disabled                                                                   |
| `APP_TITLE`             | `WireGuard` | `wg-prod`   | Text shown in the browser tab title. Useful to distinguish multiple instances.                       |
| `DROP_PRIVILEGES`       | `false`     | `true`      | Run as the unprivileged `wg-easy` user (UID 911). See [Hardening](./hardening.md).                   |
| `PUID`                  | `911`       | `1000`      | UID the server runs as when `DROP_PRIVILEGES=true`. Useful when bind-mounting `/etc/wireguard`.      |
| `PGID`                  | `911`       | `1000`      | GID the server runs as when `DROP_PRIVILEGES=true`.                                                  |
| `DISABLE_AUTH`          | `false`     | `true`      | Disable all wg-easy authentication. Requires `DISABLE_AUTH_USER_ID` or `DISABLE_AUTH_USERNAME`. See [Disable Auth](./disable-auth.md). |
| `DISABLE_AUTH_USER_ID`  | _(empty)_   | `1`         | Numeric `users_table.id` every request impersonates when `DISABLE_AUTH=true`.                        |
| `DISABLE_AUTH_USERNAME` | _(empty)_   | `admin`     | Username every request impersonates when `DISABLE_AUTH=true`.                                        |

/// note | IPv6 Caveats

Disabling IPv6 will disable the creation of the default IPv6 firewall rules and won't add a IPv6 address to the interface and clients.

You will however still see a IPv6 address in the Web UI, but it won't be used.

This option can be removed in the future, as more devices support IPv6.

///
