# Strict Node Data Model - Implementation Summary

## ✅ Implementation Complete

Successfully refactored the editor to use strict BotForg node data model with proper validation.

## What Was Changed

### 1. **Installed nanoid** ✅

```bash
npm install nanoid
```

- Version: ^5.1.6
- Used for generating unique node IDs

### 2. **Created Validation Utilities** ✅

File: `frontend/src/utils/validateNode.ts`

Functions:

- `assertNoUserFieldsOutsideSettings(node)` - Validates single node
- `validateAllNodes(nodes)` - Validates all nodes
- `debugNodeStructure(node)` - Debug helper

### 3. **Updated EditorV2Shell** ✅

File: `frontend/src/features/editorV2/EditorV2Shell.tsx`

Changes:

- **CustomNode Component:**

  - `data.label` → `data.title` ✅
  - `data.type` → `data.blockId` ✅
  - Removed subtitle display ✅
  - Uses `data.color` for border ✅

- **onDrop Handler:**

  - Uses `nanoid()` for IDs ✅
  - Creates nodes with correct structure ✅
  - Adds `style.borderColor` ✅
  - Logs node structure for debugging ✅

- **handleExport:**

  - Validates nodes before export ✅
  - Shows error if validation fails ✅

- **handleNodeChange:**
  - Works with `title` instead of `label` ✅
  - Updates `settings` from JSON ✅

### 4. **Updated EditorStore** ✅

File: `frontend/src/stores/editorStore.ts`

Changes:

- Imported `nanoid` ✅
- Fixed initial start node:
  ```typescript
  {
    id: nanoid(),
    data: {
      blockId: 'start',
      title: 'Начало',
      icon: 'PlayCircle',
      color: '#4CAF50',
      settings: {}
    },
    style: { borderColor: '#4CAF50' }
  }
  ```

### 5. **Updated SettingsPanel** ✅

File: `frontend/src/features/editorV2/SettingsPanel.tsx`

Changes:

- Props: `blockId`, `title` (not `type`, `label`) ✅
- Removed type selector ✅
- Shows blockId as read-only ✅
- JSON editor for settings ✅
- Helper text explaining node.data.settings ✅

## Node Structure (STRICT)

### ✅ Correct Structure

```typescript
{
  id: nanoid(),              // Unique ID
  type: 'default',
  position: { x, y },
  data: {
    blockId: string,         // Block type (from catalog)
    title: string,           // Display name
    icon: string,            // Icon name
    color: string,           // Block color
    settings: object         // ALL user config
  },
  style: {
    borderColor: string      // Visual styling
  }
}
```

### ❌ Forbidden

- `data.label` (use `data.title`)
- `data.subtitle` (not in model)
- `data.type` (use `data.blockId`)
- Any user config outside `data.settings`

## Validation

### On Export

```typescript
if (!validateAllNodes(nodes)) {
  alert('Ошибка: некорректная структура узлов');
  return;
}
```

### Allowed Fields Check

```typescript
const allowedFields = ['blockId', 'title', 'icon', 'color', 'settings'];
// Throws error if other fields found
```

## Testing

### Test Drag-Drop:

1. Start frontend: `cd frontend && npm run dev`
2. Drag block from library
3. Drop on canvas
4. Open browser console
5. Verify log shows:
   ```
   Node Structure: {
     id: "Xy7_9pqN3",
     data: {
       blockId: "message",
       title: "Сообщение",
       icon: "MessageSquare",
       color: "#2196F3",
       settings: {}
     },
     style: { borderColor: "#2196F3" }
   }
   ```

### Test Validation:

1. Create some nodes
2. Click Export
3. Should export successfully (nodes valid)
4. Check exported JSON structure

### Test Settings:

1. Click on a node
2. Settings panel shows:
   - ID (unique)
   - Блок (blockId)
   - Title (editable)
   - Settings JSON (editable)
3. Edit title → updates node.data.title
4. Edit settings → updates node.data.settings

## Files Summary

### Created:

- ✅ `frontend/src/utils/validateNode.ts`

### Modified:

- ✅ `frontend/package.json` (added nanoid)
- ✅ `frontend/src/features/editorV2/EditorV2Shell.tsx`
- ✅ `frontend/src/stores/editorStore.ts`
- ✅ `frontend/src/features/editorV2/SettingsPanel.tsx`

### Documentation:

- ✅ `docs/STRICT_NODE_MODEL.md`
- ✅ `frontend/STRICT_NODE_MODEL_SUMMARY.md`

## Key Principles

1. **Unique IDs**: Use `nanoid()` not timestamps
2. **Correct Fields**: `blockId`, `title`, `icon`, `color`, `settings`
3. **No Forbidden Fields**: No `label`, `subtitle`, `type`
4. **Settings Only**: All user config in `node.data.settings`
5. **Visual Styling**: `style.borderColor` from block color
6. **Validation**: Check structure on export

## Benefits

✅ **Consistency** - All nodes follow same structure
✅ **Clarity** - Field names are clear and unambiguous
✅ **Validation** - Catches errors before they cause issues
✅ **Maintainability** - Easy to understand and extend
✅ **Compliance** - Follows BotForg specification exactly

## Next Steps

The strict node model is now fully implemented. All new nodes created via drag-drop will follow the correct structure. Future enhancements:

1. Add configSchema-based form generation
2. Implement block-specific validation
3. Add settings templates
4. Support for custom blocks

---

**Status: ✅ COMPLETE**

All nodes now strictly follow the BotForg data model with proper validation and error handling.
