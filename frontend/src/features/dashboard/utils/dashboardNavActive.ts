/**
 * Active state for dashboard sidebar NavLink items.
 * Root paths (/dashboard, /dashboard/platform) are exact-match only —
 * they must not stay active on child routes.
 */
export function isDashboardNavItemActive(pathname: string, itemPath: string): boolean {
  const path = normalizePath(pathname);
  const item = normalizePath(itemPath);
  if (path === item) return true;
  if (isExactOnlyNavPath(item)) return false;
  return path.startsWith(`${item}/`);
}

/** Paths that represent a section root and must not match children via prefix. */
export function isExactOnlyNavPath(itemPath: string): boolean {
  const item = normalizePath(itemPath);
  return item === '/dashboard' || item === '/dashboard/platform';
}

export function normalizePath(pathname: string): string {
  if (!pathname) return '/';
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/** Platform mode menu paths used in DashboardLayout (for routing tests). */
export const PLATFORM_NAV_PATHS = {
  overview: '/dashboard/platform',
  users: '/dashboard/platform/users',
  analytics: '/dashboard/platform/analytics',
  finance: '/dashboard/platform/finance',
  legal: '/dashboard/platform/legal',
  bfTeam: '/dashboard/bf-team',
  settings: '/dashboard/platform/settings',
} as const;

/** Project mode finance section paths (user ЛК). */
export const PROJECT_FINANCE_NAV = {
  root: '/dashboard/finance',
  purchases: '/dashboard/finance/purchases',
  refunds: '/dashboard/finance/refunds',
} as const;

export function countActivePlatformNavItems(pathname: string): number {
  return Object.values(PLATFORM_NAV_PATHS).filter(p => isDashboardNavItemActive(pathname, p))
    .length;
}

export function getActivePlatformNavPaths(pathname: string): string[] {
  return Object.values(PLATFORM_NAV_PATHS).filter(p => isDashboardNavItemActive(pathname, p));
}
