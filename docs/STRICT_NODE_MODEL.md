# Strict Node Data Model Implementation

## ✅ Implementation Complete

Successfully implemented strict node data model following BotForg specifications with proper field names and validation.

## Key Changes

### 1. Node Structure (STRICT)

**Before (WRONG):**
```typescript
{
  id: `node_${Date.now()}`,  // timestamp ID
  data: {
    label: block.title,       // wrong field name
    subtitle: block.description, // not in spec
    type: block.id,          // wrong field name
    icon: block.icon,
    color: block.color,
    settings: {}
  }
}
```

**After (CORRECT):**
```typescript
{
  id: nanoid(),              // ✅ unique ID
  type: 'default',
  position: { x, y },
  data: {
    blockId: block.id,       // ✅ correct field name
    title: block.title,      // ✅ correct field name
    icon: block.icon,
    color: block.color,
    settings: {}             // ✅ all user config here
  },
  style: {
    borderColor: block.color // ✅ visual styling
  }
}
```

## Data Model Rules

### ✅ Allowed Fields in `node.data`
- `blockId` - Block identifier from catalog
- `title` - Display title
- `icon` - Icon name
- `color` - Block color
- `settings` - **ALL user configuration (object)**

### ❌ Forbidden Fields
- `label` - use `title` instead
- `subtitle` - not in model
- `type` - use `blockId` instead
- Any user config outside `settings`

## Files Modified

### 1. **frontend/src/utils/validateNode.ts** (NEW)
Validation helpers to ensure strict compliance:

```typescript
assertNoUserFieldsOutsideSettings(node: Node): void
validateAllNodes(nodes: Node[]): boolean
debugNodeStructure(node: Node): void
```

### 2. **frontend/src/features/editorV2/EditorV2Shell.tsx**
- ✅ Imported `nanoid`
- ✅ Imported validation helpers
- ✅ Updated `CustomNode` to use `blockId` and `title`
- ✅ Updated `onDrop` to create nodes with correct structure
- ✅ Updated `handleExport` to validate before export
- ✅ Updated `handleNodeChange` to work with `title` and `settings`

### 3. **frontend/src/stores/editorStore.ts**
- ✅ Imported `nanoid`
- ✅ Fixed initial start node with correct structure

### 4. **frontend/src/features/editorV2/SettingsPanel.tsx**
- ✅ Updated props: `blockId`, `title` (not `type`, `label`)
- ✅ Removed type selector (blockId is immutable)
- ✅ JSON editor works with `settings` object
- ✅ Added helper text explaining `node.data.settings`

### 5. **frontend/package.json**
- ✅ Added `nanoid` dependency

## Visual Representation

### Node on Canvas
```
┌─────────────────────────┐
│  🔹 [Title only]        │  ← Visual shows ONLY icon + title
│                         │
│  (no settings visible)  │  ← Settings hidden from visual
└─────────────────────────┘
```

### Node Data Structure
```json
{
  "id": "Xy7_9pqN3",
  "type": "default",
  "position": { "x": 100, "y": 200 },
  "data": {
    "blockId": "message",
    "title": "Сообщение",
    "icon": "MessageSquare",
    "color": "#2196F3",
    "settings": {
      "text": "Hello World!",
      "parseMode": "Markdown"
    }
  },
  "style": {
    "borderColor": "#2196F3"
  }
}
```

## Validation

### Export Validation
When exporting flow schema:
```typescript
if (!validateAllNodes(nodes)) {
  alert('Ошибка: некорректная структура узлов');
  return;
}
```

### Runtime Validation
Each created node is validated:
```typescript
const allowedFields = ['blockId', 'title', 'icon', 'color', 'settings'];
const invalidFields = dataKeys.filter(k => !allowedFields.includes(k));
if (invalidFields.length > 0) {
  throw new Error(`Invalid fields: ${invalidFields.join(', ')}`);
}
```

## Testing Checklist

### ✅ Node Creation
- [x] Drag block from library
- [x] Drop on canvas
- [x] Node created with `nanoid()` ID
- [x] Node has `blockId`, `title`, `icon`, `color`, `settings`
- [x] Node has `style.borderColor`
- [x] No `label`, `subtitle`, or `type` fields

### ✅ Visual Display
- [x] Node shows only title
- [x] No subtitle displayed
- [x] Border color matches block color
- [x] Settings not visible on node

