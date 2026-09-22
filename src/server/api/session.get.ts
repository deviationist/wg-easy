import { defineEventHandler } from 'h3';

// Explicit import: upstream disabled Nuxt auto-imports in v15.4.0 (#2672), so a
// bare getCurrentUser() call compiles fine and is undefined at runtime.
import { getCurrentUser } from '#server/utils/session';
import type { SharedPublicUser } from '#shared/utils/permissions';

export default defineEventHandler(async (event) => {
  // Delegate to getCurrentUser so the DISABLE_AUTH path (and Basic auth) also
  // satisfy the client-side auth.global.ts middleware, not just session cookies.
  // getCurrentUser throws on no/invalid auth, which the client treats as
  // "not logged in" and redirects to /login. The pendingLogin check upstream
  // had here now lives in getCurrentUser.
  const user = await getCurrentUser(event);

  return {
    id: user.id,
    role: user.role,
    username: user.username,
    name: user.name,
    email: user.email,
    totpVerified: user.totpVerified,
    oauthProvider: user.oauthProvider,
    hasPassword: user.password !== null,
  } satisfies SharedPublicUser;
});
