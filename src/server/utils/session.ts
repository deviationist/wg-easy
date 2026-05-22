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

  // Trusted-proxy auth: if enabled, look up the user by the header the upstream
  // proxy supplies (Authelia's Remote-User, oauth2-proxy's X-Forwarded-User, etc.).
  // When the header is *present*, it is authoritative — we do not fall through
  // to session/Basic auth, since that would let a stale cookie override the
  // SSO-claimed identity. When the header is *absent*, we fall through (so an
  // SSH-tunnelled session-cookie login still works if the SSO provider is down).
  if (WG_ENV.TRUSTED_PROXY_AUTH) {
    const proxyUsername = getHeader(event, WG_ENV.TRUSTED_PROXY_AUTH_HEADER);
    if (proxyUsername) {
      user = await Database.users.getByUsername(proxyUsername);
      if (!user) {
        throw createError({
          statusCode: 401,
          statusMessage: 'Trusted-proxy user not found',
        });
      }
      // user.enabled is checked by the common path below
    }
  }

  if (user) {
    // already authenticated via trusted proxy header
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
