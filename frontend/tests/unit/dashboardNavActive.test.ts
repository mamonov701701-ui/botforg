import { describe, expect, it } from 'vitest';
import {
  PLATFORM_NAV_PATHS,
  countActivePlatformNavItems,
  getActivePlatformNavPaths,
  isDashboardNavItemActive,
} from '../../src/features/dashboard/utils/dashboardNavActive';

describe('isDashboardNavItemActive / platform menu', () => {
  it('on /dashboard/platform activates only overview', () => {
    const path = PLATFORM_NAV_PATHS.overview;
    expect(isDashboardNavItemActive(path, PLATFORM_NAV_PATHS.overview)).toBe(true);
    expect(isDashboardNavItemActive(path, PLATFORM_NAV_PATHS.finance)).toBe(false);
    expect(isDashboardNavItemActive(path, PLATFORM_NAV_PATHS.analytics)).toBe(false);
    expect(isDashboardNavItemActive(path, PLATFORM_NAV_PATHS.users)).toBe(false);
    expect(countActivePlatformNavItems(path)).toBe(1);
    expect(getActivePlatformNavPaths(path)).toEqual([PLATFORM_NAV_PATHS.overview]);
  });

  it('on /dashboard/platform/finance activates only finance', () => {
    const path = PLATFORM_NAV_PATHS.finance;
    expect(isDashboardNavItemActive(path, PLATFORM_NAV_PATHS.overview)).toBe(false);
    expect(isDashboardNavItemActive(path, PLATFORM_NAV_PATHS.finance)).toBe(true);
    expect(isDashboardNavItemActive(path, PLATFORM_NAV_PATHS.analytics)).toBe(false);
    expect(countActivePlatformNavItems(path)).toBe(1);
    expect(getActivePlatformNavPaths(path)).toEqual([PLATFORM_NAV_PATHS.finance]);
  });

  it('on /dashboard/platform/analytics activates only analytics', () => {
    const path = PLATFORM_NAV_PATHS.analytics;
    expect(isDashboardNavItemActive(path, PLATFORM_NAV_PATHS.overview)).toBe(false);
    expect(isDashboardNavItemActive(path, PLATFORM_NAV_PATHS.analytics)).toBe(true);
    expect(isDashboardNavItemActive(path, PLATFORM_NAV_PATHS.finance)).toBe(false);
    expect(countActivePlatformNavItems(path)).toBe(1);
    expect(getActivePlatformNavPaths(path)).toEqual([PLATFORM_NAV_PATHS.analytics]);
  });

  it('keeps exactly one active item for each platform section URL', () => {
    const urls = [
      PLATFORM_NAV_PATHS.overview,
      PLATFORM_NAV_PATHS.users,
      PLATFORM_NAV_PATHS.analytics,
      PLATFORM_NAV_PATHS.finance,
      PLATFORM_NAV_PATHS.bfTeam,
      PLATFORM_NAV_PATHS.settings,
      `${PLATFORM_NAV_PATHS.finance}/`,
    ];
    for (const url of urls) {
      expect(countActivePlatformNavItems(url)).toBe(1);
    }
  });

  it('does not keep overview active on nested platform routes', () => {
    for (const url of [
      '/dashboard/platform/finance',
      '/dashboard/platform/analytics',
      '/dashboard/platform/users',
      '/dashboard/platform/settings',
      '/dashboard/platform/team',
    ]) {
      expect(isDashboardNavItemActive(url, '/dashboard/platform')).toBe(false);
    }
  });
});
