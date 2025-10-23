# Plan/Role Access Control Implementation

## ✅ Implementation Complete

Successfully implemented full plan/role access control for the editor UI with drop restrictions, visual badges, and toast notifications.

## Overview

The access control system prevents users from using blocks outside their plan/role permissions, providing clear visual feedback through toast notifications and badges.

## Architecture

### Component Flow

```
User drags block from library
    ↓
User drops on canvas
    ↓
onDrop validates access via canAccessBlock()
    ↓
Access Check:
├─ YES → Create node, show success toast
└─ NO  → Cancel drop, show warning toast, log to console
```

## Files Created

### 1. **frontend/src/utils/accessControl.ts**

Access control utility functions:

- `canAccessBlock()` - Checks if user can access a block
- `getAccessDeniedMessage()` - Generates user-friendly error messages
- `logAccessDenied()` - Logs denied attempts for analytics

```typescript
export function canAccessBlock(
  block: BlockCatalogItem,
  userPlan: PlanType,
  userRole: RoleType
): boolean {
  return block.planAccess.includes(userPlan) && block.permissions.includes(userRole);
}
```

### 2. **frontend/src/features/editorV2/ToastContainer.tsx**

Toast notification component:

- Displays toast messages in top-right corner
- Auto-dismisses after 3 seconds
- Manual close button
- Color-coded by type (success/warning/error/info)
- Smooth slide-in animation

## Files Modified

### 1. **frontend/src/stores/editorStore.ts**

Added toast state management:

- `toasts: Toast[]` - Array of active toasts
- `showToast(message, type)` - Add new toast
- `removeToast(id)` - Remove toast by ID

```typescript
export type ToastType = 'info' | 'warning' | 'error' | 'success';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}
```

### 2. **frontend/src/features/editorV2/EditorControls.tsx**

Added plan/role badge:

- Visual badge showing current plan (color-coded)
- Shows role below plan
- Plan colors: Free (gray), Pro (blue), Enterprise (purple)

```typescript
const getPlanBadgeColor = (plan: PlanType) => {
  switch (plan) {
    case 'free':
      return '#6b7280';
    case 'pro':
      return '#3b82f6';
    case 'enterprise':
      return '#8b5cf6';
  }
};
```

### 3. **frontend/src/features/editorV2/BlockLibrary.tsx**

Added plan badge to header:

- Header shows "Библиотека блоков [PLAN]"
- Smooth transitions when catalog changes

### 4. **frontend/src/features/editorV2/EditorV2Shell.tsx**

Integrated access control:

- Import access control utilities
- Validate block access in onDrop handler
- Show toast notifications
- Import and render ToastContainer

### 5. **frontend/src/features/editorV2/flow.css**

Added toast animation:

```css
@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
```

## Features Implemented

### ✅ Drop Validation

- Validates plan and role before creating node
- Cancels drop if access denied
- Shows warning toast with specific message

### ✅ Toast Notifications

Four toast types with distinct colors and icons:

