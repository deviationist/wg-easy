---
title: Disable Authentication
---

/// danger | Read the threat model before enabling

**Enabling this makes anyone who can reach the wg-easy port a full admin.**
There is no login, no password check, no 2FA. The feature is intentionally
blunt; the security model is "the network keeps strangers out."

Only enable when **both** of the following hold:

1. `wg-easy` is bound to a trusted interface — `127.0.0.1`, a host-only Docker
   network, or a WireGuard / Tailscale interface. Anyone who can TCP-connect
   to the port becomes admin.
2. You have an existing outer gate you trust: an SSH bastion, a reverse proxy
   with its own auth (Authelia / oauth2-proxy / nginx Basic), a LAN-only
   firewall, etc.

If wg-easy is reachable from the public internet with this flag set, it's a
**critical misconfiguration**. There is no recovery short of changing the
env var and restarting.

///

## When this is useful

Single-operator homelab deployments where:

- Access is already locked down at a different layer (you reach wg-easy only
  through your home LAN or your own VPN).
- The reverse-proxy SSO double-login is annoying enough that you'd rather not
  have wg-easy ask for credentials too.
- You don't want to maintain (and rotate) a separate wg-easy password just to
  click through it.

If you want SSO **without** giving up authentication, see
[Trusted-Proxy Auth](./trusted-proxy-auth.md) instead — that approach uses an
upstream proxy's verified header (e.g. Authelia's `Remote-User`) to identify
the user, while keeping wg-easy's user/role model intact.

## Configuration

`DISABLE_AUTH=true` plus **at least one** of two user identifiers is required.
Setting only `DISABLE_AUTH=true` without an identifier is treated as a no-op
— wg-easy keeps the login form.

Pick whichever identifier suits you:

```yaml
# By username (self-documenting, matches INIT_USERNAME for unattended setup)
environment:
  - DISABLE_AUTH=true
  - DISABLE_AUTH_USERNAME=admin
```

```yaml
# By numeric user ID (stable across renames; useful once multi-user UI exists)
environment:
  - DISABLE_AUTH=true
  - DISABLE_AUTH_USER_ID=1
```

You can set both for redundancy, in which case they must resolve to the same
user row — otherwise wg-easy returns `401` at request time and logs a clear
message naming both values (a useful guardrail after a rename).

### First-time setup

`wg-easy` requires at least one user in the database before it can serve
anything. The setup wizard is not bypassed by this flag — you still walk
through it on first boot to create that user.

Two convenient ways to provision:

1. **Manual wizard**: visit `/setup` in a browser, pick username `admin` (or
   whatever you put in `DISABLE_AUTH_USERNAME`), set any password (it's
   irrelevant once `DISABLE_AUTH=true`, but still required by the wizard).
2. **Fully unattended**: pair with the `INIT_*` env vars from
   [Unattended Setup](./unattended-setup.md):

   ```yaml
   environment:
     - INIT_ENABLED=true
     - INIT_USERNAME=admin
     - INIT_PASSWORD=ignored-but-must-be-12-chars
     - INIT_HOST=vpn.example.com
     - INIT_PORT=51820
     - DISABLE_AUTH=true
     - DISABLE_AUTH_USERNAME=admin
   ```

   The container goes from cold start to "fully open, single admin" with zero
   human interaction.

## Behaviour matrix

| `DISABLE_AUTH` | Identifier env vars | Target user state | Result |
| --- | --- | --- | --- |
| `false` | _any_ | _any_ | normal auth (login form) |
| `true` | both empty | _any_ | normal auth — incomplete config treated as no-op |
| `true` | one set, target missing | does not exist | `401` fail-closed |
| `true` | one set, target exists | **disabled** | `403` — common `enabled` gate applies |
| `true` | one set, target exists | enabled | every request authenticated as that user |
| `true` | both set, agree | exists, enabled | every request authenticated as that user |
| `true` | both set, **disagree** | _any_ | `401` fail-closed with diagnostic naming both values |

Both fail-closed paths are deliberate. If the target user is deleted, renamed,
or the env vars drift out of sync, you get an immediate visible `401` rather
than the login form silently reappearing or the wrong user being impersonated.

If `DISABLE_AUTH_USER_ID` is set but isn't a positive integer (e.g. typo), the
container fails to start with a clear error — you never reach the runtime
ambiguity.

## What this does not change

- The setup wizard still runs on first boot (see above).
- Local session cookies still work alongside this — they're irrelevant when
  the flag is on, since `getCurrentUser` short-circuits to the impersonated
  user before consulting cookies.
- The user/role/permission model is intact under the hood; it's just that
  every request answers "who am I?" with the same row. As wg-easy gains
  multi-user UI in the future, this flag remains scoped to one operator
  identity.

## Reverting

Comment out (or set `false`) the two env vars and `docker compose up -d` to
recreate. The login form returns immediately; existing session cookies stay
valid; no data is lost.
