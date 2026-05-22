import { createDebug } from 'obug';
import packageJson from '@@/package.json';

export const RELEASE = 'v' + packageJson.version;

export const SERVER_DEBUG = createDebug('Server');

export const OLD_ENV = {
  /** @deprecated Only for migration purposes */
  PASSWORD: process.env.PASSWORD,
  /** @deprecated Only for migration purposes */
  PASSWORD_HASH: process.env.PASSWORD_HASH,
};

const detectAwg = async (): Promise<'awg' | 'wg'> => {
  /** TODO: delete on next major version */
  if (process.env.EXPERIMENTAL_AWG === 'true') {
    const OVERRIDE_AUTO_AWG = process.env.OVERRIDE_AUTO_AWG?.toLowerCase();

    if (
      OVERRIDE_AUTO_AWG === ('wg' as const) ||
      OVERRIDE_AUTO_AWG === ('awg' as const)
    ) {
      return OVERRIDE_AUTO_AWG;
    } else {
      return await exec('modinfo amneziawg')
        .then(() => 'awg' as const)
        .catch(() => 'wg' as const);
    }
  } else return 'wg';
};

export const WG_ENV = {
  /** UI is hosted on HTTP instead of HTTPS */
  INSECURE: process.env.INSECURE === 'true',
  /** Port the UI is listening on */
  PORT: assertEnv('PORT'),
  /** If IPv6 should be disabled */
  DISABLE_IPV6: process.env.DISABLE_IPV6 === 'true',
  /**
   * Trust an upstream reverse proxy to authenticate the user via a header
   * (e.g. Authelia's `Remote-User`, oauth2-proxy's `X-Forwarded-User`).
   *
   * SECURITY: only enable when wg-easy is bound to a trusted interface
   * (e.g. 127.0.0.1) or behind a reverse proxy that strips/sets the named
   * header explicitly. With public exposure, anyone could forge the header.
   *
   * Local session/Basic auth continues to work alongside this — proxy auth
   * is an additional path, not a replacement. This means an SSH-tunnelled
   * login still works if your SSO provider is down.
   */
  TRUSTED_PROXY_AUTH: process.env.TRUSTED_PROXY_AUTH === 'true',
  /** HTTP header carrying the authenticated username from the upstream proxy. */
  TRUSTED_PROXY_AUTH_HEADER:
    process.env.TRUSTED_PROXY_AUTH_HEADER ?? 'Remote-User',
  WG_EXECUTABLE: await detectAwg(),
};

export const WG_INITIAL_ENV = {
  ENABLED: process.env.INIT_ENABLED === 'true',
  USERNAME: process.env.INIT_USERNAME,
  PASSWORD: process.env.INIT_PASSWORD,
  DNS: process.env.INIT_DNS?.split(',').map((x) => x.trim()),
  IPV4_CIDR: process.env.INIT_IPV4_CIDR,
  IPV6_CIDR: process.env.INIT_IPV6_CIDR,
  ALLOWED_IPS: process.env.INIT_ALLOWED_IPS?.split(',').map((x) => x.trim()),
  HOST: process.env.INIT_HOST,
  PORT: process.env.INIT_PORT
    ? Number.parseInt(process.env.INIT_PORT, 10)
    : undefined,
};

function assertEnv<T extends string>(env: T) {
  const val = process.env[env];

  if (!val) {
    throw new Error(`Missing environment variable: ${env}`);
  }

  return val;
}