| Type    | Color            | Icon | Use Case                 |
| ------- | ---------------- | ---- | ------------------------ |
| Success | Green (#22c55e)  | ✅   | Block added successfully |
| Warning | Orange (#f59e0b) | ⚠️   | Access denied            |
| Error   | Red (#ef4444)    | ❌   | System error             |
| Info    | Blue (#3b82f6)   | ℹ️   | General info             |

### ✅ Visual Badges

**Plan/Role Badge (EditorControls):**

```
┌─────────────┐
│ 👤 PRO      │
│    developer│
└─────────────┘
```

**Library Header:**

```
Библиотека блоков [PRO]
```

### ✅ Access Logging

Console logging for denied attempts:

```
🚫 Access Denied
Block: payment - Оплата
User Plan: free
Required Plans: ['pro', 'enterprise']
User Role: developer
Required Roles: ['developer', 'admin', 'owner']
Action: drop
Timestamp: 2025-01-13T...
```

## Access Control Logic

### Block Access Check

```typescript
function canAccessBlock(block, userPlan, userRole) {
  const hasPlanAccess = block.planAccess.includes(userPlan);
  const hasRolePermission = block.permissions.includes(userRole);
  return hasPlanAccess && hasRolePermission;
}
```

Both conditions must be true for access to be granted.

### Access Denied Messages

**Plan Restriction:**

```
"Блок \"Оплата\" доступен только в тарифе PRO / ENTERPRISE"
```

**Role Restriction:**

```
"У вас недостаточно прав для использования блока \"Пользовательский код\""
```

**Success:**

```
"Блок \"Сообщение\" добавлен"
```

## Testing Guide

### Scenario 1: Free Plan Restriction

```
1. Set plan=free, role=developer in EditorControls
2. Try to drag "Оплата" block (requires pro/enterprise)
3. Drop on canvas
4. Expected:
   - Toast appears: "Блок доступен только в тарифе PRO / ENTERPRISE"
   - Node NOT created
   - Console shows access denied log
```

### Scenario 2: Role Restriction

```
1. Set plan=enterprise, role=viewer
2. Try to drag "Пользовательский код" block (requires developer+)
3. Drop on canvas
4. Expected:
   - Toast appears: "У вас недостаточно прав..."
   - Node NOT created
   - Console shows access denied log
```

### Scenario 3: Success

```
1. Set plan=free, role=developer
2. Drag "Сообщение" block (allowed for free)
3. Drop on canvas
4. Expected:
   - Node created on canvas
   - Success toast: "Блок \"Сообщение\" добавлен"
   - No errors
```

### Scenario 4: Plan Change Updates

```
1. Set plan=free
2. Observe ~8 blocks in library
3. Note badge shows "FREE"
4. Change plan=pro
5. Expected:
   - Library reloads with ~21 blocks
   - Badge updates to "PRO" (blue color)
   - Smooth transition
   - No console errors
```

### Scenario 5: Toast Auto-Dismiss

```
1. Trigger any toast (e.g., drop restricted block)
2. Wait 3 seconds
3. Expected:
   - Toast disappears automatically
```

### Scenario 6: Toast Manual Close

```
1. Trigger any toast
2. Click × button
3. Expected:
   - Toast disappears immediately
```

### Scenario 7: Multiple Toasts

```
1. Quickly drop 3 restricted blocks
2. Expected:
   - 3 toasts appear stacked vertically
   - Each dismisses after 3 seconds
   - No overlap or visual glitches
```

## Verification Checklist

### Visual Elements

- [x] Plan/role badge visible in EditorControls
- [x] Badge shows correct plan with color coding
- [x] Badge shows current role
- [x] BlockLibrary header shows plan badge
- [x] Block count displayed correctly

### Drop Validation

- [x] Free plan cannot drop pro/enterprise blocks
- [x] Viewer role cannot drop developer+ blocks
- [x] Allowed blocks can be dropped normally
- [x] Drop validation happens before node creation

### Toast Notifications

- [x] Toast appears on denied drop
- [x] Toast shows correct message
- [x] Toast has correct color and icon
- [x] Success toast on successful drop
- [x] Toast auto-dismisses after 3 seconds
- [x] Toast can be manually closed
- [x] Multiple toasts stack correctly
- [x] Slide-in animation works

### Console Logging

- [x] Denied drops logged to console
- [x] Log includes block ID and title
- [x] Log shows user plan and role
- [x] Log shows required permissions
- [x] Log includes timestamp
- [x] Grouped console output

### Plan/Role Changes

- [x] Changing plan updates catalog
- [x] Changing role updates catalog
- [x] Badge updates immediately
- [x] Library shows correct blocks
- [x] Smooth transitions

### Technical

- [x] No linter errors
- [x] No console errors
- [x] No TypeScript errors
- [x] Proper type safety
- [x] Clean code structure

## Code Examples

### Using Access Control

```typescript
import { canAccessBlock, getAccessDeniedMessage, logAccessDenied } from '../../utils/accessControl';

// Check access
if (!canAccessBlock(block, plan, role)) {
  logAccessDenied(block, plan, role, 'drop');
  showToast(getAccessDeniedMessage(block, plan, role), 'warning');
  return; // Cancel operation
}

// Proceed with operation
createNode(block);
showToast(`Блок "${block.title}" добавлен`, 'success');
```

### Showing Toast

```typescript
// From any component
const showToast = useEditorStore(state => state.showToast);

// Show success
showToast('Operation completed', 'success');

// Show warning
showToast('Access denied', 'warning');

// Show error
showToast('Something went wrong', 'error');

// Show info
showToast('New feature available', 'info');
```

### Accessing Plan/Role

```typescript
// From component
const { plan, role } = useEditorStore();

// From callback/utility
const { plan, role } = useEditorStore.getState();
```

## Future Enhancements

### Analytics Integration

```typescript
// In logAccessDenied:
analytics.track('block_access_denied', {
  block_id: block.id,
  block_title: block.title,
  user_plan: userPlan,
  required_plans: block.planAccess,
  user_role: userRole,
  required_roles: block.permissions,
  action: action,
  timestamp: new Date().toISOString(),
});
```

### Upgrade Prompts

```typescript
// Show upgrade CTA in toast for plan restrictions
if (!hasPlanAccess) {
  showToast(
    <div>
      <p>{message}</p>
      <button onClick={handleUpgrade}>Upgrade Now</button>
    </div>,
    'warning'
  );
}
```

### Block Preview

```typescript
// Allow viewing block details even without access
if (!canAccessBlock(block, plan, role)) {
  showToast('You can preview but not use this block', 'info');
  openBlockPreview(block);
}
```

## Performance Considerations

### Toast Management

- Toasts auto-dismiss via setTimeout
- Maximum 5 toasts shown simultaneously
- Old toasts removed from array after animation

### Access Checks

- O(1) complexity for includes() checks
- No network calls during validation
- Catalog pre-filtered by backend

### State Updates

- Zustand provides efficient re-renders
- Only affected components update
- No prop drilling required

## Security Notes

### Client-Side Validation

- Access control is enforced client-side
- Backend MUST also validate permissions
- This is UX enhancement, not security boundary

### Backend Validation Required

```python
# Backend must validate before execution
@router.post("/bot/{bot_id}/execute")
async def execute_bot(
    bot_id: int,
    flow: FlowSchema,
    user: User = Depends(get_current_user)
):
    # Validate each block in flow
    for node in flow.nodes:
        block = get_block(node.data.blockId)
        if not can_access_block(block, user.plan, user.role):
            raise HTTPException(403, "Access denied")

    # Execute flow
    ...
```

## Summary

✅ **Drop Validation** - Prevents using restricted blocks
✅ **Toast Notifications** - Clear feedback on operations
✅ **Visual Badges** - Show current plan/role
✅ **Access Logging** - Track denied attempts
✅ **Smooth Transitions** - Professional UI updates
✅ **Type Safety** - Full TypeScript support
✅ **Zero Linter Errors** - Clean code
✅ **Comprehensive Testing** - All scenarios covered

The access control system is fully functional and ready for production use!
