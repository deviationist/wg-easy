---
title: Trusted-Proxy Authentication
---

`wg-easy` can be configured to trust an upstream reverse proxy to authenticate
users — useful when fronting it with an SSO solution like **Authelia**,
**oauth2-proxy**, **Authentik**, or **Caddy forward_auth**. After the proxy
authenticates the user, it sets a header (e.g. Authelia's `Remote-User`),
which `wg-easy` reads to identify the user without prompting for a second login.

## Threat model — read this first

Trusted-proxy auth shifts the authentication boundary from `wg-easy` itself to
the network layer in front of it. **Anyone who can both reach `wg-easy` and
set the configured header bypasses authentication entirely.** That is not a bug
— it is the entire premise of the feature — but it means the network layer
must be configured correctly.

Enable this only when *both* of the following hold:

1. **`wg-easy` is bound to a trusted interface.** Bind to `127.0.0.1` (or a
   host-only Docker network) so the only path to the container is through your
   reverse proxy. Public-internet binding with this flag is a critical
   misconfiguration.
2. **The reverse proxy strips client-supplied copies of the auth header
   before adding its own.** By default `nginx` forwards all request headers
   the client sent — including `Remote-User`. If you do not explicitly clear
   it, a malicious client can spoof the header and walk in.

If either condition is in doubt, leave this feature disabled.

## Configuration

### `wg-easy`

```yaml
environment:
  - TRUSTED_PROXY_AUTH=true
  - TRUSTED_PROXY_AUTH_HEADER=Remote-User  # default; change for oauth2-proxy etc.
```

### nginx (with Authelia forward-auth)

The critical lines are the `proxy_set_header ... "";` block that **clears
client-supplied auth headers** before letting Authelia repopulate them.

```nginx
location / {
    # Drop anything the client might have sent — defense against header forgery.
    proxy_set_header Remote-User    "";
    proxy_set_header Remote-Groups  "";
    proxy_set_header Remote-Name    "";
    proxy_set_header Remote-Email   "";

    # Authelia auth_request
    auth_request /internal/authelia/authz;
    auth_request_set $user   $upstream_http_remote_user;
    auth_request_set $groups $upstream_http_remote_groups;
    auth_request_set $name   $upstream_http_remote_name;
    auth_request_set $email  $upstream_http_remote_email;

    # Now set the verified values for wg-easy to read.
    proxy_set_header Remote-User    $user;
    proxy_set_header Remote-Groups  $groups;
    proxy_set_header Remote-Name    $name;
    proxy_set_header Remote-Email   $email;

    proxy_pass http://wg-easy-upstream;
    # ...
}
```

### oauth2-proxy

oauth2-proxy uses `X-Forwarded-User` by default. Set:

```yaml
environment:
  - TRUSTED_PROXY_AUTH=true
  - TRUSTED_PROXY_AUTH_HEADER=X-Forwarded-User
```

And ensure your reverse proxy strips the client-supplied `X-Forwarded-User`
before oauth2-proxy populates it.

## User mapping

`wg-easy` requires a local user record matching the header value. Users are
matched **by `username`, case-sensitively**.

- **First-time setup**: walk the setup wizard normally. Pick a username that
  matches what your SSO provider will send. The local password is required
  by the wizard but will never be used when SSO is active — you may set it
  to anything sufficiently long.
- **Additional users**: create them via the Admin Panel, again matching the
  SSO username. There is no auto-provisioning of unknown users — by design,
  the local user list is the authoritative allowlist.

## Behaviour matrix

| `TRUSTED_PROXY_AUTH` | Header present | User exists | User enabled | Result |
| --- | --- | --- | --- | --- |
| `false` | — | — | — | header ignored; falls back to session/Basic |
| `true` | no | — | — | falls back to session/Basic (so SSH-tunnel login still works if SSO is down) |
| `true` | yes | no | — | `401 Trusted-proxy user not found` (fails closed — does not fall back) |
| `true` | yes | yes | no | `403 User is disabled` |
| `true` | yes | yes | yes | authenticated as that user |

When the header *is* present, it is treated as authoritative — there is no
silent fallback to a session cookie. This prevents a stale cookie from
overriding an SSO logout (the user the cookie names may differ from the user
the SSO header names).

## What this does not protect against

- A reverse proxy that does not strip client-supplied auth headers
  (covered above).
- `wg-easy` being reachable on a network interface other than the trusted
  proxy.
- Compromise of the SSO provider itself — `wg-easy` trusts whatever the proxy
  tells it.
- Per-request authorization of headers from sources other than the SSO
  proxy. `wg-easy` does not verify *which* upstream sent the header.

For a stronger boundary (no network trust required), look at native OIDC
client support — currently not implemented, tracked as a possible future
enhancement.
