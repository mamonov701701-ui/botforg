# Block Library Frontend Implementation

## ✅ Implementation Complete

Successfully implemented dynamic Block Library that fetches blocks from the backend API with plan/role filtering.

## Files Created

### 1. **frontend/src/types/blocks.ts**

TypeScript interfaces for block catalog items:

- `BlockConfigField` - Configuration field definition
- `BlockCatalogItem` - Block catalog item structure
- `PlanType` and `RoleType` - Type aliases

### 2. **frontend/src/api/blocks.ts**

API client functions:

- `fetchBlocksCatalog(plan?, role?)` - Fetches blocks with filters
- `fetchCategories()` - Fetches available categories
- Uses Vite proxy to avoid CORS issues

### 3. **frontend/src/stores/editorStore.ts**

Zustand state management store:

- Catalog state: `catalog`, `plan`, `role`, `isLoading`
- Flow state: `nodes`, `edges`
- Search: `searchQuery`
- Actions: `setPlan`, `setRole`, `loadCatalog`, `setNodes`, `setEdges`
- Computed: `getFilteredCatalog()` for client-side search

### 4. **frontend/src/features/editorV2/BlockLibrary.tsx**

Block library panel component:

- Loads catalog on mount via `loadCatalog()`
- Groups blocks by category with Russian labels
- Drag-and-drop support with `application/block` mime type
- Visual cards with title, description, icon, color
- Loading state and empty state handling

### 5. **frontend/src/features/editorV2/EditorControls.tsx**

Plan/role control panel:

- Plan selector: Free / Pro / Enterprise
- Role selector: Owner / Admin / Manager Template / Developer / Support / Viewer
- Search input for client-side filtering
- Block count display
- Auto-reloads catalog on plan/role change

## Files Modified

### 1. **frontend/package.json**

Added dependency:

```json
"zustand": "^4.x.x"
```

### 2. **frontend/vite.config.js**

Added proxy configuration:

```js
proxy: {
  '/blocks': {
    target: 'http://localhost:8000',
    changeOrigin: true,
  },
}
```

### 3. **frontend/src/features/editorV2/EditorV2Shell.tsx**

Major updates:

- Replaced local state with Zustand store
- Replaced Toolbar with BlockLibrary in left sidebar
- Added EditorControls at top
- Implemented drag-and-drop handlers (`onDragOver`, `onDrop`)
- Node creation uses proper structure with `node.data.settings`
- Layout: Top controls + 3-column grid (Library | Canvas | Settings)

### 4. **frontend/src/features/editorV2/constants.ts**

Removed all hardcoded blocks:

- Deleted `NODE_SPECS` array
- Deleted `CATEGORY_ORDER` array
- Now just a placeholder file

## Category Mapping

Backend categories → Frontend Russian labels:

- `basic` → "Базовые"
- `business` → "Бизнесовые"
- `service` → "Сервисные"
- `system` → "Системные"
- `ai` → "AI"
- `custom` → "Дополнительные"

## Data Structure

### Block in Catalog (from API)

```typescript
{
  id: "message",
  title: "Сообщение",
  category: "basic",
  description: "Отправка текстового сообщения",
  icon: "MessageSquare",
  color: "#2196F3",
  planAccess: ["free", "pro", "enterprise"],
  permissions: ["owner", "admin", "developer", ...],
  configSchema: [...]
}
```

### Node Created on Canvas

```typescript
{
  id: "node_1234567890",
  type: "default",
  position: { x: 100, y: 200 },
  data: {
    label: "Сообщение",           // from block.title
    subtitle: "Отправка...",       // from block.description
    type: "message",               // from block.id
    icon: "MessageSquare",         // from block.icon
    color: "#2196F3",              // from block.color
    settings: {}                   // User config (empty initially)
  }
}
```

## Features Implemented

✅ **Dynamic Block Loading**

- Fetches from GET /blocks API
- No hardcoded blocks in frontend

✅ **Plan/Role Filtering**

- Free plan: 8 blocks (basic + system)
- Pro plan: ~21 blocks (adds business, service, ai)
- Enterprise plan: All 24 blocks
- Role filtering works correctly

✅ **Drag-and-Drop**

- Drag block from library
- Drop on canvas to create node
- Proper position calculation using `screenToFlowPosition`
- Data transfer uses `application/block` mime type

✅ **Search Functionality**

- Client-side filtering by title/description
- Updates in real-time

✅ **UI/UX**

- Russian labels throughout
- Category grouping
- Visual feedback on hover
- Loading states
- Empty states

✅ **State Management**

- Centralized Zustand store
- Persistent plan/role selection
- Reactive updates

## Testing Checklist

- [x] GET /blocks called with plan/role on mount
- [x] Blocks grouped by category correctly
- [x] Cards are draggable
- [x] Drag-and-drop creates nodes with correct structure
- [x] Changing plan updates block list (free → hides business/ai)
- [x] Changing role updates permissions
- [x] Search filters blocks
- [x] No hardcoded blocks in frontend
- [x] All labels in Russian from backend
- [x] Created nodes use `node.data.settings`

## How to Test

1. **Start Backend:**

   ```bash
   cd backend
   python -m uvicorn main:app --reload
   ```

2. **Start Frontend:**

   ```bash
   cd frontend
   npm run dev
   ```

3. **Test Scenarios:**
   - Change plan from "Free" to "Pro" → more blocks appear
   - Change role from "Viewer" to "Owner" → custom blocks appear
   - Drag block from library to canvas → node created
   - Search "сообщение" → filters to message blocks
   - Check browser console for API calls

## API Integration

**Endpoint:** `GET /blocks?plan={plan}&role={role}`

**Frontend Requests:**

```
/blocks?plan=free&role=developer     → 8 blocks
/blocks?plan=pro&role=developer      → 21 blocks
/blocks?plan=enterprise&role=owner   → 24 blocks
```

**Proxy Setup:**

- Development: Vite proxy `/blocks` → `http://localhost:8000`
- Production: Configure reverse proxy or CORS

## Next Steps (Optional Enhancements)

1. **Settings Panel Integration**

   - Use `block.configSchema` to generate forms
   - Save data to `node.data.settings`
   - Validate against schema

2. **Icon System**

   - Map icon names to actual icon components (Lucide React)
   - Display proper icons instead of text

3. **Block Validation**

   - Validate dropped blocks against current plan/role
   - Show warning if block not accessible

4. **Persistence**

   - Save plan/role preferences to localStorage
   - Restore on page load

5. **Advanced Features**
   - Custom blocks for enterprise users
   - Block versioning
   - Block templates
