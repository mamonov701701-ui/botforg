# Dynamic Block Settings Panel

## ✅ Implementation Complete

Successfully implemented a dynamic Block Settings Panel that renders forms based on each block's configSchema from the catalog.

## Overview

The BlockSettingsPanel replaces the generic SettingsPanel with schema-driven form generation. It reads the block's `configSchema` from the catalog and renders appropriate input fields for each configuration option.

## Architecture

### Component Structure

```
BlockSettingsPanel/
├── index.tsx              # Main panel component
├── FieldRenderer.tsx      # Field type switch
└── fields/
    ├── types.ts           # Shared TypeScript types
    ├── StringField.tsx    # Text input
    ├── TextField.tsx      # Textarea
    ├── NumberField.tsx    # Number input
    ├── BooleanField.tsx   # Checkbox
    ├── SelectField.tsx    # Dropdown
    ├── MultiselectField.tsx # Multi-select checkboxes
    ├── JsonField.tsx      # JSON editor with validation
    └── DurationField.tsx  # Duration (amount + unit)
```

## Features

### 1. **Dynamic Form Generation**

- Reads block definition from catalog by `node.data.blockId`
- Generates form fields from `block.configSchema`
- Each field type renders with appropriate UI

### 2. **Supported Field Types**

| Type          | Component        | Description                 |
| ------------- | ---------------- | --------------------------- |
| `string`      | StringField      | Single-line text input      |
| `text`        | TextField        | Multi-line textarea         |
| `number`      | NumberField      | Numeric input               |
| `boolean`     | BooleanField     | Checkbox                    |
| `select`      | SelectField      | Dropdown with options       |
| `multiselect` | MultiselectField | Multiple checkboxes         |
| `json`        | JsonField        | JSON editor with validation |
| `duration`    | DurationField    | Amount + unit selector      |
| `datetime`    | Placeholder      | Coming soon                 |
| `image`       | Placeholder      | Coming soon                 |
| `file`        | Placeholder      | Coming soon                 |

### 3. **Live Updates**

- Changes update `node.data.settings` immediately
- No save button required
- Uses Zustand store for persistence
- React Flow re-renders automatically

### 4. **Validation**

- Required fields show red asterisk (\*)
- Empty required fields show error message
- JSON fields validate parse errors
- Errors display below fields in red

### 5. **Panel Header**

- Shows block title from catalog
- Shows block description
- Displays node ID for reference

### 6. **Inspect Feature**

- 🔍 Inspect button logs node data to console
- Shows node.data.settings structure
- Useful for debugging

## Data Flow

```
1. User clicks node on canvas
   ↓
2. EditorV2Shell sets selectedNode
   ↓
3. BlockSettingsPanel receives selectedNode
   ↓
4. Find block in catalog by node.data.blockId
   ↓
5. Render form from block.configSchema
   ↓
6. User edits field
   ↓
7. handleFieldChange updates node.data.settings[fieldName]
   ↓
8. Zustand setNodes persists to store
   ↓
9. React Flow re-renders with new data
```

## Field Components

### StringField

```typescript
// Simple text input
<input type="text" value={value || ''} onChange={...} />
```

### TextField

```typescript
// Multi-line textarea
<textarea rows={4} value={value || ''} onChange={...} />
```

### NumberField

```typescript
// Numeric input
<input type="number" value={value ?? ''} onChange={...} />
```

### BooleanField

```typescript
// Checkbox
<input type="checkbox" checked={value || false} onChange={...} />
```

### SelectField

```typescript
// Dropdown with options from configSchema
<select value={value || ''} onChange={...}>
  <option value="">-- Выберите --</option>
  {field.options?.map(opt => (
    <option key={opt} value={opt}>{opt}</option>
  ))}
</select>
```

### MultiselectField

```typescript
// Multiple checkboxes for array values
{
  field.options?.map(opt => (
    <input
      type="checkbox"
      checked={selectedValues.includes(opt)}
      onChange={() => toggleOption(opt)}
    />
  ));
}
```

### JsonField

```typescript
// JSON editor with parse validation
<textarea
  value={jsonString}
  onChange={e => {
    try {
      const parsed = JSON.parse(e.target.value);
      onChange(parsed);
      setParseError('');
    } catch (e) {
      setParseError('Неверный JSON');
    }
  }}
  style={{ fontFamily: 'monospace' }}
/>
```

### DurationField

```typescript
// Amount + unit selector
<input type="number" value={amount} onChange={...} />
<select value={unit} onChange={...}>
  <option value="seconds">секунд</option>
  <option value="minutes">минут</option>
  <option value="hours">часов</option>
  <option value="days">дней</option>
</select>
```

## Example Block Schema