### ✅ Settings Panel
- [x] Shows blockId (read-only)
- [x] Can edit title
- [x] Can edit settings JSON
- [x] No type selector
- [x] Changes update `node.data.settings`

### ✅ Export/Import
- [x] Export validates nodes
- [x] Invalid nodes trigger error
- [x] Valid nodes export successfully
- [x] Exported JSON has correct structure

## Example Flow

### 1. User Drags Block
```typescript
// Library sets drag data
e.dataTransfer.setData('application/block', JSON.stringify({
  id: 'message',
  title: 'Сообщение',
  icon: 'MessageSquare',
  color: '#2196F3',
  // ... other block data
}));
```

### 2. User Drops on Canvas
```typescript
const onDrop = (e) => {
  const block = JSON.parse(e.dataTransfer.getData('application/block'));
  const newNode = {
    id: nanoid(),           // ✅ Unique ID
    type: 'default',
    position: screenToFlowPosition({ x: e.clientX, y: e.clientY }),
    data: {
      blockId: block.id,    // ✅ Correct
      title: block.title,   // ✅ Correct
      icon: block.icon,
      color: block.color,
      settings: {}          // ✅ Empty initially
    },
    style: {
      borderColor: block.color
    }
  };
  setNodes(nds => [...nds, newNode]);
};
```

### 3. User Edits Settings
```typescript
// In SettingsPanel
onChange({ 
  title: "New Title",
  json: '{"text": "Hello", "parseMode": "Markdown"}'
});

// Updates node
{
  data: {
    blockId: "message",     // unchanged
    title: "New Title",     // ✅ updated
    icon: "MessageSquare",  // unchanged
    color: "#2196F3",       // unchanged
    settings: {             // ✅ updated
      text: "Hello",
      parseMode: "Markdown"
    }
  }
}
```

### 4. User Exports
```typescript
handleExport() {
  // Validate first
  if (!validateAllNodes(nodes)) {
    alert('Error: Invalid node structure');
    return;
  }
  
  // Export
  const data = { nodes, edges };
  // ... save to file
}
```

## Migration Guide

### For Existing Nodes

If you have old nodes with `label`, `subtitle`, `type`:

```typescript
// Old format
{
  data: {
    label: "My Block",
    subtitle: "Description",
    type: "message",
    settings: {}
  }
}

// Migrate to new format
{
  data: {
    blockId: "message",     // from old 'type'
    title: "My Block",      // from old 'label'
    icon: "MessageSquare",  // add from catalog
    color: "#2196F3",       // add from catalog
    settings: {}
  },
  style: {
    borderColor: "#2196F3"
  }
}
```

## Benefits

### 1. **Consistency**
- All nodes follow same structure
- No confusion about field names
- Easy to validate

### 2. **Clarity**
- `blockId` clearly indicates block type
- `title` clearly indicates display name
- `settings` clearly contains user config

### 3. **Maintainability**
- Validation catches errors early
- Structure documented and enforced
- Easy to extend with new blocks

### 4. **Separation of Concerns**
- Visual data (title, icon, color) separate from user config
- User config isolated in `settings`
- Styling in `style` object

## Debugging

### Check Node Structure
```typescript
import { debugNodeStructure } from '../../utils/validateNode';

// Log node structure
debugNodeStructure(node);

// Output:
{
  id: "Xy7_9pqN3",
  type: "default",
  position: { x: 100, y: 200 },
  data: {
    blockId: "message",
    title: "Сообщение",
    icon: "MessageSquare",
    color: "#2196F3",
    settings: { ... }
  },
  style: { borderColor: "#2196F3" }
}
```

### Validate Nodes
```typescript
import { validateAllNodes } from '../../utils/validateNode';

if (!validateAllNodes(nodes)) {
  console.error('Some nodes have invalid structure');
  // Check console for details
}
```

## Summary

✅ **Strict compliance with BotForg data model**
✅ **nanoid() for unique IDs**
✅ **Correct field names: blockId, title, icon, color, settings**
✅ **No forbidden fields: label, subtitle, type**
✅ **All user config in node.data.settings**
✅ **Validation on export**
✅ **Debug helpers included**

The implementation now strictly follows the BotForg specification with proper validation and clear separation of concerns.

