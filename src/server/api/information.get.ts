import { defineEventHandler } from 'h3';
import { gt } from 'semver';

import Database from '#server/utils/Database';
import { RELEASE, WG_ENV } from '#server/utils/config';
import { cachedFetchLatestRelease } from '#server/utils/release';

export default defineEventHandler(async () => {
  const latestRelease = await cachedFetchLatestRelease();
  const updateAvailable = gt(latestRelease.version, RELEASE);
  const insecure = WG_ENV.INSECURE;
  const isAwg = WG_ENV.WG_EXECUTABLE === 'awg';
  const wgInterface = await Database.interfaces.get();

  return {
    currentRelease: RELEASE,
    latestRelease: latestRelease,
    updateAvailable,
    insecure,
    isAwg,
    firewallEnabled: wgInterface.firewallEnabled,
    appTitle: WG_ENV.APP_TITLE,
    // disableAuth is true only when DISABLE_AUTH is on AND at least one
    // identifier is set (matches the getCurrentUser activation condition).
    disableAuth:
      WG_ENV.DISABLE_AUTH &&
      (WG_ENV.DISABLE_AUTH_USER_ID !== undefined ||
        !!WG_ENV.DISABLE_AUTH_USERNAME),
  };
});
