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
   * When `true`, AND at least one of `DISABLE_AUTH_USER_ID` /
   * `DISABLE_AUTH_USERNAME` resolves to an existing user, every request is
   * treated as authenticated as that user. Session cookies, Basic auth, and
   * 2FA are all ignored.
   *
   * SECURITY: anyone who can reach the wg-easy port becomes admin. Only enable
   * when wg-easy is bound to a trusted interface (e.g. 127.0.0.1) and gated
   * upstream by something else (LAN-only firewall, VPN, reverse proxy with
   * its own auth, etc.). Public-internet exposure with this flag is a
   * critical misconfiguration.
   *
   * `DISABLE_AUTH=true` without a user identifier is treated as a no-op.
   * If both identifiers are set, they must resolve to the same user row.
   */
  DISABLE_AUTH: process.env.DISABLE_AUTH === 'true',
  /** Numeric `users_table.id` of the user impersonated when DISABLE_AUTH is on. */
  DISABLE_AUTH_USER_ID: parseUserId(process.env.DISABLE_AUTH_USER_ID),
  /** Username of the user impersonated when DISABLE_AUTH is on. */
  DISABLE_AUTH_USERNAME: process.env.DISABLE_AUTH_USERNAME,
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

/**
 * Parse a positive-integer user ID from env. Throws at boot on garbage so the
 * operator finds the typo immediately instead of getting a runtime "user not
 * found" surprise the first time DISABLE_AUTH actually fires.
 */
function parseUserId(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(
      `Invalid DISABLE_AUTH_USER_ID: ${JSON.stringify(raw)} (must be a positive integer)`
    );
  }
  return n;
}
