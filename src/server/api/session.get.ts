import type { SharedPublicUser } from '~~/shared/utils/permissions';

export default defineEventHandler(async (event) => {
  // Delegate to getCurrentUser so the DISABLE_AUTH path (and Basic auth)
  // also satisfy the client-side auth.global.ts middleware, not just session
  // cookies. getCurrentUser throws on no/invalid auth, which the client
  // treats as "not logged in" and redirects to /login.
  const user = await getCurrentUser(event);

  return {
    id: user.id,
    role: user.role,
    username: user.username,
    name: user.name,
    email: user.email,
    totpVerified: user.totpVerified,
  } satisfies SharedPublicUser;
});
