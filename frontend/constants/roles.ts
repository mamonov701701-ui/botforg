/**
 * User roles constants
 */

export const ROLES = ['owner', 'admin', 'editor', 'viewer'] as const;

export type Role = typeof ROLES[number];
