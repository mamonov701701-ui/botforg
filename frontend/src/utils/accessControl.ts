import { BlockCatalogItem, PlanType, RoleType } from '../types/blocks';

/**
 * Check if a user can access a specific block based on their plan and role
 */
export function canAccessBlock(
  block: BlockCatalogItem,
  userPlan: PlanType,
  userRole: RoleType
): boolean {
  const hasPlanAccess = block.planAccess.includes(userPlan);
  const hasRolePermission = block.permissions.includes(userRole);
  return hasPlanAccess && hasRolePermission;
}

/**
 * Generate a user-friendly access denied message
 */
export function getAccessDeniedMessage(
  block: BlockCatalogItem,
  userPlan: PlanType,
  userRole: RoleType
): string {
  const hasPlanAccess = block.planAccess.includes(userPlan);
  const hasRolePermission = block.permissions.includes(userRole);
  
  if (!hasPlanAccess) {
    const requiredPlans = block.planAccess
      .filter(p => p !== 'free')
      .map(p => p.toUpperCase())
      .join(' / ');
    return `Блок "${block.title}" доступен только в тарифе ${requiredPlans}`;
  }
  
  if (!hasRolePermission) {
    return `У вас недостаточно прав для использования блока "${block.title}"`;
  }
  
  return 'Доступ запрещён';
}

/**
 * Log access denial to console for analytics and debugging
 */
export function logAccessDenied(
  block: BlockCatalogItem,
  userPlan: PlanType,
  userRole: RoleType,
  action: 'drop' | 'edit' | 'view'
) {
  console.group('🚫 Access Denied');
  console.log('Block:', block.id, '-', block.title);
  console.log('User Plan:', userPlan);
  console.log('Required Plans:', block.planAccess);
  console.log('User Role:', userRole);
  console.log('Required Roles:', block.permissions);
  console.log('Action:', action);
  console.log('Timestamp:', new Date().toISOString());
  console.groupEnd();
  
  // Optional: Send to analytics service in the future
  // analytics.track('block_access_denied', { ... });
}