```json
{
  "id": "message",
  "title": "Сообщение",
  "description": "Отправка текстового сообщения",
  "configSchema": [
    {
      "name": "text",
      "type": "text",
      "label": "Текст сообщения",
      "required": true
    },
    {
      "name": "parseMode",
      "type": "select",
      "label": "Режим парсинга",
      "required": false,
      "options": ["Markdown", "HTML", "Plain"],
      "default": "Plain"
    },
    {
      "name": "disablePreview",
      "type": "boolean",
      "label": "Отключить превью ссылок",
      "required": false,
      "default": false
    }
  ]
}
```

## Example Node Settings

After user edits, `node.data.settings` contains:

```json
{
  "text": "Привет! Как дела?",
  "parseMode": "Markdown",
  "disablePreview": false
}
```

## Validation Rules

### Required Fields

```typescript
if (field.required && (value === null || value === undefined || value === '')) {
  return 'Обязательное поле';
}
```

### JSON Validation

```typescript
try {
  JSON.parse(jsonString);
  // Valid
} catch (e) {
  // Show error: "Неверный JSON"
}
```

## Integration with EditorV2Shell

### Before (Old SettingsPanel):

```typescript
<SettingsPanel
  selectedId={selectedNode.id}
  blockId={selectedNode.data?.blockId}
  title={selectedNode.data?.title}
  json={JSON.stringify(selectedNode.data?.settings, null, 2)}
  onChange={handleNodeChange}
  onSave={handleSaveNode}
  onDelete={handleDeleteNode}
  onDuplicate={handleDuplicateNode}
/>
```

### After (New BlockSettingsPanel):

```typescript
<BlockSettingsPanel
  selectedNode={selectedNode}
  onClose={() => setSelectedNodeId(undefined)}
  onDelete={handleDeleteNode}
  onDuplicate={handleDuplicateNode}
/>
```

## Benefits

### 1. **Type Safety**

- Each field type has appropriate validation
- Number fields only accept numbers
- Select fields only allow options
- JSON fields validate syntax

### 2. **User Experience**

- Intuitive UI for each data type
- Clear labels and required indicators
- Immediate feedback on errors
- No manual JSON editing required

### 3. **Maintainability**

- Schema-driven, no hardcoded forms
- Add new blocks without code changes
- Consistent UI across all blocks
- Easy to extend with new field types

### 4. **Data Integrity**

- All data in `node.data.settings`
- Validated before storage
- Type-appropriate values
- No invalid JSON

## Testing Checklist

### ✅ Basic Functionality

- [x] Click node → panel opens
- [x] Panel shows block title and description
- [x] Form fields match configSchema
- [x] Required fields show asterisk
- [x] Changes update node.data.settings live

### ✅ Field Types

- [x] String field works
- [x] Text field (textarea) works
- [x] Number field validates numbers
- [x] Boolean field toggles
- [x] Select field shows options
- [x] Multiselect allows multiple values
- [x] JSON field validates and pretty-prints
- [x] Duration field has amount + unit

### ✅ Validation

- [x] Required fields show error when empty
- [x] JSON fields show parse errors
- [x] Errors display in red below fields
- [x] Valid input clears errors

### ✅ Actions

- [x] Inspect button logs to console
- [x] Delete button removes node
- [x] Duplicate button copies node
- [x] Close button closes panel

### ✅ Edge Cases

- [x] Block not found → shows error message
- [x] No configSchema → shows "no settings" message
- [x] Switching nodes → form updates correctly
- [x] Default values work correctly

## Future Enhancements

1. **DateTime Picker**

   - Calendar/time selector
   - Timezone support
   - Format options

2. **Image Upload**

   - Drag-and-drop
   - Preview thumbnail
   - URL input

3. **File Upload**

   - Multiple file support
   - File type validation
   - Size limits

4. **Advanced Validation**

   - Custom regex patterns
   - Min/max length
   - Custom validators

5. **Field Dependencies**
   - Show/hide based on other fields
   - Dynamic options
   - Conditional validation

## Debug Tips

### Inspect Node Data

```typescript
// Click "🔍 Inspect" button in panel
// Console output:
{
  "Node ID": "Xy7_9pqN3",
  "Block ID": "message",
  "Block Title": "Сообщение",
  "Settings": {
    "text": "Hello",
    "parseMode": "Markdown"
  },
  "Full Node": { ... }
}
```

### Check Field Values

```typescript
// In BlockSettingsPanel
console.log('Field value:', selectedNode.data.settings?.[field.name]);
console.log('Field default:', field.default);
```

### Validate Settings Structure

```typescript
import { validateAllNodes } from '../../utils/validateNode';

if (!validateAllNodes(nodes)) {
  console.error('Invalid node structure detected');
}
```

## Summary

✅ **Dynamic form generation from configSchema**
✅ **8 field types implemented (+ 3 placeholders)**
✅ **Live updates to node.data.settings**
✅ **Validation with error display**
✅ **Inspect feature for debugging**
✅ **Clean, maintainable architecture**
✅ **Type-safe field components**
✅ **Consistent styling**

The Block Settings Panel provides a powerful, schema-driven interface for configuring blocks without manual JSON editing, improving user experience and data integrity.
