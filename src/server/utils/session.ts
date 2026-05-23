import type { H3Event } from 'h3';
import type { UserType } from '#db/repositories/user/types';

export type WGSession = Partial<{
  userId: ID;
}>;

const name = 'wg-easy';

export async function useWGSession(event: H3Event, rememberMe = false) {
  const sessionConfig = await Database.general.getSessionConfig();
  return useSession<WGSession>(event, {
    password: sessionConfig.sessionPassword,
    name,
    // TODO: add session expiration
    // maxAge: undefined
    cookie: {
      maxAge: rememberMe ? sessionConfig.sessionTimeout : undefined,
      secure: !WG_ENV.INSECURE,
    },
  });
}

export async function getWGSession(event: H3Event) {
  const sessionConfig = await Database.general.getSessionConfig();
  return getSession<WGSession>(event, {
    password: sessionConfig.sessionPassword,
    name,
    cookie: {
      secure: !WG_ENV.INSECURE,
    },
  });
}

/**
 * @throws
 */
export async function getCurrentUser(event: H3Event) {
  const session = await getWGSession(event);

  const authorization = getHeader(event, 'Authorization');

  let user: UserType | undefined = undefined;

  // Disable-auth: when DISABLE_AUTH=true AND at least one of the two
  // identifier env vars resolves to an existing user, every request is
  // treated as that user. Session cookies, Basic auth, and 2FA are all
  // bypassed.
  //
  // - At least one identifier (`DISABLE_AUTH_USER_ID` or
  //   `DISABLE_AUTH_USERNAME`) is required. A stray `DISABLE_AUTH=true`
  //   alone is treated as no-op (falls through to normal auth).
  // - If both identifiers are set, they must resolve to the same user row;
  //   otherwise fail-closed (catches config drift after a rename).
  // - Missing target user fails closed too — explicit intent + dead pointer
  //   is a misconfiguration, not a reason to silently show the login form.
  //
  // SECURITY: anyone who can reach the wg-easy port becomes that user. Only
  // enable when bound to a trusted interface. See docs/.../disable-auth.md.
  if (WG_ENV.DISABLE_AUTH) {
    const hasId = WG_ENV.DISABLE_AUTH_USER_ID !== undefined;
    const hasName = !!WG_ENV.DISABLE_AUTH_USERNAME;

    if (hasId || hasName) {
      const byId = hasId
        ? await Database.users.get(WG_ENV.DISABLE_AUTH_USER_ID!)
        : undefined;
      const byName = hasName
        ? await Database.users.getByUsername(WG_ENV.DISABLE_AUTH_USERNAME!)
        : undefined;

      if (hasId && hasName) {
        if (!byId || !byName || byId.id !== byName.id) {
          throw createError({
            statusCode: 401,
            statusMessage: `DISABLE_AUTH_USER_ID=${WG_ENV.DISABLE_AUTH_USER_ID} and DISABLE_AUTH_USERNAME='${WG_ENV.DISABLE_AUTH_USERNAME}' do not resolve to the same user`,
          });
        }
        user = byId;
      } else {
        user = byId ?? byName;
      }

      if (!user) {
        throw createError({
          statusCode: 401,
          statusMessage: `DISABLE_AUTH target user not found (id=${WG_ENV.DISABLE_AUTH_USER_ID ?? '∅'}, username='${WG_ENV.DISABLE_AUTH_USERNAME || '∅'}')`,
        });
      }
      // user.enabled is checked by the common path below — disabled → 403
    }
  }

  if (user) {
    // already authenticated via disable-auth
  } else if (session.data.userId) {
    // Handle if authenticating using Session
    user = await Database.users.get(session.data.userId);
  } else if (authorization) {
    // Handle if authenticating using Header
    const [method, value] = authorization.split(' ');
    // Support Basic Authentication
    // TODO: support personal access token or similar
    if (method !== 'Basic' || !value) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid Basic Authorization',
      });
    }

    const basicValue = Buffer.from(value, 'base64').toString('utf-8');

    // Split by first ":"
    const index = basicValue.indexOf(':');
    const username = basicValue.substring(0, index);
    const password = basicValue.substring(index + 1);

    if (!username || !password) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid Basic Authorization',
      });
    }

    // TODO: timing can be used to enumerate usernames

    const foundUser = await Database.users.getByUsername(username);

    if (!foundUser) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Session failed',
      });
    }

    const userHashPassword = foundUser.password;
    const passwordValid = await isPasswordValid(password, userHashPassword);

    if (!passwordValid) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Session failed',
      });
    }
    user = foundUser;
  } else {
    throw createError({
      statusCode: 401,
      statusMessage: 'Session failed. No Authorization',
    });
  }

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Session failed. User not found',
    });
  }

  if (!user.enabled) {
    throw createError({
      statusCode: 403,
      statusMessage: 'User is disabled',
    });
  }

  return user;
}
